import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ShoppingCart } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { pageProductsQuery, type ProductCard as ProductCardData } from "@/lib/products";
import { useCart } from "@/lib/cart";
import { useAuthUser, loginRedirectHref } from "@/lib/useAuthUser";
import { brl } from "@/lib/format";

const MAX_SELECTION = 3;

/**
 * "Combine com este produto": produtos reais da mesma categoria, com estoque,
 * excluindo o produto atual. Permite selecionar até 3 complementos e
 * adicioná-los ao carrinho usando a MESMA função `add` do carrinho (que já
 * cuida de reserva de estoque). Nenhum desconto de kit é inventado — o total
 * é a soma real dos preços atuais.
 */
export function RelatedProducts({
  category,
  excludeId,
}: {
  category: string | null;
  excludeId: string;
}) {
  const enabled = !!category;
  const { data } = useQuery({
    ...pageProductsQuery({ category: category ?? undefined, page: 1 }),
    enabled,
  });
  const { add } = useCart();
  const user = useAuthUser();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    if (!data) return [] as ProductCardData[];
    return data.items
      .filter((p) => p.id !== excludeId)
      .sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0))
      .slice(0, 4);
  }, [data, excludeId]);

  const inStock = items.filter((p) => p.stock > 0);
  const selectedItems = inStock.filter((p) => selected.includes(p.id));
  const selectedTotal = selectedItems.reduce((s, p) => s + p.price, 0);

  if (!enabled || !data || items.length === 0) return null;

  const toggle = (p: ProductCardData) => {
    setSelected((prev) => {
      if (prev.includes(p.id)) return prev.filter((id) => id !== p.id);
      if (prev.length >= MAX_SELECTION) {
        toast.info(`Selecione no máximo ${MAX_SELECTION} produtos`);
        return prev;
      }
      return [...prev, p.id];
    });
  };

  const addSelected = async () => {
    if (selectedItems.length === 0) return;
    if (!user) {
      toast.info("Crie sua conta ou entre para continuar");
      window.location.href = loginRedirectHref("/carrinho");
      return;
    }
    setBusy(true);
    let ok = 0;
    for (const p of selectedItems) {
      if (p.stock <= 0) continue;
      const res = await add(
        {
          id: p.id,
          name: p.name,
          price: p.price,
          image_url: p.image_url,
          variant_color: null,
          unidade_id: p.unidade_id ?? null,
        },
        1,
      );
      if (res === "ok") ok += 1;
    }
    setBusy(false);
    if (ok > 0) {
      toast.success(`${ok} ${ok === 1 ? "produto adicionado" : "produtos adicionados"} ao carrinho`);
      setSelected([]);
    }
  };

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="display text-2xl mb-1">Combine com este produto</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Outros itens de {category} que você pode levar junto.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {items.map((p) => {
          const isSel = selected.includes(p.id);
          return (
            <div key={p.id} className="relative">
              <ProductCard product={p as any} />
              {p.stock > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(p)}
                  aria-pressed={isSel}
                  aria-label={isSel ? `Remover ${p.name} da seleção` : `Selecionar ${p.name}`}
                  className={`mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
                    isSel
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground hover:bg-muted"
                  }`}
                >
                  {isSel && <Check className="h-3.5 w-3.5" />}
                  {isSel ? "Selecionado" : "Selecionar"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedItems.length > 0 && (
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="text-sm">
            <span className="font-bold">
              {selectedItems.length} {selectedItems.length === 1 ? "item selecionado" : "itens selecionados"}
            </span>
            <span className="text-muted-foreground"> · total {brl(selectedTotal)}</span>
          </div>
          <button
            type="button"
            onClick={addSelected}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            <ShoppingCart className="h-4 w-4" />
            {busy ? "Adicionando..." : "Adicionar selecionados ao carrinho"}
          </button>
        </div>
      )}
    </section>
  );
}
