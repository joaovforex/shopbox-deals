import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Header, Footer } from "@/components/Header";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Finalizar compra · shopbox" }] }),
  component: CheckoutPage,
});

type Payment = "pix" | "card";
const delivery = "pickup" as const;

// (00) 00000-0000 — DDD + número
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
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");

  const [payment, setPayment] = useState<Payment>("pix");

  // sandbox card fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvv, setCardCvv] = useState("");

  if (items.length === 0) {
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

    if (payment === "card") {
      if (cardNumber.replace(/\s/g, "").length < 13) return toast.error("Número do cartão inválido");
      if (cardCvv.length < 3) return toast.error("CVV inválido");
    }

    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 900));

      const { data, error } = await supabase.rpc("place_order", {
        p_customer_name: name.trim(),
        p_customer_email: email.trim(),
        p_customer_phone: phoneDigits,
        p_customer_cpf: cpfDigits,
        p_payment_method: payment,
        p_delivery_method: delivery,
        p_items: items.map((i) => ({ product_id: i.id, quantity: i.quantity })),
        p_zip: null,
        p_street: null,
        p_number: null,
        p_complement: null,
        p_district: null,
        p_city: null,
        p_state: null,
      } as never);
      if (error) throw error;
      const orderId = data as string;
      clear();
      toast.success("Pagamento aprovado!");

      navigate({ to: "/pedido/$id", params: { id: orderId } });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao finalizar pedido");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/carrinho" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao carrinho
          </Link>
          <h1 className="display text-3xl md:text-4xl">Finalizar compra</h1>
          <div className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold uppercase tracking-wider text-accent bg-accent/10 px-2 py-1 rounded">
            <Lock className="h-3 w-3" /> Ambiente sandbox · pagamento simulado
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
            <div className="bg-secondary rounded-md p-4 text-sm flex gap-3">
              <Store className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Retire na loja</p>
                <p className="text-muted-foreground mt-1">{STORE_ADDRESS}</p>
                <p className="text-muted-foreground">{STORE_HOURS}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Você receberá um aviso no WhatsApp assim que o pedido for confirmado e novamente quando estiver pronto para retirada (em até 1h após separação).
                </p>
              </div>
            </div>
          </Section>

          <Section title="Forma de pagamento">
            <div className="grid grid-cols-2 gap-2">
              <PaymentOption icon={<QrCode className="h-5 w-5" />} label="Pix" active={payment === "pix"} onClick={() => setPayment("pix")} />
              <PaymentOption icon={<CreditCard className="h-5 w-5" />} label="Cartão" active={payment === "card"} onClick={() => setPayment("card")} />
            </div>

            {payment === "pix" && (
              <div className="mt-4 bg-secondary rounded-md p-4 text-sm">
                <p className="font-semibold mb-1">Pix copia e cola (simulado)</p>
                <code className="block bg-background px-3 py-2 rounded text-xs break-all">
                  00020126360014BR.GOV.BCB.PIX0114SANDBOX-{Date.now()}5204000053039865802BR
                </code>
                <p className="text-xs text-muted-foreground mt-2">No sandbox o pagamento é aprovado automaticamente ao confirmar.</p>
              </div>
            )}

            {payment === "card" && (
              <div className="mt-4 space-y-3">
                <Field label="Número do cartão" value={cardNumber} onChange={(v) => setCardNumber(v.replace(/\D/g, "").slice(0, 19))} placeholder="0000 0000 0000 0000" />
                <Field label="Nome impresso" value={cardName} onChange={setCardName} placeholder="Como está no cartão" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Validade" value={cardExp} onChange={setCardExp} placeholder="MM/AA" />
                  <Field label="CVV" value={cardCvv} onChange={(v) => setCardCvv(v.replace(/\D/g, "").slice(0, 4))} placeholder="000" />
                </div>
                <p className="text-xs text-muted-foreground">Use qualquer número de teste. Nada é cobrado.</p>
              </div>
            )}

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
            <span className="text-muted-foreground">{delivery === "pickup" ? "Retirada" : "Frete"}</span>
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
            <Lock className="h-4 w-4" /> {busy ? "Processando..." : `Pagar ${brl(total)}`}
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            Ao confirmar você aceita os termos da loja. Pagamento simulado para testes.
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

function PaymentOption({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 py-3 rounded-md border-2 transition-all ${active ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground"}`}
    >
      {icon}
      <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
