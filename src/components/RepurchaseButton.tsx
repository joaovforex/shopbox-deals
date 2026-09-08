import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { buildRepurchasePlan, currentUserId } from "@/lib/account-queries";
import { useCart } from "@/lib/cart";
import { trackAddToCart, toAnalyticsItem } from "@/lib/analytics";

const REASON_LABEL: Record<string, string> = {
  removed: "não está mais no catálogo",
  inactive: "não está mais à venda",
  out_of_stock: "está sem estoque",
  variant_gone: "mudou de cores — escolha na página do produto",
  needs_choice: "agora tem opções de cor — escolha na página do produto",
};

/**
 * "Comprar novamente": relê preço, estoque e variante ATUAIS (consulta
 * autenticada, filtrada pelo dono) e adiciona ao carrinho pela mesma função
 * `add`, que já reserva estoque. Nunca reutiliza o preço antigo do pedido.
 * Itens que exigem escolha de cor levam o cliente para a página do produto.
 */
export function RepurchaseButton({ orderId, className }: { orderId: string; className?: string }) {
  const { add } = useCart();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const uid = await currentUserId();
      if (!uid) {
        toast.error("Entre na sua conta para repetir o pedido.");
        return;
      }
      const items = await buildRepurchasePlan(orderId, uid);
      const ready = items.filter((i) => i.reason === "ok" && i.product);
      const choices = items.filter((i) => i.reason === "needs_choice" || i.reason === "variant_gone");
      const blocked = items.filter((i) => ["removed", "inactive", "out_of_stock"].includes(i.reason));

      if (ready.length === 0) {
        // Um único item que só precisa de escolha: leva direto ao produto.
        const pick = choices[0];
        if (choices.length >= 1 && pick?.product) {
          toast.info(`${pick.requested_name} ${REASON_LABEL[pick.reason]}.`);
          navigate({ to: "/produto/$id", params: { id: pick.product.id } });
          return;
        }
        const only = blocked[0];
        toast.error(
          blocked.length === 1 && only
            ? `${only.requested_name} ${REASON_LABEL[only.reason] ?? "não está disponível"}.`
            : "Nenhum item deste pedido está disponível hoje.",
        );
        return;
      }

      const added: string[] = [];
      const failed: string[] = [];
      for (const it of ready) {
        const p = it.product!;
        const qty = Math.max(1, Math.min(it.requested_quantity, p.stock));
        const res = await add(
          {
            id: p.id,
            name: p.name,
            price: p.price,
            image_url: p.image_url,
            variant_color: p.variant_color,
            unidade_id: p.unidade_id,
          },
          qty,
        );
        if (res === "ok") {
          added.push(p.name);
          trackAddToCart(toAnalyticsItem({ id: p.id, name: p.name, price: p.price }, qty));
        } else {
          failed.push(p.name);
        }
      }

      const problems = [
        ...choices.map((c) => `${c.requested_name} ${REASON_LABEL[c.reason]}`),
        ...blocked.map((b) => `${b.requested_name} ${REASON_LABEL[b.reason] ?? "indisponível"}`),
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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-muted disabled:opacity-60"
      }
    >
      <RotateCcw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Conferindo estoque..." : "Comprar novamente"}
    </button>
  );
}
