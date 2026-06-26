import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, Play } from "lucide-react";
import { isVideoUrl } from "@/lib/products";

export function ProductCarousel({
  images,
  alt,
  autoPlayMs = 1800,
}: {
  images: string[];
  alt: string;
  autoPlayMs?: number;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [zoom, setZoom] = useState(false);
  const n = images.length;

  const currentIsVideo = isVideoUrl(images[i]);
  useEffect(() => {
    if (n <= 1 || paused || zoom || currentIsVideo) return;
    const t = setInterval(() => setI((p) => (p + 1) % n), autoPlayMs);
    return () => clearInterval(t);
  }, [n, paused, autoPlayMs, zoom, currentIsVideo]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") setI((p) => (p + 1) % n);
      if (e.key === "ArrowLeft") setI((p) => (p - 1 + n) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, n]);

  if (n === 0) {
    return (
      <div className="aspect-square bg-card rounded-xl border border-border flex items-center justify-center text-muted-foreground">
        Sem imagem
      </div>
    );
  }

  const go = (d: number) => setI((p) => (p + d + n) % n);

  return (
    <>
      <div
        className="relative aspect-square bg-card rounded-xl overflow-hidden border border-border group"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {images.map((src, idx) => (
            <button
              key={src + idx}
              type="button"
              onClick={() => setZoom(true)}
              className="w-full h-full shrink-0 cursor-zoom-in bg-card"
              aria-label={isVideoUrl(src) ? "Ampliar vídeo" : "Ampliar imagem"}
            >
              {isVideoUrl(src) ? (
                <video
                  src={src}
                  className="w-full h-full object-contain bg-black"
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={src}
                  alt={`${alt} ${idx + 1}`}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="Ampliar"
          className="absolute top-2 right-2 bg-background/70 hover:bg-background backdrop-blur p-2 rounded-full"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Imagem anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background backdrop-blur p-2 rounded-full md:opacity-0 md:group-hover:opacity-100 transition"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Próxima imagem"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background backdrop-blur p-2 rounded-full md:opacity-0 md:group-hover:opacity-100 transition"
            >
              <ChevronRight className="h-5 w-5" />
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

      {n > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, idx) => (
            <button
              key={src + "thumb" + idx}
              type="button"
              onClick={() => setI(idx)}
              aria-label={`Selecionar ${isVideoUrl(src) ? "vídeo" : "imagem"} ${idx + 1}`}
              className={`relative shrink-0 h-16 w-16 rounded-md overflow-hidden border-2 transition ${
                idx === i ? "border-primary" : "border-border opacity-70 hover:opacity-100"
              }`}
            >
              {isVideoUrl(src) ? (
                <>
                  <video src={src} className="w-full h-full object-cover bg-black" muted playsInline preload="metadata" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <Play className="h-5 w-5 text-white fill-white" />
                  </span>
                </>
              ) : (
                <img src={src} alt={`${alt} miniatura ${idx + 1}`} className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoom(false); }}
            aria-label="Fechar"
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 p-2 rounded-full text-white"
          >
            <X className="h-5 w-5" />
          </button>

          {isVideoUrl(images[i]) ? (
            <video
              src={images[i]}
              className="max-h-full max-w-full object-contain"
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={images[i]}
              alt={`${alt} ampliada`}
              className="max-h-full max-w-full object-contain select-none"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />
          )}

          {n > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                aria-label="Imagem anterior"
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 p-3 rounded-full text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                aria-label="Próxima imagem"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 p-3 rounded-full text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm">
                {i + 1} / {n}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
