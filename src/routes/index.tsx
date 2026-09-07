import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Tag, Sparkles, Wallet, LayoutGrid } from "lucide-react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { TrustBar } from "@/components/TrustBar";
import { ProductCard } from "@/components/ProductCard";
import { pageProductsQuery, usedCategoriesQuery, type ProductCard as ProductCardData } from "@/lib/products";
import { useSiteSettings, formatCashbackLabel } from "@/lib/site-settings";
import { discountPct } from "@/lib/format";

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
    context.queryClient.prefetchQuery(pageProductsQuery({ page: 1 })).catch(() => undefined),
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

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: typeof Tag;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 mb-4 sm:mb-5">
      <div className="min-w-0">
        <h2 className="display text-2xl sm:text-3xl flex items-center gap-2">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{title}</span>
        </h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < 2} />
      ))}
    </div>
  );
}

function HomePage() {
  const { data } = useQuery(pageProductsQuery({ page: 1 }));
  const { data: categories = [] } = useQuery(usedCategoriesQuery());
  const { data: settings } = useSiteSettings();

  const products = useMemo(() => (data?.items ?? []) as ProductCardData[], [data]);

  const deals = useMemo(() => {
    const inStock = products.filter((p) => p.stock > 0);
    const discounted = inStock
      .filter((p) => p.original_price && p.original_price > p.price)
      .sort((a, b) => discountPct(b.original_price, b.price) - discountPct(a.original_price, a.price));
    const base = discounted.length >= 4 ? discounted : [...discounted, ...inStock];
    const seen = new Set<string>();
    return base.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, 8);
  }, [products]);

  const more = useMemo(() => {
    const chosen = new Set(deals.map((p) => p.id));
    return products.filter((p) => !chosen.has(p.id)).slice(0, 8);
  }, [products, deals]);

  const topCategories = categories.slice(0, 8);
  const cashbackLabel = formatCashbackLabel(settings?.cashback_rate ?? 0.05);

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
        {/* HERO */}
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/20 via-background to-background">
          <div className="container mx-auto px-4 py-10 sm:py-16 max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 text-primary px-3 py-1 text-[11px] font-black uppercase tracking-widest">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Ofertas atualizadas todos os dias
            </span>
            <h1 className="display text-3xl sm:text-5xl mt-4 leading-tight">
              Super descontos todos os dias
            </h1>
            <p className="mt-3 text-base sm:text-lg text-muted-foreground">
              Achou barato. Achou na shopbox. Preço de atacado, retirada em Colombo/PR e entrega na
              região.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/loja"
                className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-6 py-3.5 rounded-lg shadow-deal hover:scale-[1.02] transition-transform"
              >
                Ver ofertas <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href="#categorias"
                className="inline-flex items-center justify-center gap-2 bg-card border border-border font-bold uppercase tracking-wider px-6 py-3.5 rounded-lg hover:bg-secondary transition-colors"
              >
                <LayoutGrid className="h-4 w-4" aria-hidden /> Compre por categoria
              </a>
            </div>
          </div>
        </section>

        <TrustBar />

        {/* ACHADOS */}
        {deals.length > 0 && (
          <section className="container mx-auto px-4 py-8 sm:py-12">
            <SectionHeading
              icon={Tag}
              title="Achados shopbox"
              subtitle="Os maiores descontos disponíveis agora, com estoque."
              action={
                <Link
                  to="/loja"
                  className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-primary hover:underline"
                >
                  Ver tudo <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              }
            />
            <ProductGrid products={deals} />
          </section>
        )}

        {/* CATEGORIAS */}
        {topCategories.length > 0 && (
          <section id="categorias" className="border-y border-border bg-card/50">
            <div className="container mx-auto px-4 py-8 sm:py-12">
              <SectionHeading icon={LayoutGrid} title="Compre por categoria" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {topCategories.map((c) => (
                  <Link
                    key={c}
                    to="/loja"
                    search={{ cat: c }}
                    className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-4 shadow-sm hover:border-primary hover:shadow-md transition-all"
                  >
                    <span className="min-w-0 truncate font-semibold">{c}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* MAIS OFERTAS */}
        {more.length > 0 && (
          <section className="container mx-auto px-4 py-8 sm:py-12">
            <SectionHeading icon={Sparkles} title="Mais ofertas" subtitle="Novidades recém-adicionadas ao catálogo." />
            <ProductGrid products={more} />
          </section>
        )}

        {/* CASHBACK */}
        <section className="border-y border-border bg-gradient-to-r from-primary/15 to-transparent">
          <div className="container mx-auto px-4 py-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <h2 className="display text-2xl sm:text-3xl flex items-center gap-2">
                <Wallet className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                Cashback de {cashbackLabel} nas suas compras
              </h2>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl">
                Parte do valor de cada compra aprovada volta como crédito para usar nas próximas
                compras da shopbox. O saldo aparece na sua conta e pode ser aplicado no checkout.
              </p>
            </div>
            <Link
              to="/faq"
              className="inline-flex w-fit items-center gap-2 bg-card border border-border font-bold uppercase tracking-wider px-5 py-3 rounded-lg hover:bg-secondary transition-colors"
            >
              Como funciona <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>

        {/* CTA FINAL */}
        <section className="container mx-auto px-4 py-12 text-center">
          <h2 className="display text-2xl sm:text-3xl">Pronto para achar barato?</h2>
          <p className="mt-2 text-muted-foreground">
            Explore o catálogo completo e aproveite as ofertas do dia.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/loja"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-6 py-3.5 rounded-lg shadow-deal hover:scale-[1.02] transition-transform"
            >
              Ver catálogo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/trocas-e-garantia" className="text-sm font-semibold text-muted-foreground hover:text-primary underline underline-offset-4">
              Trocas e garantia
            </Link>
            <Link to="/faq" className="text-sm font-semibold text-muted-foreground hover:text-primary underline underline-offset-4">
              Perguntas frequentes
            </Link>
          </div>
        </section>
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
