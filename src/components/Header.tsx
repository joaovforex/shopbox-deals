import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { ShoppingCart, User, LogOut, LayoutDashboard, Home, Store, Search, Menu, Tag, X, Package } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { getRoleSummary, usedCategoriesQuery } from "@/lib/products";
import { PRODUCT_CATEGORIES } from "@/lib/categories";
import logo from "@/assets/shopbox-logo.png";

function useCategories() {
  const { data } = useQuery(usedCategoriesQuery());
  return useMemo(() => {
    const used = new Set(data ?? []);
    return PRODUCT_CATEGORIES.filter((c) => used.has(c));
  }, [data]);
}

function CategoriesDropdown() {
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const go = (c: string) => {
    setOpen(false);
    navigate({ to: "/loja", search: c ? { cat: c } : {} });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2 lg:px-3 h-9 rounded-md hover:bg-secondary transition-colors text-sm font-semibold uppercase tracking-wider"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Tag className="h-4 w-4" />
        Categorias
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 max-h-[70vh] overflow-y-auto rounded-lg border-2 border-primary bg-card shadow-2xl py-2 z-50 animate-scale-in origin-top-right"
        >
          <button
            type="button"
            onClick={() => go("")}
            className="block w-full text-left px-4 py-2 text-sm font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            Todas as ofertas
          </button>
          {categories.length === 0 ? (
            <p className="px-4 py-2 text-xs text-muted-foreground">Carregando...</p>
          ) : (
            categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => go(c)}
                className="block w-full text-left px-4 py-2 text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                {c}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MobileMenu({ user, signOut, hasTeamRole }: { user: { email?: string } | null; signOut: () => void; hasTeamRole: boolean }) {
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const go = (c: string) => {
    setOpen(false);
    navigate({ to: "/loja", search: c ? { cat: c } : {} });
  };

  const drawer = open ? (
    <div className="md:hidden fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
      <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-background border-l-4 border-primary shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="font-black uppercase tracking-wider text-primary">Menu</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-secondary"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 py-2">
          <button onClick={() => go("")} className="block w-full text-left px-4 py-3 font-bold uppercase tracking-wider hover:bg-secondary">
            Todas as ofertas
          </button>
          <div className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Categorias</div>
          {categories.length === 0 ? (
            <p className="px-4 py-2 text-xs text-muted-foreground">Carregando...</p>
          ) : (
            categories.map((c) => (
              <button key={c} onClick={() => go(c)} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-secondary">
                {c}
              </button>
            ))
          )}
          <div className="border-t border-border my-3" />
          {hasTeamRole && (
            <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 font-bold uppercase tracking-wider hover:bg-secondary">
              <LayoutDashboard className="h-4 w-4" /> Admin
            </Link>
          )}
          {user && (
            <Link to="/meus-pedidos" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 font-bold uppercase tracking-wider hover:bg-secondary">
              <Package className="h-4 w-4" /> Meus pedidos
            </Link>
          )}
          {user ? (
            <button onClick={() => { setOpen(false); signOut(); }} className="flex items-center gap-3 w-full text-left px-4 py-3 font-bold uppercase tracking-wider hover:bg-secondary">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          ) : (
            <Link to="/auth" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 font-bold uppercase tracking-wider hover:bg-secondary">
              <User className="h-4 w-4" /> Entrar
            </Link>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-md bg-secondary hover:bg-muted transition-colors"
        aria-label="Menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      {drawer && typeof document !== "undefined" ? createPortal(drawer, document.body) : null}
    </>
  );
}

export function Header() {
  const { count } = useCart();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [hasTeamRole, setHasTeamRole] = useState(false);

  useEffect(() => {
    const sync = () => getRoleSummary().then((r) => setHasTeamRole(r.hasAnyTeamRole));
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? { email: data.user.email ?? undefined } : null);
      if (data.user) sync(); else setHasTeamRole(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? { email: session.user.email ?? undefined } : null);
      if (session?.user) sync(); else setHasTeamRole(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <>
      <div className="deal-stripe text-deal-foreground text-[10px] sm:text-xs font-bold py-1.5 overflow-hidden">
        <div className="ticker flex gap-8 sm:gap-12 whitespace-nowrap w-max">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-8 sm:gap-12">
              <span>SUPER OFERTAS DA SEMANA</span>
              <span>PIX E CARTOES</span>
              <span>ATE 70% OFF</span>
              <span>RETIRE NA LOJA EM COLOMBO</span>
            </div>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b-4 border-primary">
        <div className="container mx-auto px-3 sm:px-4 h-16 sm:h-20 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4">
          <Link to="/loja" className="flex items-center shrink-0">
            <img src={logo} alt="shopbox" className="h-12 sm:h-16 lg:h-20 w-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] hover:scale-105 transition-transform" />
          </Link>

          <nav className="hidden md:flex items-center justify-center gap-1 lg:gap-2 text-sm font-semibold uppercase tracking-wider min-w-0">
            <Link to="/" className="px-2 lg:px-3 h-9 inline-flex items-center rounded-md hover:bg-secondary transition-colors">Início</Link>
            <Link to="/loja" className="px-2 lg:px-3 h-9 inline-flex items-center rounded-md hover:bg-secondary transition-colors">Ofertas</Link>
            <CategoriesDropdown />
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 justify-end">
            {hasTeamRole && (
              <Link
                to="/admin"
                aria-label="Admin"
                className="hidden md:inline-flex items-center gap-2 px-2 sm:px-3 h-10 rounded-md bg-accent text-accent-foreground text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden lg:inline">Admin</span>
              </Link>
            )}
            <Link
              to="/carrinho"
              className="relative inline-flex items-center justify-center h-10 w-10 rounded-md bg-secondary hover:bg-muted transition-colors"
              aria-label="Carrinho"
            >
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1 animate-scale-in">
                  {count}
                </span>
              )}
            </Link>
            {user ? (
              <button
                onClick={signOut}
                className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-secondary hover:bg-muted transition-colors"
                aria-label="Sair"
              >
                <LogOut className="h-5 w-5" />
              </button>
            ) : (
              <Link
                to="/auth"
                className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-secondary hover:bg-muted transition-colors"
                aria-label="Entrar"
              >
                <User className="h-5 w-5" />
              </Link>
            )}
            <MobileMenu user={user} signOut={signOut} hasTeamRole={hasTeamRole} />
          </div>
        </div>
      </header>
    </>
  );
}

export function MobileBottomNav() {
  const { count } = useCart();
  const router = useRouterState();
  const path = router.location.pathname;
  const item = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors ${
      active ? "text-primary" : "text-muted-foreground"
    }`;
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t-2 border-primary safe-area">
      <div className="grid grid-cols-4">
        <Link
          to="/loja"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={item(path === "/" || path === "/loja")}
        >
          <Home className="h-5 w-5" /> Início
        </Link>
        <Link to="/loja" search={{}} className={item(path === "/loja")}>
          <Store className="h-5 w-5" /> Ofertas
        </Link>
        <Link
          to="/loja"
          search={{ focus: 1 }}
          onClick={() => {
            setTimeout(() => {
              const el = document.getElementById("loja-search") as HTMLInputElement | null;
              el?.focus();
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 60);
          }}
          className={item(false)}
        >
          <Search className="h-5 w-5" /> Buscar
        </Link>
        <Link to="/carrinho" className={item(path === "/carrinho") + " relative"}>
          <ShoppingCart className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute top-1 right-[22%] bg-accent text-accent-foreground text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
              {count}
            </span>
          )}
          Carrinho
        </Link>
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 sm:mt-20 border-t-4 border-primary bg-card pb-20 md:pb-0">
      <div className="container mx-auto px-4 py-10 grid sm:grid-cols-3 gap-8">
        <div>
          <img src={logo} alt="shopbox" className="h-16 w-auto mb-3 drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
          <p className="text-sm text-muted-foreground">
            Sua loja de super descontos em Colombo. Preços de atacado, atendimento de bairro.
          </p>
        </div>
        <div>
          <h4 className="font-bold uppercase tracking-wider mb-3 text-primary">Atendimento</h4>
          <p className="text-sm text-muted-foreground">Rua Emílio Gleber, 1118 — Atuba, Colombo / PR</p>
          <p className="text-sm text-muted-foreground">Seg a Sáb · 9h às 18h</p>
        </div>
        <div>
          <h4 className="font-bold uppercase tracking-wider mb-3 text-primary">Formas de pagamento</h4>
          <p className="text-sm text-muted-foreground">Pix · Cartão · Parcelado</p>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground px-4">
        © {new Date().getFullYear()} shopbox · Todos os direitos reservados
      </div>
    </footer>
  );
}
