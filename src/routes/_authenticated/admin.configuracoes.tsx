import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ImageIcon, Percent, Save, Upload, Trash2, ShieldAlert, Tag, RotateCcw, Check, Store, Plus } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { isSuperAdmin } from "@/lib/products";
import { supabase } from "@/integrations/supabase/client";
import { fetchSiteSettings, formatCashbackLabel } from "@/lib/site-settings";
import { PRODUCT_CATEGORIES } from "@/lib/categories";
import { fetchUnidades, saveUnidade, unidadeEndereco, type Unidade } from "@/lib/unidades";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações · Admin" }] }),
  beforeLoad: async () => {
    const allowed = await isSuperAdmin();
    if (!allowed) throw redirect({ to: "/admin" });
  },
  component: SettingsPage,
});

const BUCKET = "site-assets";
// 1 ano — o admin pode reenviar/atualizar quando quiser
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

const DESKTOP_SPEC = { w: 1600, h: 500, label: "1600 × 500 px (proporção ~3.2:1)" };
const MOBILE_SPEC = { w: 800, h: 800, label: "800 × 800 px (quadrado, ~1:1)" };

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["site_settings"], queryFn: fetchSiteSettings });

  const [ratePct, setRatePct] = useState<string>("");
  const [desktopUrl, setDesktopUrl] = useState<string>("");
  const [mobileUrl, setMobileUrl] = useState<string>("");
  const [storeAddress, setStoreAddress] = useState<string>("");
  const [provider, setProvider] = useState<string>("cielo");
  const [saving, setSaving] = useState(false);
  const [uploadingDesk, setUploadingDesk] = useState(false);
  const [uploadingMob, setUploadingMob] = useState(false);
  const deskInput = useRef<HTMLInputElement | null>(null);
  const mobInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!data) return;
    setRatePct(String(Math.round((data.cashback_rate ?? 0.05) * 10000) / 100));
    setDesktopUrl(data.banner_desktop_url ?? "");
    setMobileUrl(data.banner_mobile_url ?? "");
    setStoreAddress(data.store_address ?? "");
    setProvider(data.payment_provider === "asaas" ? "asaas" : "cielo");
  }, [data]);

  async function uploadImage(file: File, kind: "desktop" | "mobile"): Promise<string | null> {
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem (JPG, PNG ou WEBP)");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 5MB.");
      return null;
    }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `home/banner-${kind}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type,
    });
    if (upErr) {
      toast.error(`Falha no upload: ${upErr.message}`);
      return null;
    }
    const { data: signed, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    if (sErr || !signed?.signedUrl) {
      toast.error("Falha ao gerar URL da imagem");
      return null;
    }
    return signed.signedUrl;
  }

  async function onPickDesktop(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingDesk(true);
    try {
      const url = await uploadImage(file, "desktop");
      if (url) {
        setDesktopUrl(url);
        toast.success("Imagem desktop carregada. Clique em Salvar para publicar.");
      }
    } finally {
      setUploadingDesk(false);
    }
  }

  async function onPickMobile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingMob(true);
    try {
      const url = await uploadImage(file, "mobile");
      if (url) {
        setMobileUrl(url);
        toast.success("Imagem mobile carregada. Clique em Salvar para publicar.");
      }
    } finally {
      setUploadingMob(false);
    }
  }

  async function onSave() {
    const rateNum = Number(String(ratePct).replace(",", "."));
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
      toast.error("Cashback inválido. Informe um valor entre 0 e 100 (%).");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .update({
        cashback_rate: Math.round(rateNum * 100) / 10000, // 5 => 0.05
        banner_desktop_url: desktopUrl || null,
        banner_mobile_url: mobileUrl || null,
        store_address: storeAddress.trim(),
        payment_provider: provider,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
      return;
    }
    toast.success("Configurações atualizadas");
    await qc.invalidateQueries({ queryKey: ["site_settings"] });
  }

  const currentRate = Number(String(ratePct).replace(",", ".")) / 100;
  const rateLabel = Number.isFinite(currentRate) ? formatCashbackLabel(currentRate) : "—";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent font-bold">Super Admin · Dono</div>
            <h1 className="display text-3xl">Configurações do site</h1>
            <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Apenas o Super Admin pode alterar estas configurações.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 bg-card border border-border font-black uppercase tracking-wider px-3 py-2 rounded-md hover:border-primary text-xs"
          >
            <ArrowLeft className="h-4 w-4" /> Admin
          </Link>
        </div>
      </section>

      <main className="container mx-auto px-4 py-6 flex-1 max-w-3xl w-full space-y-6">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {/* Cashback */}
        <section className="bg-card border-2 border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Percent className="h-5 w-5 text-primary" />
            <h2 className="display text-xl">Taxa de cashback</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Percentual concedido ao cliente após cada pedido pago. Passa a valer imediatamente para novos pedidos.
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-[180px]">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cashback (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
                className="mt-1 w-full bg-background border-2 border-border rounded-md px-3 py-2 text-lg font-black"
              />
            </div>
            <div className="text-sm text-muted-foreground pb-2">
              Cliente verá: <span className="font-bold text-foreground">{rateLabel}</span>
            </div>
          </div>
        </section>

        {/* Banner desktop */}
        <BannerSection
          title="Banner da home — Desktop"
          spec={DESKTOP_SPEC}
          url={desktopUrl}
          uploading={uploadingDesk}
          onPick={() => deskInput.current?.click()}
          onClear={() => setDesktopUrl("")}
          inputRef={deskInput}
          onChange={onPickDesktop}
        />

        {/* Banner mobile */}
        <BannerSection
          title="Banner da home — Mobile"
          spec={MOBILE_SPEC}
          url={mobileUrl}
          uploading={uploadingMob}
          onPick={() => mobInput.current?.click()}
          onClear={() => setMobileUrl("")}
          inputRef={mobInput}
          onChange={onPickMobile}
        />

        {/* Endereço físico */}
        <section className="bg-card border-2 border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            <h2 className="display text-xl">Endereço da loja</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            Fonte única do endereço físico usado no rodapé, FAQ, botão de mapa e recibos.
          </p>
          <input
            type="text"
            value={storeAddress}
            onChange={(e) => setStoreAddress(e.target.value)}
            placeholder="Rua, número — Bairro, Cidade / UF"
            className="w-full bg-background border-2 border-border rounded-md px-3 py-2 text-sm"
          />
        </section>

        {/* Provedor de pagamento */}
        <section className="bg-card border-2 border-border rounded-lg p-5">
          <h2 className="display text-lg mb-2">Provedor de pagamento</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Define qual gateway processa o checkout da loja. A Asaas fica como reserva e pode ser
            reativada a qualquer momento — os pedidos antigos continuam sendo consultados no provedor original.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { id: "cielo", label: "Cielo", desc: "Checkout Cielo (ativo)" },
              { id: "asaas", label: "Asaas", desc: "Backup — Pix, boleto e cartão" },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setProvider(opt.id)}
                className={`text-left rounded-md border-2 p-3 transition-colors ${provider === opt.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <span className="font-bold block">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Unidades (lojas) */}
        <UnidadesSection />

        {/* Desconto em massa */}
        <MassDiscountSection currentPct={Number(data?.global_discount_percent ?? 0)} onDone={() => qc.invalidateQueries({ queryKey: ["site_settings"] })} />



        <div className="sticky bottom-4 z-10">
          <button
            onClick={onSave}
            disabled={saving || uploadingDesk || uploadingMob}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md hover:opacity-90 disabled:opacity-60 shadow-lg"
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function BannerSection(props: {
  title: string;
  spec: { w: number; h: number; label: string };
  url: string;
  uploading: boolean;
  onPick: () => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="bg-card border-2 border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        <ImageIcon className="h-5 w-5 text-primary" />
        <h2 className="display text-xl">{props.title}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        <strong>Tamanho ideal:</strong> {props.spec.label} · JPG/PNG/WEBP até 5MB
      </p>

      {props.url ? (
        <div className="mb-3 border-2 border-border rounded-md overflow-hidden bg-black/5">
          <img src={props.url} alt="Prévia do banner" className="w-full h-auto object-contain max-h-64" />
        </div>
      ) : (
        <div className="mb-3 border-2 border-dashed border-border rounded-md h-32 flex items-center justify-center text-xs text-muted-foreground">
          Nenhuma imagem enviada — usando a imagem padrão do site
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={props.onPick}
          disabled={props.uploading}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-3 py-2 rounded-md hover:opacity-90 disabled:opacity-60 text-xs"
        >
          <Upload className="h-4 w-4" />
          {props.uploading ? "Enviando…" : props.url ? "Trocar imagem" : "Enviar imagem"}
        </button>
        {props.url && (
          <button
            type="button"
            onClick={props.onClear}
            className="inline-flex items-center gap-2 bg-card border border-border font-black uppercase tracking-wider px-3 py-2 rounded-md hover:border-destructive hover:text-destructive text-xs"
          >
            <Trash2 className="h-4 w-4" /> Remover
          </button>
        )}
        <input
          ref={props.inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={props.onChange}
        />
      </div>
    </section>
  );
}

function MassDiscountSection({ currentPct, onDone }: { currentPct: number; onDone: () => void }) {
  const [pct, setPct] = useState<string>(currentPct > 0 ? String(currentPct) : "");
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"all" | "category">("all");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setPct(currentPct > 0 ? String(currentPct) : "");
  }, [currentPct]);

  function toggleCat(cat: string) {
    setSelected((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function apply() {
    const n = Number(String(pct).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || n > 90) {
      toast.error("Informe um percentual entre 1 e 90");
      return;
    }
    if (scope === "category" && selected.length === 0) {
      toast.error("Selecione ao menos uma categoria");
      return;
    }

    const alvo =
      scope === "all"
        ? "TODOS os produtos ativos do site"
        : `produtos ativos das categorias: ${selected.join(", ")}`;

    if (!confirm(`Aplicar ${n}% de desconto em ${alvo}?\n\nO preço atual de cada produto será congelado como "preço original" (De/Por) e o desconto será aplicado por cima.`)) {
      return;
    }

    setBusy(true);
    const { data, error } =
      scope === "all"
        ? await supabase.rpc("apply_global_discount" as never, { pct: n } as never)
        : await supabase.rpc("apply_category_discount" as never, { pct: n, categories: selected } as never);
    setBusy(false);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success(`Desconto de ${n}% aplicado em ${data ?? 0} produtos`);
    onDone();
  }

  async function clearAll() {
    if (!confirm("Remover o desconto e restaurar os preços originais de TODOS os produtos?")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("clear_global_discount" as never);
    setBusy(false);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success(`Desconto removido. ${data ?? 0} produtos restaurados.`);
    setPct("");
    onDone();
  }

  async function clearCategories() {
    if (selected.length === 0) {
      toast.error("Selecione as categorias a restaurar");
      return;
    }
    if (!confirm(`Restaurar os preços originais dos produtos das categorias: ${selected.join(", ")}?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("clear_category_discount" as never, { categories: selected } as never);
    setBusy(false);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success(`${data ?? 0} produtos restaurados nas categorias selecionadas.`);
    onDone();
  }

  return (
    <section className="bg-card border-2 border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        <Tag className="h-5 w-5 text-primary" />
        <h2 className="display text-xl">Desconto em massa</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Aplica um percentual de desconto sobre <strong>produtos ativos</strong>. O preço atual vira "De" (preço riscado) e o "Por" já sai com o desconto aplicado.
      </p>
      {currentPct > 0 && (
        <div className="mb-4 bg-primary/10 border border-primary/30 rounded-md px-3 py-2 text-xs">
          Desconto global ativo no site: <strong>{currentPct}%</strong>
        </div>
      )}

      {/* Escopo */}
      <div className="mb-4">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Aplicar em</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`px-3 py-2 rounded-md border-2 text-xs font-black uppercase tracking-wider ${
              scope === "all" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50"
            }`}
          >
            Todos os produtos
          </button>
          <button
            type="button"
            onClick={() => setScope("category")}
            className={`px-3 py-2 rounded-md border-2 text-xs font-black uppercase tracking-wider ${
              scope === "category" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50"
            }`}
          >
            Por categoria
          </button>
        </div>
      </div>

      {/* Seletor de categorias */}
      {scope === "category" && (
        <div className="mb-4 border-2 border-border rounded-md p-3 bg-background">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Categorias ({selected.length} selecionadas)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected([...PRODUCT_CATEGORIES])}
                className="text-[11px] font-bold uppercase text-primary hover:underline"
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-[11px] font-bold uppercase text-muted-foreground hover:underline"
              >
                Limpar
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto grid grid-cols-2 gap-1.5">
            {PRODUCT_CATEGORIES.map((cat) => {
              const isOn = selected.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCat(cat)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left border ${
                    isOn ? "bg-primary/10 border-primary text-foreground" : "border-border hover:border-primary/50"
                  }`}
                >
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                      isOn ? "bg-primary border-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {isOn && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{cat}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 max-w-[200px]">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Percentual (%)</label>
          <input
            type="number"
            min={1}
            max={90}
            step="1"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            placeholder="Ex.: 15"
            className="mt-1 w-full bg-background border-2 border-border rounded-md px-3 py-2 text-lg font-black"
          />
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-2.5 rounded-md hover:opacity-90 disabled:opacity-60 text-xs"
        >
          <Tag className="h-4 w-4" /> {busy ? "Aplicando…" : scope === "all" ? "Aplicar em todos" : "Aplicar nas categorias"}
        </button>
        {scope === "category" && selected.length > 0 && (
          <button
            type="button"
            onClick={clearCategories}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-card border border-border font-black uppercase tracking-wider px-4 py-2.5 rounded-md hover:border-destructive hover:text-destructive disabled:opacity-60 text-xs"
          >
            <RotateCcw className="h-4 w-4" /> Restaurar categorias
          </button>
        )}
        {scope === "all" && currentPct > 0 && (
          <button
            type="button"
            onClick={clearAll}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-card border border-border font-black uppercase tracking-wider px-4 py-2.5 rounded-md hover:border-destructive hover:text-destructive disabled:opacity-60 text-xs"
          >
            <RotateCcw className="h-4 w-4" /> Restaurar todos
          </button>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        ⚠️ Ao "Restaurar", os preços originais salvos serão reaplicados. O desconto global do site só é zerado ao restaurar todos.
      </p>
    </section>
  );
}

function UnidadesSection() {
  const qc = useQueryClient();
  const { data: unidades, isLoading } = useQuery({ queryKey: ["unidades", "admin"], queryFn: () => fetchUnidades() });
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [creating, setCreating] = useState(false);

  const onDone = async () => {
    setEditing(null);
    setCreating(false);
    await qc.invalidateQueries({ queryKey: ["unidades"] });
  };

  return (
    <section className="bg-card border-2 border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h2 className="display text-xl">Unidades</h2>
        </div>
        <button
          type="button"
          onClick={() => { setCreating(true); setEditing(null); }}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-3 py-2 rounded-md hover:opacity-90 text-xs"
        >
          <Plus className="h-4 w-4" /> Nova unidade
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Lojas físicas disponíveis para retirada. Os endereços são públicos; apenas admin e gerente podem editar.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="space-y-2">
        {(unidades ?? []).map((u) => (
          <div key={u.id} className="border-2 border-border rounded-md p-3 bg-background">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-black flex items-center gap-2">
                  {u.nome}
                  {!u.ativa && <span className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded">inativa</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {unidadeEndereco(u) || "Endereço não preenchido"}
                </div>
                {u.horario_retirada && <div className="text-[11px] text-muted-foreground">{u.horario_retirada}</div>}
              </div>
              <button
                type="button"
                onClick={() => { setEditing(u); setCreating(false); }}
                className="text-xs font-black uppercase tracking-wider border border-border rounded-md px-3 py-1.5 hover:border-primary shrink-0"
              >
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <UnidadeForm
          unidade={editing}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSaved={onDone}
        />
      )}
    </section>
  );
}

function UnidadeForm({ unidade, onCancel, onSaved }: { unidade: Unidade | null; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    nome: unidade?.nome ?? "",
    cep: unidade?.cep ?? "",
    rua: unidade?.rua ?? "",
    numero: unidade?.numero ?? "",
    complemento: unidade?.complemento ?? "",
    bairro: unidade?.bairro ?? "",
    cidade: unidade?.cidade ?? "Curitiba",
    estado: unidade?.estado ?? "PR",
    horario_retirada: unidade?.horario_retirada ?? "",
    ativa: unidade?.ativa ?? true,
    ordem: String(unidade?.ordem ?? 0),
  });
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.nome.trim()) {
      toast.error("Informe o nome da unidade");
      return;
    }
    setBusy(true);
    try {
      await saveUnidade(unidade?.id ?? null, {
        nome: form.nome.trim(),
        cep: form.cep.trim() || null,
        rua: form.rua.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        bairro: form.bairro.trim() || null,
        cidade: form.cidade.trim() || null,
        estado: form.estado.trim() || null,
        horario_retirada: form.horario_retirada.trim() || null,
        ativa: form.ativa,
        ordem: Number(form.ordem) || 0,
      });
      toast.success(unidade ? "Unidade atualizada" : "Unidade criada");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar unidade");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full bg-background border-2 border-border rounded-md px-3 py-2 text-sm";
  const lbl = "text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

  return (
    <div className="mt-4 border-2 border-primary rounded-md p-4 space-y-3">
      <h3 className="display text-lg">{unidade ? `Editar ${unidade.nome}` : "Nova unidade"}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={lbl}>Nome</label><input className={field} value={form.nome} onChange={set("nome")} /></div>
        <div><label className={lbl}>CEP</label><input className={field} value={form.cep} onChange={set("cep")} /></div>
        <div><label className={lbl}>Rua</label><input className={field} value={form.rua} onChange={set("rua")} /></div>
        <div><label className={lbl}>Número</label><input className={field} value={form.numero} onChange={set("numero")} /></div>
        <div><label className={lbl}>Complemento</label><input className={field} value={form.complemento} onChange={set("complemento")} /></div>
        <div><label className={lbl}>Bairro</label><input className={field} value={form.bairro} onChange={set("bairro")} /></div>
        <div><label className={lbl}>Cidade</label><input className={field} value={form.cidade} onChange={set("cidade")} /></div>
        <div><label className={lbl}>Estado</label><input className={field} value={form.estado} onChange={set("estado")} /></div>
        <div className="sm:col-span-2"><label className={lbl}>Horário de retirada</label><input className={field} value={form.horario_retirada} onChange={set("horario_retirada")} /></div>
        <div><label className={lbl}>Ordem</label><input type="number" className={field} value={form.ordem} onChange={set("ordem")} /></div>
        <label className="flex items-end gap-2 text-sm pb-2">
          <input type="checkbox" checked={form.ativa} onChange={(e) => setForm((f) => ({ ...f, ativa: e.target.checked }))} />
          Unidade ativa
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-60 text-xs">
          <Save className="h-4 w-4" /> {busy ? "Salvando…" : "Salvar unidade"}
        </button>
        <button type="button" onClick={onCancel} className="border border-border rounded-md px-4 py-2 text-xs font-black uppercase tracking-wider hover:border-destructive">
          Cancelar
        </button>
      </div>
    </div>
  );
}
