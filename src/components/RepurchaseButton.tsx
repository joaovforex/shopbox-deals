import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getRepurchasePlan } from "@/lib/account.functions";
import { useCart } from "@/lib/cart";
import { trackAddToCart, toAnalyticsItem } from "@/lib/analytics";

const REASON_LABEL: Record<string, string> = {
  removed: "não está mais no catálogo",
  inactive: "não está mais à venda",
  out_of_stock: "está sem estoque",
  variant_gone: "está sem a cor que você comprou",
};

/**
 * "Comprar novamente": relê preço, estoque e variante ATUAIS no servidor
 * (`getRepurchasePlan`) e adiciona ao carrinho pela mesma função `add`, que já
 * reserva estoque. Nunca reutiliza o preço antigo do pedido.
 */
export function RepurchaseButton({
  orderId,
  className,
}: {
  orderId: string;
  className?: string;
}) {
  const plan = useServerFn(getRepurchasePlan);
  const { add } = useCart();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { items } = await plan({ data: { orderId } });
      const unavailable = items.filter((i) => !i.available);
      const available = items.filter((i) => i.available && i.product);

      if (available.length === 0) {
        toast.error(
          unavailable.length === 1 && unavailable[0]
            ? `${unavailable[0].requested_name} ${REASON_LABEL[unavailable[0].reason] ?? "não está disponível"}.`
            : "Nenhum item deste pedido está disponível hoje.",
        );
        return;
      }

      const added: string[] = [];
      const failed: string[] = [];
      for (const it of available) {
        const p = it.product!;
        const qty = Math.min(it.requested_quantity, p.stock);
        const res = await add(
          {
            id: p.id,
            name: p.name,
            price: p.price,
            image_url: p.image_url,
            variant_color: p.variant_color,
            unidade_id: p.unidade_id,
          },
          Math.max(1, qty),
        );
        if (res === "ok") {
          added.push(p.name);
          trackAddToCart(toAnalyticsItem({ id: p.id, name: p.name, price: p.price }, Math.max(1, qty)));
        } else {
          failed.push(p.name);
        }
      }

      const problems = [
        ...unavailable.map((u) => `${u.requested_name} ${REASON_LABEL[u.reason] ?? "indisponível"}`),
        ...failed.map((f) => `${f} não pôde ser adicionado`),
      ];

      if (added.length === 0) {
        toast.error("Não foi possível repetir este pedido agora.");
        return;
      }
      if (problems.length > 0) {
        toast.warning(
          `${added.length} ${added.length === 1 ? "item adicionado" : "itens adicionados"}. ${problems.join("; ")}.`,
        );
      } else {
        toast.success(
          `${added.length} ${added.length === 1 ? "item adicionado" : "itens adicionados"} ao carrinho com os preços de hoje.`,
        );
      }
      navigate({ to: "/carrinho" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível repetir este pedido.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      className={
        className ??
        "inline-flex items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-muted disabled:opacity-60"
      }
    >
      <RotateCcw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Conferindo estoque..." : "Comprar novamente"}
    </button>
  );
}
