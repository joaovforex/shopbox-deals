import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

const VARIANTS: Record<AdminButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
  secondary: "border border-border bg-secondary text-foreground hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90",
  ghost: "text-foreground hover:bg-muted",
};

/**
 * Botão padrão da área administrativa.
 * Hierarquia: `primary` = ação principal, `secondary` = apoio,
 * `destructive` = apenas exclusão/cancelamento, `ghost` = ação discreta.
 * Alvo de toque mínimo 44px e estados de foco/carregando/desabilitado consistentes.
 */
export const AdminButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: AdminButtonVariant;
    loading?: boolean;
    icon?: React.ReactNode;
    block?: boolean;
  }
>(function AdminButton(
  { variant = "secondary", loading = false, icon, block = false, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3.5 text-xs font-black uppercase tracking-wider transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        block ? "w-full" : "w-auto",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
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
