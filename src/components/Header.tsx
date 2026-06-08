import { Link, useRouterState } from "@tanstack/react-router";
import { ShoppingCart, User, LogOut, LayoutDashboard, Home, Store, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { getRoleSummary } from "@/lib/products";
import logo from "@/assets/shopbox-logo.png";

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
      {/* Top deal stripe */}
      <div className="deal-stripe text-deal-foreground text-[10px] sm:text-xs font-bold py-1.5 overflow-hidden">
        <div className="ticker flex gap-8 sm:gap-12 whitespace-nowrap w-max">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-8 sm:gap-12">
              <span>🔥 SUPER OFERTAS DA SEMANA</span>
              <span>⚡ FRETE COMBINADO NO WHATSAPP</span>
              <span>💳 PIX, CARTÃO E PARCELADO</span>
              <span>🎁 ATÉ 70% OFF</span>
              <span>📦 RETIRE NA LOJA EM COLOMBO</span>
            </div>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b-4 border-primary">
        <div className="container mx-auto px-3 sm:px-4 h-16 sm:h-20 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src={logo} alt="shopbox" className="h-11 sm:h-14 w-auto" width={224} height={72} />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold uppercase tracking-wider">
            <Link to="/" className="hover:text-primary transition-colors">Início</Link>
            <Link to="/loja" className="hover:text-primary transition-colors">Ofertas</Link>
            <Link to="/carrinho" className="hover:text-primary transition-colors">Carrinho</Link>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasTeamRole && (
              <Link
                to="/admin"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-md bg-accent text-accent-foreground text-sm font-bold hover:opacity-90 transition-opacity"
              >
                <LayoutDashboard className="h-4 w-4" /> Admin
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
        <Link to="/" className={item(path === "/")}>
          <Home className="h-5 w-5" /> Início
        </Link>
        <Link to="/loja" className={item(path === "/loja")}>
          <Store className="h-5 w-5" /> Ofertas
        </Link>
        <Link to="/loja" className={item(false)}>
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
          <img src={logo} alt="shopbox" className="h-11 w-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Sua loja de super descontos em Colombo. Preços de atacado, atendimento de bairro.
          </p>
        </div>
        <div>
          <h4 className="font-bold uppercase tracking-wider mb-3 text-primary">Atendimento</h4>
          <p className="text-sm text-muted-foreground">Rua, 2996 — Colombo / PR</p>
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
