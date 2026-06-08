import { Link } from "@tanstack/react-router";
import { ShoppingCart, User, LogOut, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { isAdmin } from "@/lib/products";
import logo from "@/assets/shopbox-logo.png";

export function Header() {
  const { count } = useCart();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? { email: data.user.email ?? undefined } : null);
      isAdmin().then(setAdmin);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ? { email: session.user.email ?? undefined } : null);
      isAdmin().then(setAdmin);
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
      <div className="deal-stripe text-deal-foreground text-xs font-bold py-1.5 overflow-hidden">
        <div className="ticker flex gap-12 whitespace-nowrap w-max">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-12">
              <span>🔥 SUPER OFERTAS DA SEMANA</span>
              <span>⚡ FRETE COMBINADO NO WHATSAPP</span>
              <span>💳 PIX, CARTÃO E PARCELADO</span>
              <span>🎁 ATÉ 70% OFF EM PRODUTOS SELECIONADOS</span>
              <span>📦 RETIRE NA LOJA EM COLOMBO</span>
            </div>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b-4 border-primary">
        <div className="container mx-auto px-4 h-18 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="shopbox" className="h-14 w-auto" width={224} height={72} />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold uppercase tracking-wider">
            <Link to="/" className="hover:text-primary transition-colors">Início</Link>
            <Link to="/loja" className="hover:text-primary transition-colors">Ofertas</Link>
            <Link to="/carrinho" className="hover:text-primary transition-colors">Carrinho</Link>
          </nav>

          <div className="flex items-center gap-2">
            {admin && (
              <Link
                to="/admin"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-md bg-accent text-accent-foreground text-sm font-bold hover:opacity-90"
              >
                <LayoutDashboard className="h-4 w-4" /> Admin
              </Link>
            )}
            <Link
              to="/carrinho"
              className="relative inline-flex items-center justify-center h-10 w-10 rounded-md bg-secondary hover:bg-muted"
              aria-label="Carrinho"
            >
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                  {count}
                </span>
              )}
            </Link>
            {user ? (
              <button
                onClick={signOut}
                className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-secondary hover:bg-muted"
                aria-label="Sair"
              >
                <LogOut className="h-5 w-5" />
              </button>
            ) : (
              <Link
                to="/auth"
                className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-secondary hover:bg-muted"
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

export function Footer() {
  return (
    <footer className="mt-20 border-t-4 border-primary bg-card">
      <div className="container mx-auto px-4 py-10 grid md:grid-cols-3 gap-8">
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
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} shopbox · Todos os direitos reservados
      </div>
    </footer>
  );
}
