import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { STORE_ADDRESS, STORE_HOURS } from "@/lib/whatsapp";
import { Header, Footer } from "@/components/Header";
import { useCart } from "@/lib/cart";
import { useAuthUser, loginRedirectHref } from "@/lib/useAuthUser";
import { brl } from "@/lib/format";
import { createMpPreference } from "@/lib/mercadopago.functions";


export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Finalizar compra · shopbox" }] }),
  component: CheckoutPage,
});

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

function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
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

type DeliveryChoice = "pickup" | "delivery";

// Curitiba + Região Metropolitana (atendidas pela Mais Entregas)
const RMC_CITIES = [
  "Curitiba",
  "Almirante Tamandaré",
  "Araucária",
  "Campina Grande do Sul",
  "Campo Largo",
  "Campo Magro",
  "Colombo",
  "Fazenda Rio Grande",
  "Pinhais",
  "Piraquara",
  "Quatro Barras",
  "São José dos Pinhais",
] as const;

function isRmcCity(name: string | undefined | null): boolean {
  if (!name) return false;
  const norm = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return RMC_CITIES.some((c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === norm);
}

function CheckoutPage() {
  const { items, total, clear } = useCart();
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const createPref = useServerFn(createMpPreference);

  const user = useAuthUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (user === null) {
      window.location.href = loginRedirectHref("/checkout");
    }
  }, [user]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [saveProfile, setSaveProfile] = useState(true);

  // Delivery
  const [delivery, setDelivery] = useState<DeliveryChoice>("pickup");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("Curitiba");
  const [stateUf] = useState("PR");
  const [cepBusy, setCepBusy] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [coverageOk, setCoverageOk] = useState<null | boolean>(null);
  const [coverageMsg, setCoverageMsg] = useState<string | null>(null);


  // Pré-preenche do perfil do cliente logado (inclui endereço salvo)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail((e) => e || (user.email ?? ""));
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, phone, cpf, email, address_zip, address_street, address_number, address_complement, address_district, address_city, address_state")
        .eq("id", user.id)
        .maybeSingle();
      if (prof) {
        const p = prof as Record<string, string | null>;
        if (p.full_name) setName((n) => n || p.full_name!);
        if (p.email) setEmail((e) => e || p.email!);
        if (p.phone) setPhone((pp) => pp || maskPhone(p.phone!));
        if (p.cpf) setCpf((c) => c || maskCpf(p.cpf!));
        if (p.address_zip) setCep((c) => c || maskCep(p.address_zip!));
        if (p.address_street) setStreet((s) => s || p.address_street!);
        if (p.address_number) setNumber((n) => n || p.address_number!);
        if (p.address_complement) setComplement((c) => c || p.address_complement!);
        if (p.address_district) setDistrict((d) => d || p.address_district!);
        if (p.address_city && isRmcCity(p.address_city)) setCity(p.address_city);
      }
    })();
  }, []);


  // Busca ViaCEP quando CEP completa 8 dígitos
  useEffect(() => {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) {
      setCepError(null);
      setCoverageOk(null);
      setCoverageMsg(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setCepBusy(true);
      setCepError(null);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
        const json = (await res.json()) as {
          logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean;
        };
        if (cancelled) return;
        if (json.erro) {
          setCepError("CEP não encontrado");
          return;
        }
        if (json.localidade && !isRmcCity(json.localidade)) {
          setCepError(`Entregamos apenas em Curitiba e região metropolitana. Este CEP é de ${json.localidade}/${json.uf}.`);
          setCoverageOk(false);
          return;
        }
        if (json.logradouro) setStreet(json.logradouro);
        if (json.bairro) setDistrict(json.bairro);
        if (json.localidade && isRmcCity(json.localidade)) setCity(json.localidade);
      } catch {
        if (!cancelled) setCepError("Não conseguimos buscar este CEP, tente novamente");
      } finally {
        if (!cancelled) setCepBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cep]);

  // Libera o botão de pagamento assim que os campos mínimos estiverem ok.
  // Não chamamos mais a Mais Entregas aqui (preconfirm) — era lento (2-5s) e
  // a corrida só é criada após o pagamento aprovado de qualquer jeito.
  useEffect(() => {
    if (delivery !== "delivery") {
      setCoverageOk(null);
      setCoverageMsg(null);
      return;
    }
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8 || !street.trim() || !number.trim() || cepError) {
      setCoverageOk(null);
      setCoverageMsg(null);
      return;
    }
    setCoverageOk(true);
    setCoverageMsg("Entrega disponível. Prazo de até 2 dias úteis — frete por conta da loja.");
  }, [delivery, cep, street, number, cepError]);


  if (user === undefined || user === null) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6 text-center text-muted-foreground">
          {user === null ? "Redirecionando para login..." : "Carregando..."}
        </div>
        <Footer />
      </div>
    );
  }

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

    let shipping: Parameters<typeof createPref>[0]["data"]["shipping"] = null;
    if (delivery === "delivery") {
      const cepDigits = cep.replace(/\D/g, "");
      if (cepDigits.length !== 8) return toast.error("CEP inválido");
      if (!street.trim()) return toast.error("Informe a rua");
      if (!number.trim()) return toast.error("Informe o número");
      if (coverageOk === false) return toast.error(coverageMsg ?? "Endereço fora da área de entrega");
      if (coverageOk !== true) return toast.error("Aguarde a validação do endereço");
      shipping = {
        zip: cepDigits,
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim() || null,
        district: district.trim() || null,
        city: city.trim() || "Curitiba",
        state: stateUf,
        recipient_name: name.trim(),
        recipient_phone: phoneDigits,
      };
    }

    setBusy(true);
    try {
      const res = await createPref({
        data: {
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phoneDigits,
          customer_cpf: cpfDigits,
          delivery_method: delivery,
          shipping,
          items: items.map((i) => ({ product_id: i.id, quantity: i.quantity, color: i.variant_color ?? null })),
        },
      });
      setRedirecting(true);
      const sep = res.initPoint.includes("?") ? "&" : "?";
      const webUrl = `${res.initPoint}${sep}source=web&platform=web`;
      sessionStorage.setItem("mp_init_point", webUrl);
      clear();
      navigate({ to: "/redirecionando" });
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
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">WhatsApp (com DDD) *</span>
                <div className="mt-1 flex items-stretch rounded-md border border-border bg-input focus-within:border-primary overflow-hidden">
                  <span className="px-3 flex items-center bg-secondary text-sm font-semibold text-muted-foreground border-r border-border select-none">
                    +55
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    required
                    placeholder="(41) 99999-9999"
                    inputMode="tel"
                    autoComplete="tel"
                    className="flex-1 bg-transparent px-3 py-2 focus:outline-none"
                  />
                </div>
              </label>
            </div>
            <Field label="CPF *" value={cpf} onChange={(v) => setCpf(maskCpf(v))} required placeholder="000.000.000-00" inputMode="numeric" autoComplete="off" />
          </Section>

          <Section title="Como você quer receber?">
            <div className="grid sm:grid-cols-2 gap-3">
              <DeliveryOption
                active={delivery === "pickup"}
                onClick={() => setDelivery("pickup")}
                title="Retirar na loja"
                subtitle="Grátis"
                description="Retire no mesmo dia após a confirmação"
              />
              <DeliveryOption
                active={delivery === "delivery"}
                onClick={() => setDelivery("delivery")}
                title="Receber em casa"
                subtitle="FRETE R$10 ABAIXO DE R$80"
                description="Acima de R$ 80,00 o frete é grátis. Entrega em até 2 dias úteis."
                highlight
              />
            </div>

            {delivery === "pickup" ? (
              <div className="bg-secondary rounded-md p-4 text-sm">
                <p className="font-semibold">Retire na loja</p>
                <p className="text-muted-foreground mt-1">{STORE_ADDRESS}</p>
                <p className="text-muted-foreground">{STORE_HOURS}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Acompanhe o status do pedido em <strong>Meus pedidos</strong> assim que o pagamento for confirmado.
                </p>
              </div>
            ) : (
                <div className="space-y-3">
                <div className="bg-accent/10 border border-accent/30 text-accent rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider">
                  ⏱ Entrega em até 2 dias úteis · somente Curitiba e região metropolitana
                </div>
                <div className="bg-primary/10 border border-primary/30 text-primary rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <span>🚚</span>
                  <span>Frete R$ 10,00 para compras abaixo de R$ 80,00 · GRÁTIS acima de R$ 80,00</span>
                </div>
                <div className="grid sm:grid-cols-[160px_1fr] gap-3">
                  <Field
                    label="CEP *"
                    value={cep}
                    onChange={(v) => setCep(maskCep(v))}
                    required
                    placeholder="00000-000"
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                  <div className="flex items-end text-xs text-muted-foreground">
                    {cepBusy ? "Buscando endereço..." : cepError ? <span className="text-destructive">{cepError}</span> : "Atendemos Curitiba e região metropolitana"}
                  </div>
                </div>
                <Field label="Nome do destinatário *" value={name} onChange={setName} required placeholder="Como o entregador vai chamar" />
                <Field label="Endereço (rua, avenida) *" value={street} onChange={setStreet} required placeholder="Ex.: Av. Marechal Floriano Peixoto" />
                <div className="grid sm:grid-cols-[140px_1fr] gap-3">
                  <Field label="Número *" value={number} onChange={setNumber} required placeholder="123" inputMode="numeric" />
                  <Field label="Complemento" value={complement} onChange={setComplement} placeholder="Apto, bloco, ponto de referência" />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Bairro" value={district} onChange={setDistrict} placeholder="Centro" />
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cidade *</span>
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                      className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1"
                    >
                      {RMC_CITIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {coverageMsg && (
                  <div className={`text-xs px-3 py-2 rounded ${coverageOk ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {coverageMsg}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Um entregador parceiro da Mais Entregas leva seu pedido em até 2 dias úteis após a confirmação do pagamento. Acompanhe em "Meus pedidos".
                </p>
              </div>
            )}
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
          {(() => {
            const shippingFee = delivery === "delivery" ? (total < 80 ? 10 : 0) : 0;
            const grandTotal = total + shippingFee;
            return (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">{brl(total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{delivery === "pickup" ? "Retirada" : "Entrega"}</span>
                  <span className="font-semibold">{shippingFee > 0 ? brl(shippingFee) : "Grátis"}</span>
                </div>
                {delivery === "delivery" && (
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    {shippingFee > 0
                      ? `Frete R$ 10,00 para pedidos abaixo de R$ 80,00. Faltam ${brl(80 - total)} para frete grátis.`
                      : "Frete grátis em pedidos a partir de R$ 80,00."}
                  </p>
                )}
                <div className="border-t border-border pt-3 flex justify-between items-baseline">
                  <span className="font-bold">Total</span>
                  <span className="display text-2xl text-price">{brl(grandTotal)}</span>
                </div>
                <button
                  type="submit"
                  disabled={busy || (delivery === "delivery" && coverageOk !== true)}
                  className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md shadow-deal hover:scale-[1.02] transition-transform disabled:opacity-60 disabled:scale-100"
                >
                  {busy ? "Redirecionando..." : `Pagar ${brl(grandTotal)}`}
                </button>
              </>
            );
          })()}
          <p className="text-[11px] text-muted-foreground text-center">
            Ao confirmar você aceita os termos da loja. Pagamento processado pelo Mercado Pago.
          </p>
        </aside>
      </form>

      <Footer />
    </div>
  );
}

function DeliveryOption({
  active, onClick, title, subtitle, description, highlight,
}: { active: boolean; onClick: () => void; title: string; subtitle: string; description: string; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border-2 p-3 transition-colors ${active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{title}</span>
        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded whitespace-nowrap ${highlight ? "bg-accent text-accent-foreground" : active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{subtitle}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </button>
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
