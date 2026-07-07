import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileText, Save, Send, RefreshCw } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { isAdmin } from "@/lib/products";
import {
  admin_getFiscalConfig,
  admin_updateFiscalConfig,
  admin_emitirNotaManual,
  admin_consultarNota,
  admin_listRecentPaidOrders,
  admin_validarFocus,
  type FiscalConfigInput,
} from "@/lib/nfe.functions";

export const Route = createFileRoute("/_authenticated/admin/fiscal")({
  head: () => ({ meta: [{ title: "Configuração Fiscal · Admin" }] }),
  component: FiscalPage,
});

type FiscalConfig = FiscalConfigInput & { id?: string };

const DEFAULT_CONFIG: FiscalConfig = {
  ativo: false,
  ambiente: "homologacao",
  cnpj: "",
  inscricao_estadual: "",
  inscricao_municipal: "",
  razao_social: "",
  nome_fantasia: "",
  regime_tributario: "simples",
  endereco_logradouro: "",
  endereco_numero: "",
  endereco_complemento: "",
  endereco_bairro: "",
  endereco_municipio: "",
  endereco_uf: "",
  endereco_cep: "",
  endereco_codigo_municipio: "",
  csc_id: "",
  csc_token: "",
  serie_nfce: 1,
  serie_nfe: 1,
  cfop_padrao_dentro_uf: "5102",
  cfop_padrao_fora_uf: "6102",
};

function FiscalPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { isAdmin().then(setAllowed); }, []);

  const getConfig = useServerFn(admin_getFiscalConfig);
  const saveConfig = useServerFn(admin_updateFiscalConfig);
  const emitir = useServerFn(admin_emitirNotaManual);
  const consultar = useServerFn(admin_consultarNota);
  const listOrders = useServerFn(admin_listRecentPaidOrders);
  const [recentOrders, setRecentOrders] = useState<Array<{ id: string; created_at: string; total: number | null }>>([]);
  const loadRecent = async () => {
    try {
      const r = await listOrders({});
      setRecentOrders(r);
      if (!r.length) toast.info("Nenhum pedido pago encontrado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao listar pedidos");
    }
  };

  const { data: loaded, refetch, isLoading } = useQuery({
    queryKey: ["fiscal-config"],
    enabled: allowed === true,
    queryFn: async () => (await getConfig({})) as FiscalConfig | null,
  });

  const [form, setForm] = useState<FiscalConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    if (loaded) setForm({ ...DEFAULT_CONFIG, ...loaded });
  }, [loaded]);

  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveConfig({ data: form });
      toast.success("Configuração fiscal salva");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  // Emissão de teste
  const [testOrderId, setTestOrderId] = useState("");
  const [testModelo, setTestModelo] = useState<"nfce" | "nfe">("nfce");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  const runEmit = async () => {
    if (!testOrderId.trim()) return toast.error("Informe o ID do pedido");
    setTestBusy(true); setTestResult(null);
    try {
      if (!form.ativo) {
        const updated = { ...form, ativo: true };
        await saveConfig({ data: updated });
        setForm(updated);
        toast.success("Configuração fiscal ativada");
      }
      const r = await emitir({ data: { orderId: testOrderId.trim(), modelo: testModelo } });
      setTestResult(r as unknown as Record<string, unknown>);
      if (r.ok) toast.success(`NFe enviada — status: ${r.status}`);
      else toast.error(`Falha: ${r.message ?? r.status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao emitir");
    } finally { setTestBusy(false); }
  };

  const activateAndSave = async () => {
    setSaving(true);
    try {
      const updated = { ...form, ativo: true };
      await saveConfig({ data: updated });
      setForm(updated);
      toast.success("Configuração fiscal ativada");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao ativar");
    } finally { setSaving(false); }
  };


  const runConsult = async () => {
    if (!testOrderId.trim()) return toast.error("Informe o ID do pedido");
    setTestBusy(true);
    try {
      const r = await consultar({ data: { orderId: testOrderId.trim() } });
      setTestResult(r as unknown as Record<string, unknown>);
      toast.success(`Status Focus: ${r.status ?? "—"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao consultar");
    } finally { setTestBusy(false); }
  };

  if (allowed === false) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="container mx-auto px-4 py-16 flex-1">
          <p className="text-lg font-bold">Acesso restrito ao Super Admin.</p>
          <Link to="/admin" className="text-primary underline">Voltar</Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="container mx-auto px-4 py-6 flex-1 space-y-8">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Admin
          </Link>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6" /> Configuração Fiscal
          </h1>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        <form onSubmit={submit} className="space-y-6 bg-card border border-border rounded-lg p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-border">
            <label className="inline-flex items-center gap-2 font-bold">
              <input
                type="checkbox"
                checked={!!form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              /> Emissão automática ativada
            </label>
            <label className="inline-flex items-center gap-2">
              Ambiente:
              <select
                value={form.ambiente}
                onChange={(e) => setForm({ ...form, ambiente: e.target.value as "homologacao" | "producao" })}
                className="bg-background border border-border rounded px-2 py-1"
              >
                <option value="homologacao">Homologação</option>
                <option value="producao">Produção</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2">
              Regime:
              <select
                value={form.regime_tributario}
                onChange={(e) => setForm({ ...form, regime_tributario: e.target.value as FiscalConfig["regime_tributario"] })}
                className="bg-background border border-border rounded px-2 py-1"
              >
                <option value="simples">Simples Nacional</option>
                <option value="presumido">Lucro Presumido</option>
                <option value="real">Lucro Real</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="CNPJ" value={form.cnpj ?? ""} onChange={(v) => setForm({ ...form, cnpj: v })} placeholder="Somente números" />
            <Field label="Inscrição Estadual" value={form.inscricao_estadual ?? ""} onChange={(v) => setForm({ ...form, inscricao_estadual: v })} />
            <Field label="Razão Social" value={form.razao_social ?? ""} onChange={(v) => setForm({ ...form, razao_social: v })} />
            <Field label="Nome Fantasia" value={form.nome_fantasia ?? ""} onChange={(v) => setForm({ ...form, nome_fantasia: v })} />
            <Field label="Inscrição Municipal" value={form.inscricao_municipal ?? ""} onChange={(v) => setForm({ ...form, inscricao_municipal: v })} />
          </div>

          <div className="border-t border-border pt-4">
            <h2 className="font-black uppercase tracking-wider text-sm mb-3">Endereço</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Logradouro" value={form.endereco_logradouro ?? ""} onChange={(v) => setForm({ ...form, endereco_logradouro: v })} />
              <Field label="Número" value={form.endereco_numero ?? ""} onChange={(v) => setForm({ ...form, endereco_numero: v })} />
              <Field label="Complemento" value={form.endereco_complemento ?? ""} onChange={(v) => setForm({ ...form, endereco_complemento: v })} />
              <Field label="Bairro" value={form.endereco_bairro ?? ""} onChange={(v) => setForm({ ...form, endereco_bairro: v })} />
              <Field label="Município" value={form.endereco_municipio ?? ""} onChange={(v) => setForm({ ...form, endereco_municipio: v })} />
              <Field label="UF" value={form.endereco_uf ?? ""} onChange={(v) => setForm({ ...form, endereco_uf: v.toUpperCase() })} maxLength={2} />
              <Field label="CEP" value={form.endereco_cep ?? ""} onChange={(v) => setForm({ ...form, endereco_cep: v })} placeholder="Somente números" />
              <Field label="Código IBGE Município (7 dígitos)" value={form.endereco_codigo_municipio ?? ""} onChange={(v) => setForm({ ...form, endereco_codigo_municipio: v })} />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h2 className="font-black uppercase tracking-wider text-sm mb-3">NFC-e (CSC) & Séries</h2>
            <p className="text-xs text-muted-foreground mb-3">
              O certificado digital (.pfx) fica no painel da Focus NFe. Aqui você informa apenas o CSC (ID + token) usado para gerar o QR-Code da NFC-e.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Field label="CSC ID" value={form.csc_id ?? ""} onChange={(v) => setForm({ ...form, csc_id: v })} />
              <Field label="CSC Token" value={form.csc_token ?? ""} onChange={(v) => setForm({ ...form, csc_token: v })} />
              <Field label="Série NFC-e" type="number" value={String(form.serie_nfce ?? 1)} onChange={(v) => setForm({ ...form, serie_nfce: Number(v) || 1 })} />
              <Field label="Série NF-e" type="number" value={String(form.serie_nfe ?? 1)} onChange={(v) => setForm({ ...form, serie_nfe: Number(v) || 1 })} />
              <Field label="CFOP dentro da UF" value={form.cfop_padrao_dentro_uf ?? "5102"} onChange={(v) => setForm({ ...form, cfop_padrao_dentro_uf: v })} />
              <Field label="CFOP fora da UF" value={form.cfop_padrao_fora_uf ?? "6102"} onChange={(v) => setForm({ ...form, cfop_padrao_fora_uf: v })} />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-5 py-3 rounded-md disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar configuração"}
            </button>
          </div>
        </form>

        {/* Emissão de teste */}
        <div className="bg-card border border-border rounded-lg p-4 md:p-6 space-y-4">
          <h2 className="font-black uppercase tracking-wider text-sm flex items-center gap-2">
            <Send className="h-4 w-4" /> Emissão de teste
          </h2>
          <p className="text-xs text-muted-foreground">
            Ideal em ambiente de <strong>Homologação</strong>. Cole o ID de um pedido <strong>pago</strong> e escolha o modelo. A NFe é enviada à Focus com <code>ref = order_&lt;id&gt;</code>; usar o mesmo pedido de novo retorna a mesma nota (idempotente).
          </p>
          {!form.ativo && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-yellow-500/10 border border-yellow-500/40 text-yellow-200 rounded p-3 text-sm">
              <span>⚠ Emissão está <strong>desativada</strong>. Ative antes de emitir a nota.</span>
              <button
                type="button"
                onClick={activateAndSave}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-yellow-500 text-black font-bold px-3 py-2 rounded disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> Ativar configuração
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadRecent}
              className="inline-flex items-center gap-2 bg-card border border-border font-bold px-3 py-2 rounded text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Buscar últimos pedidos pagos
            </button>
            {recentOrders.length > 0 && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) setTestOrderId(e.target.value); }}
                className="bg-background border border-border rounded px-2 py-2 text-sm font-mono"
              >
                <option value="">Selecione um pedido…</option>
                {recentOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id.slice(0, 8)}… · {new Date(o.created_at).toLocaleDateString("pt-BR")} · R$ {(o.total ?? 0).toFixed(2)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3">
            <input
              value={testOrderId}
              onChange={(e) => setTestOrderId(e.target.value)}
              placeholder="UUID do pedido (ex.: 3f8c…)"
              className="bg-background border border-border rounded px-3 py-2 font-mono text-sm"
            />
            <select
              value={testModelo}
              onChange={(e) => setTestModelo(e.target.value as "nfce" | "nfe")}
              className="bg-background border border-border rounded px-2 py-2"
            >
              <option value="nfce">NFC-e (consumidor)</option>
              <option value="nfe">NF-e (com CPF/CNPJ)</option>
            </select>
            <button
              type="button"
              onClick={runEmit}
              disabled={testBusy}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2 rounded disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> Emitir
            </button>
            <button
              type="button"
              onClick={runConsult}
              disabled={testBusy}
              className="inline-flex items-center gap-2 bg-card border border-border font-bold px-4 py-2 rounded disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" /> Consultar
            </button>
          </div>
          {testResult && (
            <pre className="text-xs bg-muted rounded p-3 overflow-auto max-h-72">
{JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text", maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="block font-bold mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full bg-background border border-border rounded px-3 py-2"
      />
    </label>
  );
}
