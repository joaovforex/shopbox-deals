import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { STORE_ADDRESS, STORE_HOURS } from "@/lib/whatsapp";
import { Header, Footer } from "@/components/Header";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { createMpPreference } from "@/lib/mercadopago.functions";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Finalizar compra · shopbox" }] }),
  component: CheckoutPage,
});

const delivery = "pickup" as const;

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
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
  let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

function CheckoutPage() {
  const { items, total, clear } = useCart();
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const createPref = useServerFn(createMpPreference);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");

  if (items.length === 0 && !redirecting) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div>
            <h1 className="display text-3xl mb-2">Carrinho vazio</h1>
            <Link to="/loja" className="text-primary hover:underline">Ver ofertas</Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 3) return toast.error("Informe seu nome completo");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Informe um email válido");
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return toast.error("WhatsApp inválido — inclua o DDD");
    const cpfDigits = cpf.replace(/\D/g, "");
    if (!isValidCpf(cpfDigits)) return toast.error("CPF inválido");

    setBusy(true);
    try {
      const res = await createPref({
        data: {
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phoneDigits,
          customer_cpf: cpfDigits,
          delivery_method: delivery,
          items: items.map((i) => ({ product_id: i.id, quantity: i.quantity })),
        },
      });
      // Marca como redirecionando ANTES de limpar o carrinho, para não mostrar tela de "carrinho vazio"
      setRedirecting(true);
      sessionStorage.setItem("mp_init_point", res.initPoint);
      clear();
      // Redireciona DIRETO ao Mercado Pago — mantém o gesto do usuário (essencial
      // em navegadores in-app de WhatsApp/Instagram, que bloqueiam redirects atrasados).
      window.location.href = res.initPoint;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar pagamento";
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/carrinho" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            Voltar ao carrinho
          </Link>
          <h1 className="display text-3xl md:text-4xl">Finalizar compra</h1>
          <div className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold uppercase tracking-wider text-accent bg-accent/10 px-2 py-1 rounded">
            Pagamento seguro via Mercado Pago
          </div>
        </div>
      </section>

      <form onSubmit={submit} className="container mx-auto px-4 py-6 grid lg:grid-cols-[1fr_380px] gap-6 flex-1">
        <div className="space-y-5">
          <Section title="Dados do cliente">
            <Field label="Nome completo *" value={name} onChange={setName} required placeholder="Como aparece no documento" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Email *" type="email" value={email} onChange={setEmail} required placeholder="voce@email.com" inputMode="email" autoComplete="email" />
              <Field label="WhatsApp (com DDD) *" value={phone} onChange={(v) => setPhone(maskPhone(v))} required placeholder="(41) 99999-9999" inputMode="tel" autoComplete="tel" />
            </div>
            <Field label="CPF *" value={cpf} onChange={(v) => setCpf(maskCpf(v))} required placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />
          </Section>

          <Section title="Retirada na loja">
            <div className="bg-secondary rounded-md p-4 text-sm">
              <p className="font-semibold">Retire na loja</p>
              <p className="text-muted-foreground mt-1">{STORE_ADDRESS}</p>
              <p className="text-muted-foreground">{STORE_HOURS}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Você receberá um aviso no WhatsApp assim que o pagamento for confirmado e novamente quando o pedido estiver pronto para retirada.
              </p>
            </div>
          </Section>

          <Section title="Pagamento">
            <div className="bg-secondary rounded-md p-4 text-sm space-y-2">
              <p className="font-semibold">Você será redirecionado ao Mercado Pago</p>
              <p className="text-muted-foreground">
                Após confirmar, abrimos o checkout seguro do Mercado Pago. Lá você escolhe entre <strong>Pix, cartão de crédito, débito ou boleto</strong>.
              </p>
              <p className="text-xs text-muted-foreground">
                O pedido fica reservado por alguns minutos enquanto aguardamos a confirmação do pagamento.
              </p>
            </div>
          </Section>
        </div>

        <aside className="bg-card border border-border rounded-lg p-5 h-fit lg:sticky lg:top-24 space-y-3">
          <h2 className="display text-xl">Resumo</h2>
          <ul className="space-y-2 text-sm border-b border-border pb-3">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="line-clamp-2">{i.quantity}x {i.name}</span>
                <span className="font-semibold whitespace-nowrap">{brl(i.price * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold">{brl(total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Retirada</span>
            <span className="font-semibold">Grátis</span>
          </div>
          <div className="border-t border-border pt-3 flex justify-between items-baseline">
            <span className="font-bold">Total</span>
            <span className="display text-2xl text-price">{brl(total)}</span>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md shadow-deal hover:scale-[1.02] transition-transform disabled:opacity-60 disabled:scale-100"
          >
            {busy ? "Redirecionando..." : `Pagar ${brl(total)}`}
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            Ao confirmar você aceita os termos da loja. Pagamento processado pelo Mercado Pago.
          </p>
        </aside>
      </form>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-3">
      <h2 className="display text-xl">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, ...rest
}: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1"
      />
    </label>
  );
}
