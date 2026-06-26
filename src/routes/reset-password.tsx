import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Header, Footer } from "@/components/Header";
import logo from "@/assets/shopbox-logo.png";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha · shopbox" }] }),
  component: ResetPasswordPage,
});

function scorePassword(pw: string) {
  const checks = {
    len: pw.length >= 8,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    num: /\d/.test(pw),
    sym: /[^A-Za-z0-9]/.test(pw),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  let score = 0;
  if (pw.length === 0) score = 0;
  else if (pw.length < 6 || passed <= 1) score = 1;
  else if (passed === 2) score = 2;
  else if (passed === 3 || (passed === 4 && pw.length < 10)) score = 3;
  else score = 4;
  const labels = ["", "Muito fraca", "Fraca", "Boa", "Forte"];
  const colors = ["bg-muted", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];
  return { score, label: labels[score], color: colors[score], checks };
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const strength = useMemo(() => scorePassword(password), [password]);

  useEffect(() => {
    // O Supabase coloca o token de recuperação no hash da URL e cria uma sessão temporária.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      else {
        toast.error("Link inválido ou expirado. Solicite outro e-mail de recuperação.");
        setTimeout(() => navigate({ to: "/auth" }), 1500);
      }
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("As senhas não conferem.");
    if (strength.score < 2) return toast.error("Senha muito fraca. Use letras, números e 8+ caracteres.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha redefinida! Você já pode entrar.");
      await supabase.auth.signOut();
      navigate({ to: "/auth" });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao redefinir a senha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-card">
          <img src={logo} alt="shopbox" className="h-24 sm:h-28 mx-auto mb-6 drop-shadow-[0_6px_18px_rgba(0,0,0,0.4)]" />
          <h1 className="display text-2xl text-center mb-1">Redefinir senha</h1>
          <p className="text-center text-sm text-muted-foreground mb-6">
            Escolha uma nova senha para sua conta.
          </p>

          {!ready ? (
            <p className="text-center text-sm text-muted-foreground">Validando link…</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="relative">
                <input
                  required
                  type={showPw ? "text" : "password"}
                  name="new-password"
                  autoComplete="new-password"
                  placeholder="Nova senha"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-input rounded-md px-3 py-2.5 pr-11 border border-border focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {password.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? strength.color : "bg-muted"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Segurança: <span className="font-semibold text-foreground">{strength.label}</span>
                  </p>
                </div>
              )}

              <input
                required
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Confirmar nova senha"
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
              />

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider py-3 rounded-md hover:scale-[1.01] transition-transform shadow-deal disabled:opacity-60"
              >
                {busy ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
