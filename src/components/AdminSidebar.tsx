import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Package,
  Truck,
  BarChart3,
  ShoppingBag,
  QrCode,
  Undo2,
  Coins,
  Gift,
  FileText,
  Radio,
  Users,
  Settings,
  Link2,
  Activity,
  ScrollText,
  ChevronDown,
  Boxes,
  Wallet,
  Wrench,
  Menu,
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

type Group = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Item[];
};

const GROUPS: Group[] = [
  {
    id: "catalogo",
    label: "Catálogo",
    icon: Boxes,
    items: [
      { to: "/admin", label: "Produtos", icon: Package, color: "text-primary", show: (r) => r.isCatalog || r.isManager },
      { to: "/admin/links", label: "Links curtos", icon: Link2, color: "text-teal-600", show: (r) => r.isSuperAdmin },
      { to: "/admin/agendador-canal", label: "Canal", icon: Radio, color: "text-fuchsia-600", show: (r) => r.isSuperAdmin },
    ],
  },
  {
    id: "vendas",
    label: "Vendas",
    icon: ShoppingBag,
    items: [
      { to: "/admin/pedidos", label: "Pedidos", icon: BarChart3, color: "text-emerald-600", show: (r) => r.isSuperAdmin },
      { to: "/admin/venda-manual", label: "Venda manual", icon: ShoppingBag, color: "text-orange-600", show: (r) => r.isSuperAdmin },
      { to: "/admin/caixa-qr", label: "Caixa QR", icon: QrCode, color: "text-indigo-600", show: (r) => r.isSuperAdmin || r.isCashier },
      { to: "/admin/expedicao", label: "Expedição", icon: Truck, color: "text-blue-600", show: (r) => r.isSuperAdmin || r.isManager || r.isFulfillment },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: Wallet,
    items: [
      { to: "/admin/reembolsos", label: "Reembolsos", icon: Undo2, color: "text-rose-600", show: (r) => r.isSuperAdmin },
      { to: "/admin/vale-troca", label: "Vale-troca", icon: Gift, color: "text-pink-600", show: (r) => r.isSuperAdmin },
      { to: "/admin/cashback", label: "Cashback", icon: Coins, color: "text-amber-500", show: (r) => r.isSuperAdmin },
      { to: "/admin/fiscal", label: "Fiscal", icon: FileText, color: "text-amber-600", show: (r) => r.isSuperAdmin },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    icon: Wrench,
    items: [
      { to: "/admin/equipe", label: "Equipe", icon: Users, color: "text-cyan-600", show: (r) => r.isSuperAdmin },
      { to: "/admin/auditoria", label: "Logs", icon: ScrollText, color: "text-violet-600", show: (r) => r.isSuperAdmin },
      { to: "/admin/saude", label: "Saúde", icon: Activity, color: "text-lime-600", show: (r) => r.isSuperAdmin },
      { to: "/admin/configuracoes", label: "Configurações", icon: Settings, color: "text-slate-600", show: (r) => r.isSuperAdmin },
    ],
  },
];

const STORAGE_KEY = "admin.sidebar.group";

function isActive(pathname: string, to: string) {
  return pathname === to || (to !== "/admin" && pathname.startsWith(to));
}

export function AdminSidebar({ roles }: { roles: RoleSummary }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.show(roles)) })).filter(
        (g) => g.items.length > 0,
      ),
    [roles],
  );

  const currentGroup = groups.find((g) => g.items.some((i) => isActive(pathname, i.to)))?.id;
  const [open, setOpen] = useState<string | null>(currentGroup ?? groups[0]?.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (currentGroup) {
      setOpen(currentGroup);
      try {
        localStorage.setItem(STORAGE_KEY, currentGroup);
      } catch { /* ignora */ }
    }
  }, [currentGroup]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const activeItem = groups.flatMap((g) => g.items).find((i) => isActive(pathname, i.to));

  return (
    <>
      {/* Desktop: acordeão compacto */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 border-r border-border bg-card sticky top-0 h-screen py-3 gap-1 overflow-y-auto">
        {groups.map((g) => {
          const GroupIcon = g.icon;
          const expanded = open === g.id;
          return (
            <div key={g.id} className="px-2">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : g.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-2 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors",
                  expanded ? "text-foreground bg-secondary/60" : "text-muted-foreground hover:bg-secondary/40",
                )}
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{g.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
              </button>
              {expanded && (
                <ul className="mt-1 mb-2 flex flex-col gap-0.5">
                  {g.items.map((it) => {
                    const active = isActive(pathname, it.to);
                    const Icon = it.icon;
                    return (
                      <li key={it.to}>
                        <Link
                          to={it.to}
                          className={cn(
                            "flex items-center gap-2 pl-4 pr-2 py-2 rounded-md text-xs font-medium transition-colors",
                            active
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", active ? it.color : "text-current")} />
                          <span className="truncate">{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </aside>

      {/* Mobile/tablet: botão de menu + painel agrupado */}
      <nav className="lg:hidden sticky top-0 z-30 bg-card border-b border-border">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 min-h-12 text-xs font-bold uppercase tracking-wider"
        >
          <Menu className="h-4 w-4" />
          <span className="flex-1 text-left truncate">{activeItem?.label ?? "Menu"}</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", mobileOpen && "rotate-180")} />
        </button>
        {mobileOpen && (
          <div className="border-t border-border max-h-[70vh] overflow-y-auto pb-2">
            {groups.map((g) => (
              <div key={g.id} className="px-3 pt-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                  {g.label}
                </div>
                <ul className="grid grid-cols-2 gap-1.5">
                  {g.items.map((it) => {
                    const active = isActive(pathname, it.to);
                    const Icon = it.icon;
                    return (
                      <li key={it.to}>
                        <Link
                          to={it.to}
                          className={cn(
                            "flex items-center gap-2 px-3 min-h-11 rounded-md border text-xs font-medium",
                            active
                              ? "bg-secondary border-border text-foreground"
                              : "border-border/60 text-muted-foreground",
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", active ? it.color : "text-current")} />
                          <span className="truncate">{it.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </nav>
    </>
  );
}
