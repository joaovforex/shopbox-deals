import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import desktopAsset from "@/assets/cashback-banner-wide.jpg.asset.json";
import mobileAsset from "@/assets/cashback-banner-mobile.jpg.asset.json";
import { useSiteSettings, formatCashbackLabel } from "@/lib/site-settings";
import { useActiveBanners, isExternalBannerLink, isSafeBannerLink, type SiteBanner } from "@/lib/banners";
import { trackBannerClick, trackBannerImpression } from "@/lib/analytics";

const AUTOPLAY_MS = 6000;

type Slide = {
  id: string;
  desktop_url: string;
  mobile_url: string;
  alt_text: string;
  link_url: string | null;
  /** Slide padrão (assets/site_settings) tem proporção diferente do padrão 800x800. */
  fallback?: boolean;
};

/** Proporção do quadro: slides do painel usam 800x800 / 1600x500. */
function frameClass(slide: Slide): string {
  return slide.fallback ? "aspect-[5/3] md:aspect-[16/5]" : "aspect-square md:aspect-[16/5]";
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function SlideImage({ slide, eager }: { slide: Slide; eager: boolean }) {
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={slide.desktop_url} width={1600} height={500} />
      <img
        src={slide.mobile_url}
        alt={slide.alt_text}
        className={`w-full h-full ${slide.fallback ? "object-contain" : "object-cover"}`}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding={eager ? "sync" : "async"}
        width={800}
        height={800}
      />
    </picture>
  );
}

/** Envolve o slide num link seguro (interno ou https externo) quando houver destino. */
function SlideFrame({
  slide,
  index,
  total,
  children,
}: {
  slide: Slide;
  index: number;
  total: number;
  children: React.ReactNode;
}) {
  const onClick = () =>
    trackBannerClick({
      bannerId: slide.id,
      index,
      total,
      destination: slide.link_url,
    });

  // Só emite href para links seguros (interno "/..." ou https). Qualquer coisa
  // fora disso (ex.: javascript:) é renderizada sem link — defesa no render.
  if (!slide.link_url || !isSafeBannerLink(slide.link_url)) {
    return <div className="block w-full h-full">{children}</div>;
  }

  if (isExternalBannerLink(slide.link_url)) {
    return (
      <a
        href={slide.link_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="block w-full h-full"
      >
        {children}
      </a>
    );
  }

  return (
    <Link to={slide.link_url} onClick={onClick} className="block w-full h-full">
      {children}
    </Link>
  );
}

export function AnnouncementBanner() {
  const { data: settings } = useSiteSettings();
  const { data: banners } = useActiveBanners();
  const reducedMotion = usePrefersReducedMotion();

  const label = formatCashbackLabel(settings?.cashback_rate ?? 0.05);

  /** Fallback em três níveis: banners ativos -> site_settings -> assets locais. */
  const slides: Slide[] = useMemo(() => {
    const rows = (banners ?? []) as SiteBanner[];
    if (rows.length > 0) {
      return rows.map((b) => ({
        id: b.id,
        desktop_url: b.desktop_url,
        mobile_url: b.mobile_url,
        alt_text: b.alt_text,
        link_url: b.link_url,
      }));
    }
    const alt = `Compre no site e ganhe ${label} de cashback para usar nas próximas compras`;
    if (settings?.banner_desktop_url && settings?.banner_mobile_url) {
      return [
        {
          id: "site-settings",
          desktop_url: settings.banner_desktop_url,
          mobile_url: settings.banner_mobile_url,
          alt_text: alt,
          link_url: "/loja",
          fallback: true,
        },
      ];
    }
    return [
      {
        id: "local-asset",
        desktop_url: desktopAsset.url,
        mobile_url: mobileAsset.url,
        alt_text: alt,
        link_url: "/loja",
        fallback: true,
      },
    ];
  }, [banners, settings, label]);

  const total = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback(
    (next: number) => {
      const el = trackRef.current;
      if (!el || total === 0) return;
      const target = ((next % total) + total) % total;
      el.scrollTo({
        left: el.clientWidth * target,
        behavior: reducedMotion ? "auto" : "smooth",
      });
      setIndex(target);
    },
    [total, reducedMotion],
  );

  // Índice real conforme o usuário arrasta (swipe).
  useEffect(() => {
    const el = trackRef.current;
    if (!el || total <= 1) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = el.clientWidth || 1;
        setIndex(Math.round(el.scrollLeft / w));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [total]);

  // Autoplay: só com vários slides, sem reduced motion, aba visível e sem hover/foco.
  useEffect(() => {
    if (total <= 1 || reducedMotion || paused) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const id = setInterval(() => goTo(index + 1), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [total, reducedMotion, paused, index, goTo]);

  // Pausa quando a aba fica oculta.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Impressão do slide visível (deduplicada por banner).
  useEffect(() => {
    const slide = slides[index];
    if (!slide) return;
    trackBannerImpression({ bannerId: slide.id, index, total });
  }, [slides, index, total]);

  if (total === 0) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (total <= 1) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  // Um slide: banner estático, sem controles nem autoplay.
  if (total === 1) {
    const only = slides[0];
    return (
      <div className="w-full bg-black">
        <div className={frameClass(only)}>
          <SlideFrame slide={only} index={0} total={1}>
            <SlideImage slide={only} eager />
          </SlideFrame>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques da loja"
      className="relative w-full bg-black group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      <div
        ref={trackRef}
        className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {slides.map((s, i) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`Banner ${i + 1} de ${total}`}
            className={`snap-start shrink-0 w-full ${frameClass(s)}`}
          >
            <SlideFrame slide={s} index={i} total={total}>
              <SlideImage slide={s} eager={i === 0} />
            </SlideFrame>
          </div>
        ))}
      </div>

      <span aria-live="polite" className="sr-only">
        {`Banner ${index + 1} de ${total}`}
      </span>

      <button
        type="button"
        onClick={() => goTo(index - 1)}
        aria-label="Banner anterior"
        className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => goTo(index + 1)}
        aria-label="Próximo banner"
        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/80 text-foreground shadow hover:bg-background focus-visible:outline-2 focus-visible:outline-primary"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>

      <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-2">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Ir para o banner ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            className={`h-2.5 rounded-full transition-all ${
              i === index ? "w-6 bg-primary" : "w-2.5 bg-background/70 hover:bg-background"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
