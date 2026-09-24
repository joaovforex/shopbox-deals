import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ProductCard } from "@/components/ProductCard";
import { MegaOffersCarousel } from "@/components/MegaOffersCarousel";
import { pageProductsQuery, productImages, PRODUCTS_PAGE_SIZE, usedCategoriesQuery } from "@/lib/products";
import { optimizedImage } from "@/lib/image-url";
import { useRealtimeProducts } from "@/hooks/useRealtimeProducts";
import { brl } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { trackViewItemList, toAnalyticsItem } from "@/lib/analytics";

import { Search, X, ChevronLeft, ChevronRight, Tag, LayoutGrid, ChevronDown, SlidersHorizontal, ShieldAlert } from "lucide-react";

type LojaSearch = { cat?: string; q?: string; focus?: number; min?: number; max?: number; page?: number; brand?: string; size?: string };

/**
 * Categoria de acesso restrito a maiores de 18 anos. A regra REAL é aplicada no
 * servidor (RLS + RPCs + trigger no banco); este gate é só a experiência de tela.
 * A idade considerada é SEMPRE a data de nascimento do cadastro (perfil).
 */
const ADULT_CATEGORY = "+18";

/** Tela de bloqueio da categoria +18, com a mensagem certa por situação. */
function AdultGate({ status }: { status: string | undefined }) {
  const loading = status === undefined;
  const anon = status === "anon";
  const noBirthdate = status === "no_birthdate";
  const underage = status === "underage";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-16 sm:py-24 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-destructive/15 text-destructive">
            <ShieldAlert className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="display text-2xl mb-2">Conteúdo +18</h1>
          {loading ? (
            <p className="text-sm text-muted-foreground">Verificando seu acesso…</p>
          ) : anon ? (
            <>
              <p className="text-sm text-muted-foreground">
                Esta categoria é exclusiva para maiores de 18 anos. Entre na sua conta e
                informe sua data de nascimento no perfil para acessar.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <Link to="/auth" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-black uppercase tracking-wider text-primary-foreground">
                  Entrar / criar conta
                </Link>
                <Link to="/loja" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-bold hover:bg-secondary">
                  Voltar para a loja
                </Link>
              </div>
            </>
          ) : noBirthdate ? (
            <>
              <p className="text-sm text-muted-foreground">
                Para acessar esta categoria, informe sua <strong>data de nascimento</strong> no
                seu perfil. O acesso considera sempre a idade do seu cadastro.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <Link to="/perfil" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-black uppercase tracking-wider text-primary-foreground">
                  Completar meu perfil
                </Link>
                <Link to="/loja" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-bold hover:bg-secondary">
                  Voltar para a loja
                </Link>
              </div>
            </>
          ) : underage ? (
            <>
              <p className="text-sm text-muted-foreground">
                Esta categoria é restrita para <strong>maiores de 18 anos</strong>. Seu cadastro
                não atende à idade mínima.
              </p>
              <div className="mt-5">
                <Link to="/loja" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-black uppercase tracking-wider text-primary-foreground">
                  Voltar para a loja
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Acesso indisponível no momento.</p>
          )}
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}

export const Route = createFileRoute("/loja")({
  validateSearch: (search: Record<string, unknown>): LojaSearch => ({
    cat: typeof search.cat === "string" ? search.cat : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    focus: search.focus ? 1 : undefined,
    min: typeof search.min === "number" ? search.min : (typeof search.min === "string" && search.min ? Number(search.min) || undefined : undefined),
    max: typeof search.max === "number" ? search.max : (typeof search.max === "string" && search.max ? Number(search.max) || undefined : undefined),
    page: typeof search.page === "number" ? search.page : (typeof search.page === "string" && search.page ? Number(search.page) || undefined : undefined),
    brand: typeof search.brand === "string" ? search.brand : undefined,
    size: typeof search.size === "string" ? search.size : undefined,
  }),
  loaderDeps: ({ search }) => ({ cat: search.cat, q: search.q, min: search.min, max: search.max, page: search.page ?? 1 }),
  head: ({ match }) => {
    const s = (match.search as LojaSearch) ?? {};
    const cat = s.cat;
    const base = "https://shopboxonline.com";
    const title = cat ? `${cat} em promoção | shopbox` : "Ofertas · shopbox";
    const description = cat
      ? `Produtos de ${cat} com desconto na shopbox. Pagamento no Pix ou cartão e retirada em Colombo/PR.`
      : "Catálogo completo da shopbox com todas as ofertas.";
    // Categoria "pura" é indexável; combinações internas de busca/preço/marca/
    // tamanho/paginação recebem noindex,follow e apontam o canonical para a
    // versão limpa, evitando duplicatas no índice.
    const isFiltered = Boolean(s.q || s.min || s.max || s.brand || s.size || (s.page && s.page > 1));
    const canonical = cat ? `${base}/loja?cat=${encodeURIComponent(cat)}` : `${base}/loja`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
        ...(isFiltered ? [{ name: "robots", content: "noindex,follow" }] : []),
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },

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
  const { cat, q: qParam, focus, min, max, page: pageParam, brand: brandParam, size: sizeParam } = Route.useSearch();
  const page = pageParam && pageParam > 0 ? pageParam : 1;
  const navigate = useNavigate();
  const [q, setQ] = useState(qParam ?? "");
  const debouncedQ = useDebounced(q, 350);
  const [catOpen, setCatOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [minInput, setMinInput] = useState<string>(min ? String(min) : "");
  const [maxInput, setMaxInput] = useState<string>(max ? String(max) : "");
  const { data: categories = [] } = useQuery(usedCategoriesQuery());
  const [brandOpen, setBrandOpen] = useState(false);
  const { data: filterOptions } = useQuery({
    queryKey: ["loja", "brand-size-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("brand,size")
        .eq("active", true)
        .limit(5000);
      if (error) return { brands: [] as string[], sizes: [] as string[] };
      const brands = Array.from(
        new Set((data ?? []).map((r) => (r.brand ?? "").trim()).filter(Boolean)),
      ).sort();
      const sizes = Array.from(
        new Set((data ?? []).map((r) => (r.size ?? "").trim()).filter(Boolean)),
      ).sort();
      return { brands, sizes };
    },
    staleTime: 5 * 60_000,
  });
  const availableBrands = filterOptions?.brands ?? [];
  const availableSizes = filterOptions?.sizes ?? [];
  useRealtimeProducts();

  // Categoria +18: verifica a idade pela data de nascimento do cadastro (no servidor).
  // 'anon' | 'no_birthdate' | 'underage' | 'ok'. Enquanto carrega, fica undefined.
  const isAdultCat = (cat ?? "").trim().toLowerCase() === ADULT_CATEGORY;
  const { data: adultStatus } = useQuery({
    queryKey: ["adult-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("current_user_adult_status" as never);
      if (error) return "anon";
      return (data as string) ?? "anon";
    },
    enabled: isAdultCat,
    staleTime: 60_000,
  });

  const baseSearch = useMemo(
    () => ({
      ...(cat ? { cat } : {}),
      ...(qParam ? { q: qParam } : {}),
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
      ...(brandParam ? { brand: brandParam } : {}),
      ...(sizeParam ? { size: sizeParam } : {}),
    }),
    [cat, qParam, min, max, brandParam, sizeParam],
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
    pageProductsQuery({
      search: qParam,
      category: cat,
      minPrice: min,
      maxPrice: max,
      brand: brandParam,
      size: sizeParam,
      page,
    }),
  );

  // Marca/numeração são filtradas no servidor (query direta), então a página
  // e o total já vêm corretos — sem filtro no cliente.
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
    () =>
      products
        .slice(0, 3)
        .map((p) => productImages(p)[0])
        .filter(Boolean)
        .map((src) => optimizedImage(src as string, { width: 480, quality: 70 })) as string[],
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

  const hasFilter = Boolean(qParam || cat || min || max || brandParam || sizeParam);
  const priceLabel = min && max ? `${brl(min)}–${brl(max)}` : max ? `Até ${brl(max)}` : min ? `A partir de ${brl(min)}` : null;

  // Analytics: view_item_list com os produtos já carregados (sem query extra)
  useEffect(() => {
    trackViewItemList(
      cat ? `Categoria: ${cat}` : qParam ? "Busca" : "Loja",
      products.map((p) =>
        toAnalyticsItem({ id: p.id, name: p.name, price: p.price, category: p.category }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, qParam, page, products.length]);

  // Bloqueio da categoria +18: só libera quem tem idade válida no cadastro.
  // (Os produtos já vêm vazios do servidor para quem não pode ver; aqui é a mensagem.)
  if (isAdultCat && adultStatus !== "ok") {
    return <AdultGate status={adultStatus} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {preloadImgs.map((src) => (
        <link key={src} rel="preload" as="image" href={src} />
      ))}
      <Header />
      <AnnouncementBanner />

      <section className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="mb-4 sm:mb-5">
          <nav aria-label="Trilha de navegação" className="mb-2 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-primary">Início</Link>
            <span className="mx-1">/</span>
            {cat ? (
              <>
                <Link to="/loja" className="hover:text-primary">Loja</Link>
                <span className="mx-1">/</span>
                <span className="text-foreground font-semibold">{cat}</span>
              </>
            ) : (
              <span className="text-foreground font-semibold">Loja</span>
            )}
          </nav>
          <h1 className="display text-2xl sm:text-4xl">
            {cat ? `Ofertas em ${cat}` : "Ofertas shopbox"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {cat ? `Produtos de ${cat} com desconto` : "Catálogo completo com super descontos"} ·{" "}
            <span className="font-semibold text-foreground">
              {total} {total === 1 ? "produto" : "produtos"}
            </span>
          </p>
          {hasFilter && (
            <button
              type="button"
              onClick={() => navigate({ to: "/loja", search: {} })}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-secondary"
            >
              <X className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
        </div>

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
            {brandParam && (
              <button
                type="button"
                onClick={() => navigate({ to: "/loja", search: { ...baseSearch, brand: undefined } })}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider"
              >
                {brandParam}
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {sizeParam && (
              <button
                type="button"
                onClick={() => navigate({ to: "/loja", search: { ...baseSearch, size: undefined } })}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider"
              >
                Tam. {sizeParam}
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

          {(availableBrands.length > 0 || availableSizes.length > 0) && (
            <div>
              <button
                type="button"
                onClick={() => setBrandOpen((v) => !v)}
                aria-expanded={brandOpen}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-card border border-border text-sm font-medium hover:bg-secondary transition-colors"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Marca / Numeração
                <ChevronDown className={`h-4 w-4 transition-transform ${brandOpen ? "rotate-180" : ""}`} />
              </button>
              {brandOpen && (
                <div className="mt-3 p-3 rounded-md bg-card border border-border space-y-3">
                  {availableBrands.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Marca</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigate({ to: "/loja", search: { ...baseSearch, brand: undefined } })}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${!brandParam ? "bg-foreground text-background border-foreground" : "bg-background border-border hover:border-foreground"}`}
                        >
                          Todas
                        </button>
                        {availableBrands.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => navigate({ to: "/loja", search: { ...baseSearch, brand: b } })}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${brandParam === b ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-foreground"}`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {availableSizes.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Numeração / Tamanho</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigate({ to: "/loja", search: { ...baseSearch, size: undefined } })}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${!sizeParam ? "bg-foreground text-background border-foreground" : "bg-background border-border hover:border-foreground"}`}
                        >
                          Todas
                        </button>
                        {availableSizes.map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => navigate({ to: "/loja", search: { ...baseSearch, size: sz } })}
                            className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider border transition-colors ${sizeParam === sz ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-foreground"}`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
                          search: { cat: c, ...(qParam ? { q: qParam } : {}), ...(min ? { min } : {}), ...(max ? { max } : {}) },
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

        {!hasFilter && categories.length > 0 && (
          <div className="mb-4 sm:mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
            <div className="flex gap-2 w-max sm:w-auto sm:flex-wrap">
              {categories.slice(0, 10).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => navigate({ to: "/loja", search: { cat: c } })}
                  className="shrink-0 px-3 py-1.5 rounded-full bg-card border border-border text-xs font-semibold uppercase tracking-wider hover:border-primary hover:text-primary transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {!hasFilter && page === 1 && products.length > 0 && (
          <MegaOffersCarousel products={products as any} />
        )}

        {products.length === 0 ? (
          <div className="text-center py-14 sm:py-20 bg-card rounded-xl border border-border px-4">
            <p className="font-bold text-foreground">Nenhum produto encontrado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilter
                ? "Tente remover os filtros ou buscar por outro termo."
                : "Em breve novos produtos por aqui."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {hasFilter && (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/loja", search: {} })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90"
                >
                  <X className="h-3.5 w-3.5" /> Limpar filtros
                </button>
              )}
              {categories.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => navigate({ to: "/loja", search: { cat: c } })}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:bg-secondary"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {products.map((p, i) => (
                <div
                  key={p.id}
                  className={i < 4 ? undefined : "[content-visibility:auto] [contain-intrinsic-size:360px]"}
                >
                  <ProductCard product={p as any} priority={i < 3} />
                </div>
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
