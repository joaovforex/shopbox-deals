import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { activeProductsQuery, productImages } from "@/lib/products";
import { Search, X } from "lucide-react";

type LojaSearch = { cat?: string };

export const Route = createFileRoute("/loja")({
  validateSearch: (search: Record<string, unknown>): LojaSearch => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Ofertas · shopbox" },
      { name: "description", content: "Catálogo completo da shopbox com todas as ofertas." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(activeProductsQuery()),
  component: Loja,
  pendingMs: 0,
});

function Loja() {
  const { data: products } = useSuspenseQuery(activeProductsQuery());
  const { cat } = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const filtered = products.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const preloadImgs = useMemo(
    () => filtered.slice(0, 8).map((p) => productImages(p)[0]).filter(Boolean) as string[],
    [filtered],
  );

  return (
    <div className="min-h-screen flex flex-col">
      {preloadImgs.map((src) => (
        <link key={src} rel="preload" as="image" href={src} />
      ))}
      <Header />

      <section className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full bg-input text-foreground rounded-md pl-10 pr-3 py-2.5 border border-border focus:outline-none focus:border-primary"
            />
          </div>
          {cat && (
            <button
              type="button"
              onClick={() => navigate({ to: "/loja", search: {} })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider self-start sm:self-auto"
            >
              {cat}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 sm:py-20 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 8} />)}
          </div>
        )}
      </section>

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
