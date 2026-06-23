import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { MegaOffersCarousel } from "@/components/MegaOffersCarousel";
import { pagedProductsQuery, productImages } from "@/lib/products";
import { useRealtimeProducts } from "@/hooks/useRealtimeProducts";
import { Search, X, Loader2 } from "lucide-react";

type LojaSearch = { cat?: string; q?: string; focus?: number };

export const Route = createFileRoute("/loja")({
  validateSearch: (search: Record<string, unknown>): LojaSearch => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    focus: search.focus ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ cat: search.cat, q: search.q }),
  head: () => ({
    meta: [
      { title: "Ofertas · shopbox" },
      { name: "description", content: "Catálogo completo da shopbox com todas as ofertas." },
    ],
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(
      pagedProductsQuery({ search: deps.q, category: deps.cat }),
    ),
  component: Loja,
  pendingMs: 0,
});

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Loja() {
  const { cat, q: qParam, focus } = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState(qParam ?? "");
  const debouncedQ = useDebounced(q, 350);
  useRealtimeProducts();

  // Sincroniza busca com URL (sem recarregar a rota — search params atualizam loaderDeps)
  useEffect(() => {
    if ((debouncedQ || "") === (qParam ?? "")) return;
    navigate({
      to: "/loja",
      search: { ...(cat ? { cat } : {}), ...(debouncedQ ? { q: debouncedQ } : {}) },
      replace: true,
    });
  }, [debouncedQ, qParam, cat, navigate]);

  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById("loja-search") as HTMLInputElement | null;
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    navigate({
      to: "/loja",
      search: { ...(cat ? { cat } : {}), ...(qParam ? { q: qParam } : {}) },
      replace: true,
    });
  }, [focus, cat, qParam, navigate]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useSuspenseInfiniteQuery(
    pagedProductsQuery({ search: qParam, category: cat }),
  );

  const products = useMemo(() => data.pages.flatMap((p) => p.items), [data]);
  const total = data.pages[0]?.total ?? 0;

  // IntersectionObserver para scroll infinito
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasNextPage) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const preloadImgs = useMemo(
    () => products.slice(0, 3).map((p) => productImages(p)[0]).filter(Boolean) as string[],
    [products],
  );

  return (
    <div className="min-h-screen flex flex-col">
      {preloadImgs.map((src) => (
        <link key={src} rel="preload" as="image" href={src} />
      ))}
      <Header />

      <section className="container mx-auto pl-6 pr-3 sm:pl-10 sm:pr-4 py-4 sm:py-6">
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="loja-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full bg-input text-foreground rounded-md pl-10 pr-3 py-2.5 border border-border focus:outline-none focus:border-primary"
            />
          </div>
          {cat && (
            <button
              type="button"
              onClick={() => navigate({ to: "/loja", search: q ? { q } : {} })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider self-start sm:self-auto"
            >
              {cat}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {!qParam && !cat && products.length > 0 && (
          <MegaOffersCarousel products={products as any} />
        )}

        {products.length === 0 ? (
          <div className="text-center py-16 sm:py-20 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p as any} priority={i < 3} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-10" />
            {isFetchingNextPage && (
              <div className="flex justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!hasNextPage && products.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">
                {total} {total === 1 ? "produto" : "produtos"} no total
              </p>
            )}
          </>
        )}
      </section>

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
