import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Header, Footer } from "@/components/Header";
import logo from "@/assets/shopbox-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar · shopbox" }] }),
  component: AuthPage,
});

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function isValidCpf(v: string) {
  const cpf = v.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(cpf[10]);
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (fullName.trim().length < 3) throw new Error("Informe seu nome completo");
        const phoneDigits = phone.replace(/\D/g, "");
        if (phoneDigits.length < 10 || phoneDigits.length > 11) throw new Error("WhatsApp inválido (com DDD)");
        const cpfDigits = cpf.replace(/\D/g, "");
        if (!isValidCpf(cpfDigits)) throw new Error("CPF inválido");

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, phone: phoneDigits, cpf: cpfDigits },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          toast.success("Conta criada! Você já pode entrar.");
        } else {
          toast.success("Conta criada! Bem-vindo!");
          navigate({ to: "/" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate({ to: "/" });
      }
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
          <img src={logo} alt="shopbox" className="h-24 sm:h-28 mx-auto mb-6 drop-shadow-[0_6px_18px_rgba(0,0,0,0.4)]" />
          <h1 className="display text-2xl text-center mb-1">
            {mode === "login" ? "Entrar" : "Criar conta"}
          </h1>
          <p className="text-center text-sm text-muted-foreground mb-6">
            {mode === "login" ? "Acesse sua conta shopbox" : "Cadastre-se em segundos"}
          </p>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <input
                  required
                  placeholder="Nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
                />
                <input
                  required
                  inputMode="tel"
                  placeholder="WhatsApp (com DDD)"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
                />
                <input
                  required
                  inputMode="numeric"
                  placeholder="CPF"
                  value={cpf}
                  onChange={(e) => setCpf(maskCpf(e.target.value))}
                  className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
                />
              </>
            )}
            <input
              required
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
            />
            <input
              required
              type="password"
              placeholder="Senha"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider py-3 rounded-md hover:scale-[1.01] transition-transform shadow-deal disabled:opacity-60"
            >
              {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Cadastrar"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full text-sm text-muted-foreground hover:text-primary mt-4"
          >
            {mode === "login" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
