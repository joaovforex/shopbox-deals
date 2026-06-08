import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function ProductCarousel({
  images,
  alt,
  autoPlayMs = 3500,
}: {
  images: string[];
  alt: string;
  autoPlayMs?: number;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = images.length;

  useEffect(() => {
    if (n <= 1 || paused) return;
    const t = setInterval(() => setI((p) => (p + 1) % n), autoPlayMs);
    return () => clearInterval(t);
  }, [n, paused, autoPlayMs]);

  if (n === 0) {
    return (
      <div className="aspect-square bg-card rounded-xl border border-border flex items-center justify-center text-muted-foreground">
        Sem imagem
      </div>
    );
  }

  const go = (d: number) => setI((p) => (p + d + n) % n);

  return (
    <div
      className="relative aspect-square bg-card rounded-xl overflow-hidden border border-border group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${i * 100}%)` }}
      >
        {images.map((src, idx) => (
          <img
            key={src + idx}
            src={src}
            alt={`${alt} ${idx + 1}`}
            className="w-full h-full object-cover shrink-0"
            draggable={false}
          />
        ))}
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Imagem anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/70 hover:bg-background backdrop-blur p-2 rounded-full opacity-0 group-hover:opacity-100 transition"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Próxima imagem"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/70 hover:bg-background backdrop-blur p-2 rounded-full opacity-0 group-hover:opacity-100 transition"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Ir para imagem ${idx + 1}`}
                onClick={() => setI(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-primary" : "w-1.5 bg-foreground/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
