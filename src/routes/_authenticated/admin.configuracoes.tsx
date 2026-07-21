import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ImageIcon, Percent, Save, Upload, Trash2, ShieldAlert, Tag, RotateCcw } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { isSuperAdmin } from "@/lib/products";
import { supabase } from "@/integrations/supabase/client";
import { fetchSiteSettings, formatCashbackLabel } from "@/lib/site-settings";

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

        {/* Desconto em massa */}
        <MassDiscountSection currentPct={Number(data?.global_discount_percent ?? 0)} onDone={() => qc.invalidateQueries({ queryKey: ["site_settings"] })} />
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
