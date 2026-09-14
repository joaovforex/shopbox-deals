import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, Tag, Wallet } from "lucide-react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { TrustBar } from "@/components/TrustBar";
import { ProductCard } from "@/components/ProductCard";
import { homeShowcaseQuery, type ProductCard as ProductCardData } from "@/lib/products";
import { useSiteSettings, formatCashbackLabel } from "@/lib/site-settings";

const TITLE = "shopbox · Super descontos todos os dias em Colombo/PR";
const DESCRIPTION =
  "Achou barato, achou na shopbox. Ofertas diárias com preço de atacado, retirada em Colombo/PR, pagamento com Pix ou cartão e cashback nas compras.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://shopboxonline.com/" },
    ],
    links: [{ rel: "canonical", href: "https://shopboxonline.com/" }],
  }),
  loader: ({ context }) =>
    context.queryClient.prefetchQuery(homeShowcaseQuery()).catch(() => undefined),
  component: HomePage,
  pendingMs: 0,
});

const STORE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Store",
  name: "shopbox",
  description: DESCRIPTION,
  address: {
    "@type": "PostalAddress",
    streetAddress: "Rua Emílio Gleber, 1118",
    addressLocality: "Colombo",
    addressRegion: "PR",
    addressCountry: "BR",
  },
  paymentAccepted: "Pix, Cartão de crédito, Cartão de débito",
};

function HomePage() {
  const { data } = useQuery(homeShowcaseQuery());
  const { data: settings } = useSiteSettings();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  /** Vitrine mista: produtos de várias categorias intercalados (não só autopeças). */
  const offers = useMemo(() => (data ?? []) as ProductCardData[], [data]);

  const cashbackLabel = formatCashbackLabel(settings?.cashback_rate ?? 0.05);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate({ to: "/loja", search: term ? { q: term } : {} });
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Header />
      <AnnouncementBanner />

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STORE_JSON_LD) }}
      />

      <main className="flex-1">
        {/* HERO COMPACTO */}
        <section className="border-b border-border bg-gradient-to-br from-primary/20 via-background to-background">
          <div className="container mx-auto px-4 py-6 sm:py-9 max-w-2xl text-center">
            <h1 className="display text-2xl sm:text-4xl leading-tight">
              Super descontos todos os dias
            </h1>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground">
              Achou barato. Achou na shopbox.
            </p>

            <form onSubmit={submitSearch} className="mt-4 flex gap-2" role="search">
              <label htmlFor="home-search" className="sr-only">
                Buscar produtos
              </label>
              <input
                id="home-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="O que você procura?"
                className="min-h-11 flex-1 rounded-lg border border-border bg-card px-4 text-sm focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                aria-label="Buscar"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-black uppercase tracking-wider text-primary-foreground"
              >
                <Search className="h-4 w-4" aria-hidden />
              </button>
            </form>

            <Link
              to="/loja"
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Ver todas as ofertas <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>

        {/* OFERTAS — vitrine única, logo abaixo do hero */}
        <section className="container mx-auto px-4 py-6 sm:py-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="display text-xl sm:text-2xl flex items-center gap-2">
              <Tag className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              Ofertas de hoje
            </h2>
            <Link
              to="/loja"
              className="text-sm font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Ver tudo
            </Link>
          </div>

          {offers.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {offers.map((p, i) => (
                <ProductCard key={p.id} product={p} priority={i < 2} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              As ofertas estão sendo atualizadas.{" "}
              <Link to="/loja" className="text-primary underline underline-offset-4">
                Ver o catálogo
              </Link>
              .
            </p>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/loja"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 font-black uppercase tracking-wider text-primary-foreground shadow-deal"
            >
              Ver catálogo completo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>

        <TrustBar />

        {/* CASHBACK / RETIRADA — bloco curto */}
        <section className="container mx-auto px-4 py-8">
          <div className="rounded-xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-3">
            <Wallet className="h-6 w-6 shrink-0 text-primary" aria-hidden />
            <p className="flex-1 text-sm sm:text-base">
              <span className="font-bold">Cashback de {cashbackLabel}</span> nas compras aprovadas,
              para usar na próxima compra. Retirada em Colombo/PR ou entrega na região.
            </p>
            <Link
              to="/faq"
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border border-border px-4 text-xs font-bold uppercase tracking-wider hover:bg-secondary"
            >
              Como funciona
            </Link>
          </div>
        </section>
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
