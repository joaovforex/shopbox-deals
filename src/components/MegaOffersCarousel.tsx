import { useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Flame, Zap } from "lucide-react";
import { brl, discountPct } from "@/lib/format";
import type { ProductCard as ProductCardData } from "@/lib/products";
import { productImages } from "@/lib/products";

const MIN_OFF = 30;
const SPEED_MS = 1200; // 1.2s por card
const PAUSE_AFTER_MANUAL_MS = 2500;

export function MegaOffersCarousel({ products }: { products: ProductCardData[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mega = products
    .map((p) => ({ p, off: discountPct(p.original_price, p.price) }))
    .filter((x) => x.off >= MIN_OFF && x.p.stock > 0)
    .sort((a, b) => b.off - a.off);

  if (mega.length === 0) return null;

  // Duplica os itens para criar loop contínuo e imperceptível
  const items = [...mega, ...mega];

  const stepWidth = () => {
    const el = scrollRef.current;
    if (!el) return 260;
    const card = el.querySelector("[data-mega-card]") as HTMLElement | null;
    return card ? card.offsetWidth + 12 : 260; // 12 = gap-3
  };

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const step = stepWidth();
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
  };

  const pauseAuto = () => {
    pausedRef.current = true;
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      pausedRef.current = false;
    }, PAUSE_AFTER_MANUAL_MS);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;

    const step = stepWidth();
    const pxPerMs = step / SPEED_MS;

    let raf: number;
    let last = performance.now();

    const loop = (now: number) => {
      if (!pausedRef.current) {
        const dt = now - last;
        el.scrollLeft += pxPerMs * dt;
        const half = el.scrollWidth / 2;
        if (el.scrollLeft >= half) {
          el.scrollLeft = el.scrollLeft - half;
        }
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };

    const onEnter = () => { pausedRef.current = true; };
    const onLeave = () => { pausedRef.current = false; };

    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, [items.length]);

  return (
    <section className="relative mb-5 sm:mb-7 rounded-2xl border-2 border-deal/40 bg-gradient-to-br from-deal/15 via-background to-background p-3 sm:p-4 shadow-deal/20 shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-deal text-deal-foreground px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
            <Flame className="h-3 w-3" /> Mega ofertas
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground hidden sm:inline">
            Ofertas imperdíveis
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { pauseAuto(); scroll("left"); }}
            className="h-8 w-8 rounded-full bg-card border border-border flex items-center justify-center hover:bg-deal hover:text-deal-foreground hover:border-deal transition-colors active:scale-90"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => { pauseAuto(); scroll("right"); }}
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
        {items.map(({ p, off }, i) => {
          const cover = productImages(p)[0];
          return (
            <Link
              key={`${p.id}-${i}`}
              data-mega-card
              to="/produto/$id"
              params={{ id: p.id }}
              className="snap-start flex-shrink-0 w-[170px] sm:w-[200px] bg-card rounded-xl border border-border hover:border-deal transition-all overflow-hidden group active:scale-[0.98]"
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
