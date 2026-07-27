import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Zap, Tag, ShoppingBag } from "lucide-react";
import { brl, discountPct } from "@/lib/format";
import type { Product } from "@/lib/products";
import { optimizedImage, optimizedSrcSet } from "@/lib/image-url";
import { Skeleton } from "@/components/ui/skeleton";

function DiscountCard({ product, index }: { product: Product; index: number }) {
  const off = discountPct(product.original_price, product.price);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div
      className="snap-start snap-mandatory flex-shrink-0 w-[210px] sm:w-[240px]"
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      <div className="group relative flex flex-col bg-card rounded-2xl overflow-hidden border border-border hover:border-primary transition-all duration-300 hover:shadow-deal hover:-translate-y-1">
        {/* Image */}
        <div className="aspect-[4/3] bg-muted overflow-hidden relative">
          {product.image_url && !errored ? (
            <>
              {!loaded && (
                <Skeleton
                  aria-hidden
                  className="absolute inset-0 rounded-none bg-gradient-to-r from-muted via-muted-foreground/10 to-muted"
                />
              )}
              <img
                src={product.image_url}
                alt={product.name}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={() => setErrored(true)}
                className={`w-full h-full object-cover group-hover:scale-110 transition-all duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
              />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              Sem imagem
            </div>
          )}

          {/* Discount badge */}
          <div className="absolute top-2 left-2 bg-deal text-deal-foreground text-[11px] font-black px-2 py-1 rounded-md shadow-lg -rotate-3 flex items-center gap-1">
            <Tag className="h-3 w-3" />-{off}% OFF
          </div>

          {/* Super discount flash */}
          <div className="absolute top-2 right-2 bg-accent text-accent-foreground text-[9px] font-black px-2 py-1 rounded-full shadow-md animate-pulse flex items-center gap-0.5">
            <Zap className="h-2.5 w-2.5" /> SUPER
          </div>

          {/* gradient overlay on hover */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Content */}
        <div className="p-3 flex-1 flex flex-col gap-1">
          <h3 className="text-xs font-semibold line-clamp-2 min-h-[2rem] leading-snug">
            {product.name}
          </h3>

          {product.original_price && product.original_price > product.price && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground line-through">
                {brl(product.original_price)}
              </span>
              <span className="text-[10px] font-black bg-deal text-deal-foreground px-1.5 py-0.5 rounded">
                -{off}%
              </span>
            </div>
          )}

          <div className="text-lg font-black text-price leading-tight">
            {brl(product.price)}
          </div>



          {/* CTA Button */}
          <Link
            to="/produto/$id"
            params={{ id: product.id }}
            className="mt-2 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider px-3 py-2 rounded-lg hover:scale-[1.03] active:scale-[0.97] transition-transform shadow-deal"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Ver produto
          </Link>
        </div>
      </div>
    </div>
  );
}

export function DiscountCarousel({ products }: { products: Product[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = 260;
    el.scrollBy({ left: dir === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
  };

  return (
    <section className="py-8 sm:py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-deal text-deal-foreground px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2">
              <Zap className="h-3 w-3" /> Super descontos
            </div>
            <h2 className="display text-2xl sm:text-3xl leading-tight">
              Melhores ofertas
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => scroll("left")}
              className="h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors active:scale-90"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors active:scale-90"
              aria-label="Próximo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable track */}
        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide scroll-smooth -mx-4 px-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {products.map((product, i) => (
            <DiscountCard key={product.id} product={product} index={i} />
          ))}
        </div>

        {/* See all link */}
        <div className="mt-4 text-center">
          <Link
            to="/loja"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Ver todas as ofertas <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
