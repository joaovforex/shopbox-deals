import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Plus, Minus, Trash2, Search, Copy, ExternalLink, Crown } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { getRoleSummary, type RoleSummary } from "@/lib/products";
import { createManualSale, type ManualPaymentMethod } from "@/lib/manual-sale.functions";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/venda-manual")({
  head: () => ({ meta: [{ title: "Venda manual · shopbox" }] }),
  component: ManualSalePage,
});

type ProductRow = {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  color_variants: Array<{ color: string; stock: number }> | null;
};

type CartLine = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  color: string | null;
  image_url: string | null;
  max_stock: number;
};

function ManualSalePage() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<RoleSummary | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [delivery, setDelivery] = useState<"pickup" | "delivery">("pickup");
  const [payment, setPayment] = useState<ManualPaymentMethod>("mercadopago");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ orderId: string; initPoint: string | null } | null>(null);

  const submit = useServerFn(createManualSale);

  useEffect(() => { getRoleSummary().then(setRoles); }, []);

  useEffect(() => {
    if (roles && !roles.isSuperAdmin) navigate({ to: "/admin", replace: true });
  }, [roles, navigate]);

  // busca debounced
  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    let cancel = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, price, stock, image_url, color_variants")
        .eq("active", true)
        .ilike("name", `%${search.trim()}%`)
        .limit(12);
      if (!cancel) {
        setResults((data ?? []) as unknown as ProductRow[]);
        setSearching(false);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [search]);

  const total = useMemo(
    () => cart.reduce((acc, l) => acc + l.unit_price * l.quantity, 0),
    [cart],
  );

  const addToCart = (p: ProductRow, color: string | null) => {
    const variant = color
      ? (p.color_variants ?? []).find((v) => v.color === color)
      : null;
    const maxStock = variant ? variant.stock : p.stock;
    if (maxStock < 1) { toast.error("Sem estoque"); return; }
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product_id === p.id && l.color === color);
      if (idx >= 0) {
        const next = [...prev];
        const newQty = Math.min(maxStock, next[idx].quantity + 1);
        next[idx] = { ...next[idx], quantity: newQty };
        return next;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name + (color ? ` (${color})` : ""),
          unit_price: Number(p.price),
          quantity: 1,
          color,
          image_url: p.image_url,
          max_stock: maxStock,
        },
      ];
    });
    setSearch("");
    setResults([]);
  };

  const setQty = (i: number, q: number) => {
    setCart((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], quantity: Math.max(1, Math.min(next[i].max_stock, q)) };
      return next;
    });
  };

  const removeLine = (i: number) =>
    setCart((prev) => prev.filter((_, idx) => idx !== i));

  const generateLink = async () => {
    if (cart.length === 0) return toast.error("Adicione produtos");
    if (customerName.trim().length < 2) return toast.error("Informe o nome do cliente");
    const phoneDigits = customerPhone.replace(/\D/g, "");
    if (!/^[0-9]{10,11}$/.test(phoneDigits)) return toast.error("Telefone inválido");
    setGenerating(true);
    try {
      const r = await submit({
        data: {
          customer_name: customerName.trim(),
          customer_phone: phoneDigits,
          delivery_method: delivery,
          items: cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity, color: l.color })),
        },
      });
      setResult({ orderId: r.orderId, initPoint: r.initPoint });
      toast.success("Cobrança gerada!");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar cobrança");
    } finally {
      setGenerating(false);
    }
  };

  const reset = () => {
    setResult(null);
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
  };

  if (!roles) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">Carregando...</div>
      </div>
    );
  }

  if (!roles.isSuperAdmin) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent font-bold inline-flex items-center gap-2">
              <Crown className="h-3.5 w-3.5" /> Super Admin
            </div>
            <h1 className="display text-3xl">Venda manual</h1>
            <p className="text-sm text-muted-foreground">
              Monte o pedido presencial, gere a cobrança Mercado Pago e envie o link/Pix ao cliente.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-4">
          {!result && (
            <div className="bg-card border border-border rounded-lg p-4">
              <label className="block text-xs font-bold uppercase tracking-wider mb-2">
                Adicionar produto
              </label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Digite o nome do produto..."
                  className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background"
                />
              </div>
              {searching && <p className="text-xs text-muted-foreground mt-2">Buscando...</p>}
              {results.length > 0 && (
                <ul className="mt-3 divide-y divide-border border border-border rounded-md max-h-80 overflow-auto">
                  {results.map((p) => {
                    const variants = (p.color_variants ?? []).filter((v) => v.stock > 0);
                    const hasVariants = variants.length > 0;
                    return (
                      <li key={p.id} className="p-3 flex gap-3 items-center">
                        {p.image_url && (
                          <img src={p.image_url} alt="" className="h-12 w-12 rounded object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {brl(p.price)} · estoque {hasVariants ? variants.reduce((a, v) => a + v.stock, 0) : p.stock}
                          </p>
                        </div>
                        {hasVariants ? (
                          <select
                            onChange={(e) => {
                              if (e.target.value) addToCart(p, e.target.value);
                              e.currentTarget.selectedIndex = 0;
                            }}
                            className="text-xs border border-border rounded px-2 py-1.5 bg-background"
                          >
                            <option value="">Escolher cor</option>
                            {variants.map((v) => (
                              <option key={v.color} value={v.color}>{v.color} ({v.stock})</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => addToCart(p, null)}
                            disabled={p.stock < 1}
                            className="inline-flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded text-xs font-bold uppercase disabled:opacity-50"
                          >
                            <Plus className="h-3 w-3" /> Add
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="bg-card border border-border rounded-lg p-4">
            <h2 className="font-black uppercase text-sm tracking-wider mb-3">
              Itens ({cart.length})
            </h2>
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum produto adicionado.</p>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((l, i) => (
                  <li key={i} className="py-3 flex items-center gap-3">
                    {l.image_url && (
                      <img src={l.image_url} alt="" className="h-12 w-12 rounded object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{l.name}</p>
                      <p className="text-xs text-muted-foreground">{brl(l.unit_price)} un.</p>
                    </div>
                    {!result && (
                      <div className="inline-flex items-center border border-border rounded">
                        <button onClick={() => setQty(i, l.quantity - 1)} className="p-1.5"><Minus className="h-3 w-3" /></button>
                        <span className="px-2 text-sm font-bold">{l.quantity}</span>
                        <button onClick={() => setQty(i, l.quantity + 1)} className="p-1.5"><Plus className="h-3 w-3" /></button>
                      </div>
                    )}
                    <div className="text-sm font-black w-20 text-right">{brl(l.unit_price * l.quantity)}</div>
                    {!result && (
                      <button onClick={() => removeLine(i)} className="text-destructive p-1.5">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 pt-3 border-t border-border flex justify-between text-lg font-black">
              <span>Total</span><span>{brl(total)}</span>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          {!result ? (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h2 className="font-black uppercase text-sm tracking-wider">Cliente</h2>
              <div>
                <label className="block text-xs font-bold mb-1">Nome</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Telefone (com DDD)</label>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="41999999999"
                  className="w-full px-3 py-2 border border-border rounded bg-background"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Entrega</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDelivery("pickup")}
                    className={`px-3 py-2 rounded border text-xs font-bold uppercase ${delivery === "pickup" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                  >Retirada</button>
                  <button
                    type="button"
                    onClick={() => setDelivery("delivery")}
                    className={`px-3 py-2 rounded border text-xs font-bold uppercase ${delivery === "delivery" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                  >Entrega</button>
                </div>
              </div>
              <button
                onClick={generateLink}
                disabled={generating || cart.length === 0}
                className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md shadow-deal disabled:opacity-50"
              >
                {generating ? "Gerando..." : "Gerar cobrança Mercado Pago"}
              </button>
              <p className="text-[11px] text-muted-foreground">
                O estoque é reservado e o pedido entra como pendente. Quando o cliente pagar, ele entra automaticamente em Expedição.
              </p>
            </div>
          ) : (
            <div className="bg-card border-2 border-primary rounded-lg p-4 space-y-3">
              <h2 className="font-black uppercase text-sm tracking-wider text-primary">Cobrança pronta</h2>
              <p className="text-xs text-muted-foreground">
                Envie este link ao cliente. Ele pode pagar via Pix ou cartão.
              </p>
              <div className="bg-muted rounded p-2 text-xs break-all">{result.initPoint}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.initPoint);
                    toast.success("Link copiado");
                  }}
                  className="inline-flex items-center justify-center gap-1 bg-primary text-primary-foreground px-3 py-2 rounded text-xs font-bold uppercase"
                >
                  <Copy className="h-3 w-3" /> Copiar
                </button>
                <a
                  href={result.initPoint}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 border border-border px-3 py-2 rounded text-xs font-bold uppercase"
                >
                  <ExternalLink className="h-3 w-3" /> Abrir
                </a>
              </div>
              <Link
                to="/pedido/$id"
                params={{ id: result.orderId }}
                className="block text-center text-xs font-bold uppercase text-primary"
              >
                Ver pedido
              </Link>
              <button
                onClick={reset}
                className="w-full border border-border px-3 py-2 rounded text-xs font-bold uppercase"
              >
                Nova venda manual
              </button>
            </div>
          )}
        </aside>
      </section>

      <Footer />
    </div>
  );
}
