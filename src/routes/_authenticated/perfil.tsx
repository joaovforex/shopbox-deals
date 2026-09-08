import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { updateMyProfile } from "@/lib/profile.functions";
import { getMyCashback } from "@/lib/cashback.functions";
import { isValidCpf } from "@/lib/cpf";
import { brl } from "@/lib/format";
import { RMC_CITIES, maskCep, lookupCep, isRmcCity, outOfCoverageMessage } from "@/lib/delivery-area";
import { User, MapPin, Save, ArrowLeft, Wallet, Lock } from "lucide-react";


export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil · shopbox" }] }),
  component: ProfilePage,
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

// CEP, lista de cidades atendidas e consulta do endereço vêm do módulo
// compartilhado com o checkout — evita listas divergentes.


function ProfilePage() {
  const update = useServerFn(updateMyProfile);
  const fetchCashback = useServerFn(getMyCashback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cashback, setCashback] = useState<{ balance: number; nextExpiry: { amount: number; expiresAt: string } | null }>({ balance: 0, nextExpiry: null });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("Curitiba");
  const [stateUf, setStateUf] = useState("PR");
  const [cepBusy, setCepBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, cpf, email, birth_date, address_zip, address_street, address_number, address_complement, address_district, address_city, address_state")
        .eq("id", user.id)
        .maybeSingle();
      const p = (data ?? {}) as Record<string, string | null>;
      setFullName(p.full_name ?? "");
      setEmail(p.email ?? user.email ?? "");
      setPhone(p.phone ? maskPhone(p.phone) : "");
      setCpf(p.cpf ? maskCpf(p.cpf) : "");
      setBirthDate(p.birth_date ?? "");
      setZip(p.address_zip ? maskCep(p.address_zip) : "");
      setStreet(p.address_street ?? "");
      setNumber(p.address_number ?? "");
      setComplement(p.address_complement ?? "");
      setDistrict(p.address_district ?? "");
      setCity(p.address_city ?? "Curitiba");
      setStateUf(p.address_state ?? "PR");
      setLoading(false);
    })();
    (async () => {
      try {
        const r = await fetchCashback();
        setCashback({ balance: Number(r.balance ?? 0), nextExpiry: r.nextExpiry ?? null });
      } catch { /* noop */ }
    })();
  }, [fetchCashback]);

  // Busca do CEP com o mesmo helper usado no checkout
  useEffect(() => {
    const d = zip.replace(/\D/g, "");
    if (d.length !== 8) { setCoverageWarning(null); return; }
    let cancelled = false;
    (async () => {
      setCepBusy(true);
      try {
        const r = await lookupCep(d);
        if (cancelled) return;
        if (r.street) setStreet((s) => s || r.street);
        if (r.district) setDistrict((b) => b || r.district);
        if (r.city) setCity(r.city);
        if (r.uf) setStateUf(r.uf.toUpperCase());
        setCoverageWarning(isRmcCity(r.city) ? null : outOfCoverageMessage(r.city, r.uf));
      } catch (e) {
        if (!cancelled) setCoverageWarning(e instanceof Error ? e.message : "Não conseguimos buscar este CEP");
      } finally {
        if (!cancelled) setCepBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [zip]);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullName.trim() && fullName.trim().length < 2) return toast.error("Nome inválido");
    const emailTrim = email.trim().toLowerCase();
    if (!emailTrim) return toast.error("Email é obrigatório");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) return toast.error("Email inválido");
    const phoneDigits = phone.replace(/\D/g, "");
    if (!phoneDigits) return toast.error("WhatsApp é obrigatório");
    if (phoneDigits.length < 10 || phoneDigits.length > 11) return toast.error("WhatsApp inválido — inclua o DDD");
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits && !isValidCpf(cpfDigits)) return toast.error("CPF inválido");
    setSaving(true);
    try {
      await update({
        data: {
          full_name: fullName,
          email: emailTrim,
          phone: phoneDigits,
          cpf: cpfDigits,
          birth_date: birthDate || null,
          address_zip: zip.replace(/\D/g, ""),
          address_street: street,
          address_number: number,
          address_complement: complement,
          address_district: district,
          address_city: city,
          address_state: stateUf,
        },
      });
      toast.success("Perfil atualizado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/meus-pedidos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Meus pedidos
          </Link>
          <h1 className="display text-3xl md:text-4xl">Meu perfil</h1>
          <p className="text-sm text-muted-foreground">Esses dados aparecem pré-preenchidos quando você finaliza uma compra.</p>
        </div>
      </section>

      <form onSubmit={submit} className="container mx-auto px-4 py-6 flex-1 max-w-3xl space-y-5">
        {loading ? (
          <div className="text-muted-foreground">Carregando...</div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-[#25D366]/15 to-[#25D366]/5 border-2 border-[#25D366]/40 rounded-xl p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                    <Wallet className="h-6 w-6 text-[#25D366]" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-[#25D366] font-bold">Saldo de cashback</div>
                    <div className="display text-3xl text-[#25D366]">{brl(cashback.balance)}</div>
                  </div>
                </div>
                {cashback.nextExpiry && cashback.nextExpiry.amount > 0 && (
                  <div className="text-xs text-right">
                    <div className="text-muted-foreground">A vencer:</div>
                    <div className="font-bold">{brl(cashback.nextExpiry.amount)}</div>
                    <div className="text-muted-foreground">
                      em {Math.max(0, Math.ceil((new Date(cashback.nextExpiry.expiresAt).getTime() - Date.now()) / 86400000))} dia(s)
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Você ganha <strong>5% de cashback</strong> em todas as compras. O valor fica disponível por 30 dias e pode ser usado como desconto em qualquer pedido futuro.
              </p>
            </div>

            <Section title="Dados pessoais" icon={<User className="h-4 w-4" />}>
              <Field label="Nome completo" value={fullName} onChange={setFullName} placeholder="Como aparece no documento" />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field required label="Email" type="email" value={email} onChange={setEmail} placeholder="voce@email.com" />
                <Field required label="WhatsApp" value={phone} onChange={(v) => setPhone(maskPhone(v))} placeholder="(41) 99999-9999" inputMode="tel" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="CPF" value={cpf} onChange={(v) => setCpf(maskCpf(v))} placeholder="000.000.000-00" inputMode="numeric" />
                <Field label="Data de nascimento" type="date" value={birthDate} onChange={setBirthDate} />
              </div>
            </Section>

            <Section title="Endereço de entrega salvo" icon={<MapPin className="h-4 w-4" />}>
              <p className="text-xs text-muted-foreground -mt-2 mb-2">
                Atendemos somente Curitiba e região metropolitana.
              </p>
              <div className="grid sm:grid-cols-[160px_1fr] gap-3">
                <Field label="CEP" value={zip} onChange={(v) => setZip(maskCep(v))} placeholder="00000-000" inputMode="numeric" />
                <div className="flex items-end text-xs text-muted-foreground">
                  {cepBusy ? "Buscando..." : "Preenche o resto automaticamente"}
                </div>
              </div>
              <Field label="Rua / Avenida" value={street} onChange={setStreet} placeholder="Ex.: Av. Marechal Floriano" />
              <div className="grid sm:grid-cols-[140px_1fr] gap-3">
                <Field label="Número" value={number} onChange={setNumber} placeholder="123" inputMode="numeric" />
                <Field label="Complemento" value={complement} onChange={setComplement} placeholder="Apto, bloco..." />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Bairro" value={district} onChange={setDistrict} placeholder="Centro" />
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cidade</span>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1"
                  >
                    {RMC_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
            </Section>

            <div className="flex items-center justify-end gap-3">
              <Link to="/meus-pedidos" className="text-sm text-muted-foreground hover:text-foreground">Cancelar</Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-5 py-3 rounded-md disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </>
        )}
      </form>
      <Footer />
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-3">
      <h2 className="display text-lg inline-flex items-center gap-2">{icon}{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", placeholder, required, inputMode, autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1"
      />
    </label>
  );
}
