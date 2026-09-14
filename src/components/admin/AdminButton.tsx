import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type AdminButtonSize = "sm" | "md";

const VARIANTS: Record<AdminButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/80",
  secondary:
    "border border-border bg-card text-foreground shadow-sm hover:bg-secondary active:bg-muted",
  destructive:
    "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80",
  ghost:
    "text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-muted",
};

const SIZES: Record<AdminButtonSize, string> = {
  sm: "min-h-9 px-3 text-xs gap-1.5",
  md: "min-h-11 px-4 text-sm gap-2",
};

/**
 * Botão padrão da área administrativa.
 * Hierarquia: `primary` = ação principal, `secondary` = apoio,
 * `destructive` = apenas exclusão/cancelamento, `ghost` = ação discreta.
 * Tom profissional: peso semibold (sem caixa-alta gritante), cantos suaves,
 * estados de hover/ativo/foco/carregando consistentes. Alvo de toque ≥44px (md).
 */
export const AdminButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: AdminButtonVariant;
    size?: AdminButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
    block?: boolean;
  }
>(function AdminButton(
  { variant = "secondary", size = "md", loading = false, icon, block = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-all",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
        SIZES[size],
        block ? "w-full" : "w-auto",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn("animate-spin", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden />
      ) : (
        icon
      )}
      <span className="truncate">{children}</span>
    </button>
  );
});

/** Barra de ações responsiva: empilha no celular, alinha no desktop. */
export function AdminActionBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {children}
    </div>
  );
}
