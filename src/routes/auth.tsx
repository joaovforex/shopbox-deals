import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string; checks: { len: boolean; lower: boolean; upper: boolean; num: boolean; sym: boolean } };
function scorePassword(pw: string): Strength {
  const checks = {
    len: pw.length >= 8,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    num: /\d/.test(pw),
    sym: /[^A-Za-z0-9]/.test(pw),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (pw.length === 0) score = 0;
  else if (pw.length < 6 || passed <= 1) score = 1;
  else if (passed === 2) score = 2;
  else if (passed === 3 || (passed === 4 && pw.length < 10)) score = 3;
  else score = 4;
  const labels = ["", "Muito fraca", "Fraca", "Boa", "Forte"];
  const colors = ["bg-muted", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];
  return { score, label: labels[score], color: colors[score], checks };
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);

  const strength = useMemo(() => scorePassword(password), [password]);

  const redirectTo = (() => {
    if (typeof window === "undefined") return "/";
    const r = new URLSearchParams(window.location.search).get("redirect");
    if (r && r.startsWith("/") && !r.startsWith("//")) return r;
    return "/";
  })();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) (window as Window).location.href = redirectTo;
    });
  }, [redirectTo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const emailTrim = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) throw new Error("E-mail inválido");

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(emailTrim, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Se o e-mail existir, enviaremos um link para redefinir a senha.");
        setMode("login");
        return;
      }

      if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres");

      if (mode === "signup") {
        if (fullName.trim().length < 3) throw new Error("Informe seu nome completo");
        const phoneDigits = phone.replace(/\D/g, "");
        if (phoneDigits.length < 10 || phoneDigits.length > 11) throw new Error("WhatsApp inválido — inclua o DDD");
        if (strength.score < 2) throw new Error("Sua senha está muito fraca. Use letras, números e pelo menos 8 caracteres.");

        const { error } = await supabase.auth.signUp({
          email: emailTrim,
          password,
          options: {
            data: { full_name: fullName.trim(), phone: phoneDigits },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: emailTrim, password });
        if (signInError) {
          toast.success("Conta criada! Você já pode entrar.");
        } else {
          toast.success("Conta criada! Bem-vindo!");
          window.location.href = redirectTo;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: emailTrim, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        window.location.href = redirectTo;
      }
    } catch (err: any) {
      const raw = String(err?.message ?? err ?? "").trim();
      const lower = raw.toLowerCase();
      let msg = raw || "Erro ao processar. Tente novamente.";
      if (lower === "failed" || lower === "failed to fetch" || lower.includes("network")) {
        msg = "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
      } else if (lower.includes("user already registered") || lower.includes("already registered") || lower.includes("user_already_exists")) {
        msg = "Este e-mail já está cadastrado. Faça login ou recupere sua senha.";
      } else if (lower.includes("invalid login credentials")) {
        msg = "E-mail ou senha incorretos.";
      } else if (lower.includes("email not confirmed")) {
        msg = "Confirme seu e-mail antes de entrar.";
      } else if (lower.includes("rate") && lower.includes("limit")) {
        msg = "Muitas tentativas. Aguarde e tente novamente.";
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha";
  const subtitle = mode === "login"
    ? "Acesse sua conta shopbox"
    : mode === "signup"
      ? "Cadastre-se em segundos"
      : "Enviaremos um link para redefinir sua senha";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 shadow-card">
          <img src={logo} alt="shopbox" className="h-24 sm:h-28 mx-auto mb-6 drop-shadow-[0_6px_18px_rgba(0,0,0,0.4)]" />
          <h1 className="display text-2xl text-center mb-1">{title}</h1>
          <p className="text-center text-sm text-muted-foreground mb-6">{subtitle}</p>

          <form onSubmit={submit} className="space-y-3" autoComplete="on">
            {mode === "signup" && (
              <>
                <input
                  required
                  name="name"
                  autoComplete="name"
                  placeholder="Nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
                />
                <input
                  required
                  name="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="WhatsApp (com DDD)"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
                />
              </>
            )}
            <input
              required
              type="email"
              name="email"
              autoComplete={mode === "signup" ? "email" : "username"}
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary"
            />

            {mode !== "forgot" && (
              <>
                <div className="relative">
                  <input
                    required
                    type={showPw ? "text" : "password"}
                    name="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    placeholder="Senha"
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

                {mode === "signup" && password.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i <= strength.score ? strength.color : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Segurança: <span className="font-semibold text-foreground">{strength.label}</span>
                    </p>
                    <ul className="text-[11px] text-muted-foreground grid grid-cols-2 gap-x-2">
                      <li className={strength.checks.len ? "text-green-500" : ""}>• 8+ caracteres</li>
                      <li className={strength.checks.upper ? "text-green-500" : ""}>• Letra maiúscula</li>
                      <li className={strength.checks.lower ? "text-green-500" : ""}>• Letra minúscula</li>
                      <li className={strength.checks.num ? "text-green-500" : ""}>• Número</li>
                      <li className={strength.checks.sym ? "text-green-500" : ""}>• Símbolo (!@#…)</li>
                    </ul>
                  </div>
                )}

                {mode === "login" && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-muted-foreground hover:text-primary"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-primary text-primary-foreground font-black uppercase tracking-wider py-3 rounded-md hover:scale-[1.01] transition-transform shadow-deal disabled:opacity-60"
            >
              {busy
                ? "Aguarde..."
                : mode === "login"
                  ? "Entrar"
                  : mode === "signup"
                    ? "Cadastrar"
                    : "Enviar link de recuperação"}
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-2 text-sm">
            {mode === "forgot" ? (
              <button onClick={() => setMode("login")} className="text-muted-foreground hover:text-primary">
                Voltar para entrar
              </button>
            ) : (
              <button
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="text-muted-foreground hover:text-primary"
              >
                {mode === "login" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
              </button>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
