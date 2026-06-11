import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Header, Footer } from "@/components/Header";
import logo from "@/assets/shopbox-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar · shopbox" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  const signInGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(result.error.message ?? "Erro ao entrar com Google");
      if (result.redirected) return;
      toast.success("Bem-vindo!");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-card">
          <img src={logo} alt="shopbox" className="h-12 mx-auto mb-4" />
          <h1 className="display text-2xl text-center mb-1">Entrar</h1>
          <p className="text-center text-sm text-muted-foreground mb-6">
            Acesse sua conta shopbox
          </p>

          <button
            onClick={signInGoogle}
            disabled={busy}
            className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider py-3 rounded-md hover:scale-[1.01] transition-transform shadow-deal disabled:opacity-60 flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#fff" d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35Z"/>
              <path fill="#fff" d="M12 22c2.7 0 4.964-.895 6.618-2.422l-3.232-2.51c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.598-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22Z"/>
              <path fill="#fff" d="M6.402 13.9a6.005 6.005 0 0 1 0-3.8V7.51H3.064a10 10 0 0 0 0 8.98l3.338-2.59Z"/>
              <path fill="#fff" d="M12 5.977c1.468 0 2.786.504 3.823 1.496l2.868-2.868C16.96 2.99 14.696 2 12 2A9.996 9.996 0 0 0 3.064 7.51L6.402 10.1C7.19 7.737 9.395 5.977 12 5.977Z"/>
            </svg>
            {busy ? "Aguarde..." : "Entrar com Google"}
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
