import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number; // 0..5 (pode ser decimal)
  size?: number;
  className?: string;
};

/** Exibe 5 estrelas com preenchimento proporcional ao value. */
export function StarRating({ value, size = 16, className }: Props) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <div className={cn("inline-flex items-center gap-0.5 text-yellow-500", className)} aria-label={`Avaliação ${clamped.toFixed(1)} de 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0" width={size} height={size} strokeWidth={1.5} />
            {fill > 0 && (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
                aria-hidden
              >
                <Star className="fill-yellow-500 text-yellow-500" width={size} height={size} strokeWidth={1.5} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Versão compacta: 1 estrela + número. Usada nos cards. */
export function StarRatingCompact({
  average,
  count,
  className,
}: {
  average: number;
  count: number;
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground",
        className,
      )}
      aria-label={`${average.toFixed(1)} de 5 em ${count} avaliações`}
    >
      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
      <span className="text-foreground">{average.toFixed(1)}</span>
      <span>({count})</span>
    </span>
  );
}
