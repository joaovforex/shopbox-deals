import { cn } from "@/lib/utils";

type Variant = "table" | "cards" | "form" | "list";

/**
 * Skeleton padrão do admin. Renderizado enquanto uma query está `isLoading`
 * — evita mostrar "Nenhum X ainda" antes da resposta chegar (falso vazio).
 */
export function AdminSkeleton({
  variant = "table",
  rows = 6,
  className,
}: {
  variant?: Variant;
  rows?: number;
  className?: string;
}) {
  if (variant === "cards") {
    return (
      <div className={cn("grid gap-3 md:grid-cols-2 lg:grid-cols-3", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className={cn("space-y-4", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <ul className={cn("divide-y divide-border", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  // table (padrão)
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="border-b border-border bg-secondary/60 p-3 flex gap-3">
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        <div className="h-3 w-32 rounded bg-muted animate-pulse ml-auto" />
      </div>
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="p-3 flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="h-3 w-2/5 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-6 w-16 rounded bg-muted animate-pulse shrink-0" />
            <div className="h-6 w-20 rounded bg-muted animate-pulse shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}
