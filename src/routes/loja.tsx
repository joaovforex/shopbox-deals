import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ProductCard } from "@/components/ProductCard";
import { MegaOffersCarousel } from "@/components/MegaOffersCarousel";
import { pageProductsQuery, productImages, PRODUCTS_PAGE_SIZE, usedCategoriesQuery } from "@/lib/products";
import { useRealtimeProducts } from "@/hooks/useRealtimeProducts";
import { brl } from "@/lib/format";
import { Search, X, ChevronLeft, ChevronRight, Tag, LayoutGrid, ChevronDown, SlidersHorizontal } from "lucide-react";

type LojaSearch = { cat?: string; q?: string; focus?: number; min?: number; max?: number; page?: number };

export const Route = createFileRoute("/loja")({
  validateSearch: (search: Record<string, unknown>): LojaSearch => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    focus: search.focus ? 1 : undefined,
    min: typeof search.min === "number" ? search.min : (typeof search.min === "string" && search.min ? Number(search.min) || undefined : undefined),
    max: typeof search.max === "number" ? search.max : (typeof search.max === "string" && search.max ? Number(search.max) || undefined : undefined),
    page: typeof search.page === "number" ? search.page : (typeof search.page === "string" && search.page ? Number(search.page) || undefined : undefined),
  }),
  loaderDeps: ({ search }) => ({ cat: search.cat, q: search.q, min: search.min, max: search.max, page: search.page ?? 1 }),
  head: () => ({
    meta: [
      { title: "Ofertas · shopbox" },
      { name: "description", content: "Catálogo completo da shopbox com todas as ofertas." },
    ],
  }),
  loader: ({ context, deps }) =>
    // prefetch (não ensure) para que timeouts transitórios do Postgres
    // não derrubem o SSR — o cliente reexecuta a query com retry.
    context.queryClient
      .prefetchQuery(
        pageProductsQuery({ search: deps.q, category: deps.cat, minPrice: deps.min, maxPrice: deps.max, page: deps.page }),
      )
      .catch(() => undefined),
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
  const { cat, q: qParam, focus, min, max, page: pageParam } = Route.useSearch();
  const page = pageParam && pageParam > 0 ? pageParam : 1;
  const navigate = useNavigate();
  const [q, setQ] = useState(qParam ?? "");
  const debouncedQ = useDebounced(q, 350);
  const [catOpen, setCatOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [minInput, setMinInput] = useState<string>(min ? String(min) : "");
  const [maxInput, setMaxInput] = useState<string>(max ? String(max) : "");
  const { data: categories = [] } = useQuery(usedCategoriesQuery());
  useRealtimeProducts();

  const baseSearch = useMemo(
    () => ({
      ...(cat ? { cat } : {}),
      ...(qParam ? { q: qParam } : {}),
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
    }),
    [cat, qParam, min, max],
  );

  useEffect(() => {
    if ((debouncedQ || "") === (qParam ?? "")) return;
    navigate({
      to: "/loja",
      search: {
        ...(cat ? { cat } : {}),
        ...(min ? { min } : {}),
        ...(max ? { max } : {}),
        ...(debouncedQ ? { q: debouncedQ } : {}),
      },
      replace: true,
    });
  }, [debouncedQ, qParam, cat, min, max, navigate]);

  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById("loja-search") as HTMLInputElement | null;
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    navigate({ to: "/loja", search: baseSearch, replace: true });
  }, [focus, baseSearch, navigate]);

  const { data } = useSuspenseQuery(
    pageProductsQuery({ search: qParam, category: cat, minPrice: min, maxPrice: max, page }),
  );

  const products = data.items;
  const total = data.total;
  const totalPages = Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      navigate({ to: "/loja", search: baseSearch, replace: true });
    }
  }, [page, totalPages, baseSearch, navigate]);

  const applyPriceRange = () => {
    const nMin = Number(minInput.replace(",", "."));
    const nMax = Number(maxInput.replace(",", "."));
    setPriceOpen(false);
    navigate({
      to: "/loja",
      search: {
        ...(cat ? { cat } : {}),
        ...(qParam ? { q: qParam } : {}),
        ...(minInput && !Number.isNaN(nMin) && nMin > 0 ? { min: nMin } : {}),
        ...(maxInput && !Number.isNaN(nMax) && nMax > 0 ? { max: nMax } : {}),
      },
    });
  };

  const clearPriceRange = () => {
    setMinInput("");
    setMaxInput("");
    setPriceOpen(false);
    navigate({
      to: "/loja",
      search: { ...(cat ? { cat } : {}), ...(qParam ? { q: qParam } : {}) },
    });
  };


  const goToPage = (p: number) => {
    const clamped = Math.min(Math.max(1, p), totalPages);
    navigate({
      to: "/loja",
      search: { ...baseSearch, ...(clamped > 1 ? { page: clamped } : {}) },
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const preloadImgs = useMemo(
    () => products.slice(0, 3).map((p) => productImages(p)[0]).filter(Boolean) as string[],
    [products],
  );

  const pageNumbers = useMemo(() => {
    const range: (number | "...")[] = [];
    const add = (n: number | "...") => range.push(n);
    const window = 1;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= window) {
        add(i);
      } else if (range[range.length - 1] !== "...") {
        add("...");
      }
    }
    return range;
  }, [page, totalPages]);

  const hasFilter = Boolean(qParam || cat || min || max);
  const priceLabel = min && max ? `${brl(min)}–${brl(max)}` : max ? `Até ${brl(max)}` : min ? `A partir de ${brl(min)}` : null;

  return (
    <div className="min-h-screen flex flex-col">
      {preloadImgs.map((src) => (
        <link key={src} rel="preload" as="image" href={src} />
      ))}
      <Header />
      <AnnouncementBanner />

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
          <div className="flex flex-wrap gap-2">
            {cat && (
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/loja",
                    search: { ...(qParam ? { q: qParam } : {}), ...(min ? { min } : {}), ...(max ? { max } : {}) },
                  })
                }
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider"
              >
                {cat}
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {priceLabel && (
              <button
                type="button"
                onClick={clearPriceRange}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-deal text-deal-foreground text-xs font-black uppercase tracking-wider"
              >
                <Tag className="h-3.5 w-3.5" />
                {priceLabel}
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 sm:mb-6 flex flex-wrap gap-2 items-start">
          <div>

            <button
              type="button"
              onClick={() => setPriceOpen((v) => !v)}
              aria-expanded={priceOpen}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border text-sm font-medium hover:bg-secondary transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Faixa de preço
              <ChevronDown className={`h-4 w-4 transition-transform ${priceOpen ? "rotate-180" : ""}`} />
            </button>
            {priceOpen && (
              <div className="mt-3 p-3 rounded-md bg-card border border-border flex flex-wrap items-end gap-2">
                <label className="flex flex-col text-xs text-muted-foreground">
                  Mín (R$)
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-28 bg-input text-foreground rounded-md px-2 py-1.5 border border-border focus:outline-none focus:border-primary"
                  />
                </label>
                <label className="flex flex-col text-xs text-muted-foreground">
                  Máx (R$)
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={maxInput}
                    onChange={(e) => setMaxInput(e.target.value)}
                    placeholder="1000"
                    className="mt-1 w-28 bg-input text-foreground rounded-md px-2 py-1.5 border border-border focus:outline-none focus:border-primary"
                  />
                </label>
                <button
                  type="button"
                  onClick={applyPriceRange}
                  className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:opacity-90"
                >
                  Aplicar
                </button>
                {(min || max) && (
                  <button
                    type="button"
                    onClick={clearPriceRange}
                    className="h-9 px-3 rounded-md bg-background border border-border text-xs font-bold uppercase tracking-wider hover:bg-secondary"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mb-4 sm:mb-6">

          <button
            type="button"
            onClick={() => setCatOpen((v) => !v)}
            aria-expanded={catOpen}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border text-sm font-medium hover:bg-secondary transition-colors"
          >
            <LayoutGrid className="h-4 w-4" />
            Categorias
            <ChevronDown className={`h-4 w-4 transition-transform ${catOpen ? "rotate-180" : ""}`} />
          </button>
          {catOpen && (
            <div className="mt-3 p-3 rounded-md bg-card border border-border">
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma categoria disponível.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCatOpen(false);
                      navigate({
                        to: "/loja",
                        search: { ...(qParam ? { q: qParam } : {}), ...(min ? { min } : {}), ...(max ? { max } : {}) },
                      });
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${!cat ? "bg-foreground text-background border-foreground" : "bg-background border-border hover:border-foreground"}`}
                  >
                    Todas
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCatOpen(false);
                        navigate({
                          to: "/loja",
                          search: { cat: c, ...(qParam ? { q: qParam } : {}), ...(max ? { max } : {}) },
                        });
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-foreground"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {!hasFilter && page === 1 && products.length > 0 && (
          <MegaOffersCarousel products={products as any} />
        )}

        {products.length === 0 ? (
          <div className="text-center py-16 sm:py-20 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p as any} priority={i < 3} />
              ))}
            </div>

            {totalPages > 1 && (
              <nav
                aria-label="Paginação"
                className="mt-8 flex items-center justify-center gap-1.5 flex-wrap"
              >
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 h-9 px-3 rounded-md bg-card border border-border text-xs font-bold uppercase tracking-wider hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                </button>
                {pageNumbers.map((n, idx) =>
                  n === "..." ? (
                    <span key={`e-${idx}`} className="px-2 text-muted-foreground text-sm">…</span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => goToPage(n)}
                      className={`h-9 min-w-9 px-3 rounded-md text-sm font-bold transition-colors ${
                        n === page
                          ? "bg-primary text-primary-foreground shadow-deal"
                          : "bg-card border border-border hover:bg-secondary"
                      }`}
                    >
                      {n}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 h-9 px-3 rounded-md bg-card border border-border text-xs font-bold uppercase tracking-wider hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Próxima <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </nav>
            )}

            <p className="text-center text-xs text-muted-foreground py-4">
              Página {page} de {totalPages} · {total} {total === 1 ? "produto" : "produtos"}
            </p>
          </>
        )}
      </section>

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
