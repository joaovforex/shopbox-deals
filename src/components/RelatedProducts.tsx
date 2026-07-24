import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/ProductCard";
import { pageProductsQuery } from "@/lib/products";

/**
 * "Você também pode gostar": até 4 produtos da mesma categoria,
 * excluindo o produto atual e priorizando os com estoque.
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

  if (!enabled || !data) return null;

  const items = data.items
    .filter((p) => p.id !== excludeId)
    .sort((a, b) => (b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0))
    .slice(0, 4);

  if (items.length === 0) return null;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="display text-2xl mb-5">Você também pode gostar</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {items.map((p) => (
          <ProductCard key={p.id} product={p as any} />
        ))}
      </div>
    </section>
  );
}
