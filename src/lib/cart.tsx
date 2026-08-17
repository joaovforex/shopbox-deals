import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { reserveCartLastStock, releaseCartReservation, listMyReservations } from "@/lib/cart-reservations.functions";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  variant_color?: string | null;
  reserved_until?: string | null;
  unidade_id?: string | null;
};

export function cartItemKey(item: { id: string; variant_color?: string | null }): string {
  return item.variant_color ? `${item.id}::${item.variant_color}` : item.id;
}

type AddResult = "ok" | "out_of_stock" | "error";

type CartCtx = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity" | "reserved_until">, qty?: number) => Promise<AddResult>;
  remove: (key: string) => Promise<void>;
  setQty: (key: string, qty: number) => Promise<void>;
  clear: () => Promise<void>;
  total: number;
  count: number;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "shopbox_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const itemsRef = useRef<CartItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  }, [items]);

  // Periodically reconcile reservations with server: drop expired items
  useEffect(() => {
    const tick = async () => {
      const has = itemsRef.current.some((i) => i.reserved_until);
      if (!has) return;
      try {
        const server = await listMyReservations();
        const active = new Map<string, string>(); // key -> expires_at
        for (const r of server as Array<{ product_id: string; variant_color: string | null; expires_at: string }>) {
          const k = r.variant_color ? `${r.product_id}::${r.variant_color}` : r.product_id;
          active.set(k, r.expires_at);
        }
        setItems((prev) => {
          const next: CartItem[] = [];
          let dropped = 0;
          for (const it of prev) {
            const k = cartItemKey(it);
            if (it.reserved_until) {
              const srv = active.get(k);
              if (!srv) { dropped++; continue; }
              next.push({ ...it, reserved_until: srv });
            } else {
              next.push(it);
            }
          }
          if (dropped > 0) toast.warning(`${dropped} reserva(s) do carrinho expirou — item devolvido ao estoque`);
          return next;
        });
      } catch {}
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const add: CartCtx["add"] = useCallback(async (item, qty = 1) => {
    const existing = itemsRef.current.find((i) => cartItemKey(i) === cartItemKey(item));
    const desiredQty = (existing?.quantity ?? 0) + qty;
    try {
      const { status } = await reserveCartLastStock({
        data: {
          productId: item.id,
          variantColor: item.variant_color ?? null,
          quantity: desiredQty,
        },
      });
      if (status === "out_of_stock" || status === "insufficient_stock") {
        toast.error("Produto esgotado");
        return "out_of_stock";
      }
      if (status === "invalid_color" || status === "not_found") {
        toast.error("Produto indisponível");
        return "error";
      }
      // status === "reserved" | "kept_reservation" | "not_last"
      const reservedUntil = status === "reserved" || status === "kept_reservation"
        ? new Date(Date.now() + 5 * 60 * 1000).toISOString()
        : null;
      setItems((prev) => {
        const k = cartItemKey(item);
        const ex = prev.find((i) => cartItemKey(i) === k);
        if (ex) {
          return prev.map((i) => cartItemKey(i) === k ? { ...i, quantity: i.quantity + qty, reserved_until: reservedUntil ?? i.reserved_until ?? null } : i);
        }
        return [...prev, { ...item, quantity: qty, reserved_until: reservedUntil }];
      });
      if (reservedUntil) {
        toast.success("Item reservado para você por 5 minutos");
      }
      return "ok";
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao reservar estoque");
      return "error";
    }
  }, []);

  const releaseIfNeeded = async (it: CartItem | undefined) => {
    if (!it?.reserved_until) return;
    try {
      await releaseCartReservation({
        data: { productId: it.id, variantColor: it.variant_color ?? null },
      });
    } catch {}
  };

  const remove: CartCtx["remove"] = useCallback(async (key) => {
    const it = itemsRef.current.find((i) => cartItemKey(i) === key);
    setItems((p) => p.filter((i) => cartItemKey(i) !== key));
    await releaseIfNeeded(it);
  }, []);

  const setQty: CartCtx["setQty"] = useCallback(async (key, qty) => {
    const it = itemsRef.current.find((i) => cartItemKey(i) === key);
    if (!it) return;
    const nextQty = Math.max(1, qty);
    if (it.reserved_until) {
      // Re-reserve with new quantity
      try {
        const { status } = await reserveCartLastStock({
          data: {
            productId: it.id,
            variantColor: it.variant_color ?? null,
            quantity: nextQty,
          },
        });
        if (status === "out_of_stock" || status === "insufficient_stock") {
          toast.error("Quantidade indisponível");
          return;
        }
      } catch {}
    }
    setItems((p) => p.map((i) => cartItemKey(i) === key ? { ...i, quantity: nextQty } : i));
  }, []);

  const clear: CartCtx["clear"] = useCallback(async () => {
    const snapshot = itemsRef.current;
    setItems([]);
    await Promise.all(snapshot.map((i) => releaseIfNeeded(i)));
  }, []);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return <Ctx.Provider value={{ items, add, remove, setQty, clear, total, count }}>{children}</Ctx.Provider>;
}

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
};
