import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Zap, Flame, Truck, ShieldCheck, Sparkles } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { DiscountCarousel } from "@/components/DiscountCarousel";
import { fetchProducts } from "@/lib/products";
import { discountPct } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "shopbox · Super ofertas em Colombo" },
      { name: "description", content: "Eletrônicos, utilidades e ofertas relâmpago com até 70% OFF. Pague no Pix, cartão ou parcelado." },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => fetchProducts({ onlyActive: true }),
  });

  const featured = products.slice(0, 8);
  const rest = products.slice(8);

  // Produtos com maiores descontos para o carrossel
  const superDiscounts = [...products]
    .filter((p) => p.original_price && p.original_price > p.price)
    .sort((a, b) => discountPct(b.original_price, b.price) - discountPct(a.original_price, a.price))
    .slice(0, 12);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden border-b-4 border-primary">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card" />
        <div className="absolute -top-20 -right-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative container mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-deal text-deal-foreground px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-4">
              <Flame className="h-3 w-3" /> Ofertas da semana
            </div>
            <h1 className="display text-5xl md:text-7xl leading-[0.95] mb-4">
              SUPER<br />
              <span className="text-primary">DESCONTOS</span><br />
              <span className="text-accent">TODO DIA</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-6 max-w-md">
              Eletrônicos, utilidades, brinquedos e muito mais. Preço de atacado direto no seu WhatsApp.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/loja"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md font-black uppercase tracking-wider hover:scale-105 transition-transform shadow-deal"
              >
                <Zap className="h-5 w-5" /> Ver ofertas
              </Link>
              <a
                href="https://wa.me/?text=Quero%20ofertas%20da%20shopbox"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-6 py-3 rounded-md font-black uppercase tracking-wider hover:scale-105 transition-transform"
              >
                Receber no WhatsApp
              </a>
            </div>
          </div>

          <div className="relative w-full max-w-[280px] sm:max-w-xs mx-auto md:ml-auto md:mr-0">
            {/* Coupon ticket */}
            <div className="relative bg-gradient-to-br from-primary via-primary to-accent rounded-2xl p-[2px] shadow-deal animate-float">
              <div className="relative bg-background rounded-[14px] px-5 py-5 overflow-hidden">
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-background border border-border" />
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-background border border-border" />
                <div className="absolute inset-0 opacity-20 pointer-events-none" style={{background: "radial-gradient(circle at 30% 120%, var(--primary), transparent 60%)"}} />

                <div className="relative flex items-center gap-3">
                  <div className="flex items-baseline leading-none">
                    <span className="text-5xl sm:text-6xl display text-deal drop-shadow-[0_2px_10px_rgba(255,60,40,0.45)]">70</span>
                    <span className="text-2xl display text-deal">%</span>
                  </div>
                  <div className="flex-1 border-l-2 border-dashed border-border pl-3">
                    <div className="display text-2xl text-primary leading-none">OFF</div>
                    <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                      Produtos selecionados
                    </div>
                    <div className="text-[10px] text-accent font-bold mt-0.5 flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Tempo limitado
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -top-3 -left-2 bg-deal text-deal-foreground px-3 py-1 rounded-full text-[10px] sm:text-xs font-black shadow-lg animate-pulse-deal whitespace-nowrap">
              IMPERDÍVEL
            </div>
            <div className="absolute -bottom-2 -right-2 bg-accent text-accent-foreground p-2 rounded-full shadow-lg">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="bg-card border-b border-border">
        <div className="container mx-auto px-4 py-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Zap, label: "Pix com desconto" },
            { icon: Truck, label: "Retire na loja" },
            { icon: ShieldCheck, label: "Compra segura" },
            { icon: Flame, label: "Ofertas todo dia" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                <Icon className="h-5 w-5" />
              </div>
              <span className="font-semibold text-sm">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Super discounts carousel */}
      {superDiscounts.length > 0 && (
        <DiscountCarousel products={superDiscounts} />
      )}

      {/* Featured */}
      <section className="container mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-deal font-black uppercase tracking-wider text-xs">🔥 Ofertas em destaque</div>
            <h2 className="display text-3xl md:text-4xl">As mais procuradas</h2>
          </div>
          <Link to="/loja" className="text-sm font-semibold text-primary hover:underline hidden sm:inline">
            Ver todas →
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-card rounded-lg animate-pulse" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-lg border border-border">
            <div className="text-6xl mb-3">📦</div>
            <h3 className="display text-2xl mb-2">Nenhum produto ainda</h3>
            <p className="text-muted-foreground">
              Entre como administrador para cadastrar o primeiro produto da loja.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {rest.length > 0 && (
        <section className="container mx-auto px-4 pb-16">
          <h2 className="display text-2xl md:text-3xl mb-6">Mais ofertas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {rest.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
