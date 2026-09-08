import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminButton, AdminActionBar } from "@/components/admin/AdminButton";
import {
  createBanner,
  deleteBanner,
  fetchAllBanners,
  isBannerVisible,
  reorderBanners,
  updateBanner,
  validateBanner,
  type BannerInput,
  type SiteBanner,
} from "@/lib/banners";

const BUCKET = "site-assets";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

const DESKTOP_SPEC = "1600 × 500 px";
const MOBILE_SPEC = "800 × 800 px";

/** Só remove arquivos que este fluxo criou (prefixo banners/). */
function bannerStoragePath(url: string): string | null {
  try {
    const path = new URL(url, "https://placeholder.local").pathname;
    const marker = `/${BUCKET}/`;
    const at = path.indexOf(marker);
    if (at < 0) return null;
    const rel = decodeURIComponent(path.slice(at + marker.length));
    return rel.startsWith("banners/") ? rel : null;
  } catch {
    return null;
  }
}

async function uploadBannerImage(file: File, kind: "desktop" | "mobile"): Promise<string | null> {
  if (!ACCEPTED.includes(file.type)) {
    toast.error("Formato inválido. Use JPG, PNG ou WEBP.");
    return null;
  }
  if (file.size > MAX_BYTES) {
    toast.error("Imagem muito grande. Máximo 5 MB.");
    return null;
  }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `banners/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type,
  });
  if (error) {
    toast.error(`Falha no envio: ${error.message}`);
    return null;
  }
  const { data: signed, error: sErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (sErr || !signed?.signedUrl) {
    toast.error("Falha ao gerar o endereço da imagem.");
    return null;
  }
  return signed.signedUrl;
}

function ImageSlot({
  label,
  spec,
  url,
  kind,
  onChange,
}: {
  label: string;
  spec: string;
  url: string;
  kind: "desktop" | "mobile";
  onChange: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const next = await uploadBannerImage(file, kind);
      if (next) {
        onChange(next);
        toast.success(`Imagem ${label.toLowerCase()} enviada.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 rounded-lg border border-border p-3">
      <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">Tamanho ideal: {spec} · até 5 MB</p>
      <div className="mt-2 aspect-video overflow-hidden rounded-md bg-muted">
        {url ? (
          <img src={url} alt={`Prévia ${label}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Sem imagem
          </div>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void pick(e)}
      />
      <AdminButton
        className="mt-2"
        block
        loading={busy}
        icon={<Upload className="h-4 w-4" aria-hidden />}
        onClick={() => ref.current?.click()}
      >
        {url ? "Trocar imagem" : "Enviar imagem"}
      </AdminButton>
    </div>
  );
}

const EMPTY: BannerInput = {
  desktop_url: "",
  mobile_url: "",
  alt_text: "",
  link_url: "/loja",
  sort_order: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
};

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function BannerForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: BannerInput;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: BannerInput) => Promise<void>;
}) {
  const [form, setForm] = useState<BannerInput>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(initial), [initial]);

  const submit = async () => {
    const problem = validateBanner(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <ImageSlot
          label="Computador"
          spec={DESKTOP_SPEC}
          kind="desktop"
          url={form.desktop_url}
          onChange={(desktop_url) => setForm((f) => ({ ...f, desktop_url }))}
        />
        <ImageSlot
          label="Celular"
          spec={MOBILE_SPEC}
          kind="mobile"
          url={form.mobile_url}
          onChange={(mobile_url) => setForm((f) => ({ ...f, mobile_url }))}
        />
      </div>

      <label className="block text-xs font-bold uppercase tracking-wider">
        Descrição da imagem (obrigatória)
        <input
          value={form.alt_text}
          onChange={(e) => setForm((f) => ({ ...f, alt_text: e.target.value }))}
          placeholder="Ex.: Ofertas de ferramentas com desconto"
          className="mt-1 block min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-normal normal-case tracking-normal"
        />
      </label>

      <label className="block text-xs font-bold uppercase tracking-wider">
        Link ao clicar (opcional)
        <input
          value={form.link_url ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value.trim() || null }))}
          placeholder="/loja ou https://..."
          className="mt-1 block min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-normal normal-case tracking-normal"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-bold uppercase tracking-wider">
          Começa em (opcional)
          <input
            type="datetime-local"
            value={toLocalInput(form.starts_at)}
            onChange={(e) =>
              setForm((f) => ({ ...f, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null }))
            }
            className="mt-1 block min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-normal normal-case tracking-normal"
          />
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider">
          Termina em (opcional)
          <input
            type="datetime-local"
            value={toLocalInput(form.ends_at)}
            onChange={(e) =>
              setForm((f) => ({ ...f, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null }))
            }
            className="mt-1 block min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-normal normal-case tracking-normal"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          className="h-4 w-4"
        />
        Banner ativo
      </label>

      <AdminActionBar>
        <AdminButton
          variant="primary"
          loading={saving}
          icon={<Save className="h-4 w-4" aria-hidden />}
          onClick={() => void submit()}
        >
          {submitLabel}
        </AdminButton>
        <AdminButton icon={<X className="h-4 w-4" aria-hidden />} onClick={onCancel}>
          Cancelar
        </AdminButton>
      </AdminActionBar>
    </div>
  );
}

export function BannerManager() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["site_banners", "all"],
    queryFn: fetchAllBanners,
  });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const banners = data ?? [];

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["site_banners"] });
  };

  const handleCreate = async (input: BannerInput) => {
    try {
      await createBanner({ ...input, sort_order: banners.length });
      toast.success("Banner adicionado.");
      setCreating(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o banner.");
    }
  };

  const handleUpdate = async (id: string, input: BannerInput) => {
    try {
      await updateBanner(id, input);
      toast.success("Banner atualizado.");
      setEditingId(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o banner.");
    }
  };

  const toggleActive = async (b: SiteBanner) => {
    setBusyId(b.id);
    try {
      await updateBanner(b.id, { is_active: !b.is_active });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar o banner.");
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...banners];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusyId(banners[index].id);
    try {
      await reorderBanners(next.map((b) => b.id));
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reordenar.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (b: SiteBanner) => {
    if (!window.confirm("Remover este banner? Esta ação não pode ser desfeita.")) return;
    setBusyId(b.id);
    try {
      await deleteBanner(b.id);
      // Remove só arquivos criados por este fluxo (pasta banners/).
      const paths = [bannerStoragePath(b.desktop_url), bannerStoragePath(b.mobile_url)].filter(
        (p): p is string => Boolean(p),
      );
      if (paths.length > 0) {
        await supabase.storage.from(BUCKET).remove(paths);
      }
      toast.success("Banner removido.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="display text-xl">Banners da página inicial</h2>
          <p className="text-sm text-muted-foreground">
            Um banner aparece sozinho. Vários viram carrossel automático. Computador {DESKTOP_SPEC} ·
            celular {MOBILE_SPEC}.
          </p>
        </div>
        {!creating && (
          <AdminButton
            variant="primary"
            icon={<Plus className="h-4 w-4" aria-hidden />}
            onClick={() => setCreating(true)}
          >
            Adicionar banner
          </AdminButton>
        )}
      </div>

      {creating && (
        <BannerForm
          initial={{ ...EMPTY, sort_order: banners.length }}
          submitLabel="Salvar banner"
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando banners...</p>}
      {error && (
        <p className="text-sm text-destructive">Não foi possível carregar os banners.</p>
      )}

      {!isLoading && banners.length === 0 && !creating && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <ImagePlus className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum banner cadastrado. A página inicial usa a imagem padrão até você adicionar o
            primeiro.
          </p>
        </div>
      )}

      <ul className="space-y-3">
        {banners.map((b, i) => (
          <li key={b.id} className="rounded-lg border border-border bg-card p-3">
            {editingId === b.id ? (
              <BannerForm
                initial={{
                  desktop_url: b.desktop_url,
                  mobile_url: b.mobile_url,
                  alt_text: b.alt_text,
                  link_url: b.link_url,
                  sort_order: b.sort_order,
                  is_active: b.is_active,
                  starts_at: b.starts_at,
                  ends_at: b.ends_at,
                }}
                submitLabel="Salvar alterações"
                onCancel={() => setEditingId(null)}
                onSubmit={(input) => handleUpdate(b.id, input)}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <img
                    src={b.desktop_url}
                    alt=""
                    aria-hidden
                    className="hidden h-16 w-40 rounded object-cover sm:block"
                  />
                  <img
                    src={b.mobile_url}
                    alt=""
                    aria-hidden
                    className="h-16 w-16 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{b.alt_text}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.link_url ? `Vai para ${b.link_url}` : "Sem link"} · posição {i + 1}
                    </p>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-wider">
                      {isBannerVisible(b) ? (
                        <span className="text-emerald-600">Aparecendo no site</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {b.is_active ? "Fora do período" : "Desativado"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <AdminActionBar>
                  <AdminButton
                    variant="primary"
                    icon={<Save className="h-4 w-4" aria-hidden />}
                    onClick={() => setEditingId(b.id)}
                  >
                    Editar
                  </AdminButton>
                  <AdminButton
                    loading={busyId === b.id}
                    icon={
                      b.is_active ? (
                        <EyeOff className="h-4 w-4" aria-hidden />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden />
                      )
                    }
                    onClick={() => void toggleActive(b)}
                  >
                    {b.is_active ? "Desativar" : "Ativar"}
                  </AdminButton>
                  <AdminButton
                    icon={<ArrowUp className="h-4 w-4" aria-hidden />}
                    disabled={i === 0 || busyId === b.id}
                    onClick={() => void move(i, -1)}
                  >
                    Subir
                  </AdminButton>
                  <AdminButton
                    icon={<ArrowDown className="h-4 w-4" aria-hidden />}
                    disabled={i === banners.length - 1 || busyId === b.id}
                    onClick={() => void move(i, 1)}
                  >
                    Descer
                  </AdminButton>
                  <AdminButton
                    variant="destructive"
                    icon={<Trash2 className="h-4 w-4" aria-hidden />}
                    loading={busyId === b.id}
                    onClick={() => void remove(b)}
                  >
                    Remover
                  </AdminButton>
                </AdminActionBar>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
