import { Link, useRouterState } from "@tanstack/react-router";
import {
  Package,
  Truck,
  BarChart3,
  ShoppingBag,
  QrCode,
  Undo2,
  Gift,
  FileText,
  Radio,
  Users,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoleSummary } from "@/lib/products";

type Item = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  show: (r: RoleSummary) => boolean;
};

const ITEMS: Item[] = [
  { to: "/admin", label: "Produtos", icon: Package, color: "text-primary", show: (r) => r.isCatalog || r.isManager },
  { to: "/admin/expedicao", label: "Expedição", icon: Truck, color: "text-blue-600", show: (r) => r.isSuperAdmin || r.isManager || r.isFulfillment },
  { to: "/admin/pedidos", label: "Pedidos", icon: BarChart3, color: "text-emerald-600", show: (r) => r.isSuperAdmin },
  { to: "/admin/venda-manual", label: "Venda manual", icon: ShoppingBag, color: "text-orange-600", show: (r) => r.isSuperAdmin },
  { to: "/admin/caixa-qr", label: "Caixa QR", icon: QrCode, color: "text-indigo-600", show: (r) => r.isSuperAdmin || r.isCashier },
  { to: "/admin/reembolsos", label: "Reembolsos", icon: Undo2, color: "text-rose-600", show: (r) => r.isSuperAdmin },
  { to: "/admin/vale-troca", label: "Vale-troca", icon: Gift, color: "text-pink-600", show: (r) => r.isSuperAdmin },
  { to: "/admin/fiscal", label: "Fiscal", icon: FileText, color: "text-amber-600", show: (r) => r.isSuperAdmin },
  { to: "/admin/agendador-canal", label: "Canal", icon: Radio, color: "text-fuchsia-600", show: (r) => r.isSuperAdmin },
  { to: "/admin/equipe", label: "Equipe", icon: Users, color: "text-cyan-600", show: (r) => r.isSuperAdmin },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings, color: "text-slate-600", show: (r) => r.isSuperAdmin },
];

export function AdminSidebar({ roles }: { roles: RoleSummary }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = ITEMS.filter((i) => i.show(roles));

  return (
    <>
      {/* Desktop: barra lateral fixa com ícones grandes */}
      <aside className="hidden lg:flex flex-col w-24 shrink-0 border-r border-border bg-card sticky top-0 h-screen py-4 gap-1 overflow-y-auto">
        {items.map((it) => {
          const active = pathname === it.to || (it.to !== "/admin" && pathname.startsWith(it.to));
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex flex-col items-center gap-1 px-2 py-3 mx-2 rounded-lg text-[10px] font-medium uppercase tracking-wider text-center leading-tight transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
              title={it.label}
            >
              <Icon className={cn("h-6 w-6", active ? it.color : "text-current")} />
              <span className="line-clamp-2">{it.label}</span>
            </Link>
          );
        })}
      </aside>

      {/* Mobile/tablet: barra horizontal rolável */}
      <nav className="lg:hidden sticky top-0 z-30 bg-card border-b border-border overflow-x-auto">
        <ul className="flex gap-1 px-2 py-2 min-w-max">
          {items.map((it) => {
            const active = pathname === it.to || (it.to !== "/admin" && pathname.startsWith(it.to));
            const Icon = it.icon;
            return (
              <li key={it.to}>
                <Link
                  to={it.to}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-2 rounded-md text-[10px] font-medium uppercase tracking-wider min-w-[60px]",
                    active ? "bg-secondary text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? it.color : "text-current")} />
                  <span>{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
