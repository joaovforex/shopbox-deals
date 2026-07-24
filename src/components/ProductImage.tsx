import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string | null;
  alt: string;
  /** Classe do wrapper (o wrapper deve definir o tamanho / aspect-ratio). */
  wrapperClassName?: string;
  /** Classe extra da imagem além de object-cover w-full h-full. */
  imgClassName?: string;
  /** Renderiza um placeholder alternativo quando não há src. */
  fallback?: React.ReactNode;
};

/**
 * Imagem de produto com skeleton shimmer enquanto carrega e fade-in ao concluir.
 * Cai para um fallback quando não há src ou quando o carregamento falha.
 */
export function ProductImage({
  src,
  alt,
  wrapperClassName,
  imgClassName,
  fallback,
  className: _ignored,
  ...imgProps
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const showFallback = !src || errored;

  return (
    <div className={cn("relative w-full h-full overflow-hidden bg-muted", wrapperClassName)}>
      {showFallback ? (
        fallback ?? (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Sem imagem
          </div>
        )
      ) : (
        <>
          {!loaded && (
            <Skeleton
              aria-hidden
              className="absolute inset-0 rounded-none bg-gradient-to-r from-muted via-muted-foreground/10 to-muted"
            />
          )}
          <img
            {...imgProps}
            src={src ?? undefined}
            alt={alt}
            onLoad={(e) => {
              setLoaded(true);
              imgProps.onLoad?.(e);
            }}
            onError={(e) => {
              setErrored(true);
              imgProps.onError?.(e);
            }}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-500",
              loaded ? "opacity-100" : "opacity-0",
              imgClassName,
            )}
          />
        </>
      )}
    </div>
  );
}
