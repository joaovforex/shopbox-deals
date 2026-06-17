import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Flame, Zap } from "lucide-react";
import { brl, discountPct } from "@/lib/format";
import type { ProductCard as ProductCardData } from "@/lib/products";
import { productImages } from "@/lib/products";

const MIN_OFF = 30;
const MAX_ITEMS = 12;

export function MegaOffersCarousel({ products }: { products: ProductCardData[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const mega = products
    .map((p) => ({ p, off: discountPct(p.original_price, p.price) }))
    .filter((x) => x.off >= MIN_OFF && x.p.stock > 0)
    .sort((a, b) => b.off - a.off)
    .slice(0, MAX_ITEMS);

  if (mega.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -260 : 260, behavior: "smooth" });
  };

  return (
    <section className="relative mb-5 sm:mb-7 rounded-2xl border-2 border-deal/40 bg-gradient-to-br from-deal/15 via-background to-background p-3 sm:p-4 shadow-deal/20 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-deal text-deal-foreground px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
            <Flame className="h-3 w-3" /> Mega ofertas
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground hidden sm:inline">
            acima de 30% off
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scroll("left")}
            className="h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-deal hover:text-deal-foreground hover:border-deal transition-colors active:scale-90"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-deal hover:text-deal-foreground hover:border-deal transition-colors active:scale-90"
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {mega.map(({ p, off }) => {
          const cover = productImages(p)[0];
          return (
            <Link
              key={p.id}
              to="/produto/$id"
              params={{ id: p.id }}
              className="snap-start flex-shrink-0 w-[150px] sm:w-[170px] bg-card rounded-xl border border-border hover:border-deal transition-all overflow-hidden group active:scale-[0.98]"
            >
              <div className="aspect-square bg-muted relative overflow-hidden">
                {cover ? (
                  <img
                    src={cover}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full" />
                )}
                <div className="absolute top-1.5 left-1.5 bg-deal text-deal-foreground text-[11px] font-black px-1.5 py-0.5 rounded shadow-md -rotate-3 flex items-center gap-0.5">
                  <Zap className="h-2.5 w-2.5" />-{off}%
                </div>
              </div>
              <div className="p-2 flex flex-col gap-0.5">
                <h3 className="text-[11px] font-semibold line-clamp-2 min-h-[2rem] leading-snug">
                  {p.name}
                </h3>
                {p.original_price && p.original_price > p.price && (
                  <span className="text-[10px] text-muted-foreground line-through">{brl(p.original_price)}</span>
                )}
                <span className="text-sm font-black text-price leading-tight">{brl(p.price)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
