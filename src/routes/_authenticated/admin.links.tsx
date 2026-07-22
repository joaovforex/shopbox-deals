import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Plus, Trash2, ExternalLink, Power } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getRoleSummary, type RoleSummary } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/admin/links")({
  head: () => ({ meta: [{ title: "Links curtos · Admin · shopbox" }] }),
  component: ShortLinksAdmin,
});

type ShortLink = {
  id: string;
  slug: string;
  target_url: string;
  description: string | null;
  active: boolean;
  click_count: number;
  created_at: string;
  updated_at: string;
};

// slugs reservados (rotas do app) — evitar conflito
const RESERVED = new Set([
  "loja", "carrinho", "checkout", "auth", "reset-password", "termos",
  "politica-privacidade", "meus-pedidos", "perfil", "admin", "produto",
  "pedido", "etiqueta", "redirecionando", "api", "lovable", "assets",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

function normalizeSlug(v: string) {
  return v
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function ShortLinksAdmin() {
  const [roles, setRoles] = useState<RoleSummary | null>(null);
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    getRoleSummary().then(setRoles);
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("short_links")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar links: " + error.message);
    setLinks((data as ShortLink[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (roles?.isSuperAdmin) load(); }, [roles?.isSuperAdmin]);

  if (roles && !roles.isSuperAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Apenas Super Admin pode gerenciar links curtos.</p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = normalizeSlug(slug);
    if (!s || !SLUG_RE.test(s)) {
      toast.error("Slug inválido. Use letras, números e hifens (2 a 60 caracteres).");
      return;
    }
    if (RESERVED.has(s)) {
      toast.error(`"${s}" é reservado pelo sistema. Escolha outro.`);
      return;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      toast.error("URL de destino deve começar com http:// ou https://");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("short_links").insert({
      slug: s,
      target_url: url.trim(),
      description: description.trim() || null,
      created_by: userRes.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      if (error.code === "23505") toast.error("Já existe um link com esse slug.");
      else toast.error("Erro: " + error.message);
      return;
    }
    toast.success("Link criado!");
    setSlug(""); setUrl(""); setDescription("");
    load();
  };

  const toggle = async (l: ShortLink) => {
    const { error } = await supabase.from("short_links").update({ active: !l.active }).eq("id", l.id);
    if (error) toast.error(error.message); else load();
  };

  const remove = async (l: ShortLink) => {
    if (!confirm(`Excluir link /${l.slug}?`)) return;
    const { error } = await supabase.from("short_links").delete().eq("id", l.id);
    if (error) toast.error(error.message);
    else { toast.success("Link excluído."); load(); }
  };

  const copy = async (l: ShortLink) => {
    const full = `${origin}/${l.slug}`;
    try {
      await navigator.clipboard.writeText(full);
      toast.success("Link copiado: " + full);
    } catch { toast.error("Não foi possível copiar."); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider">Links curtos</h1>
          <p className="text-sm text-muted-foreground">
            Redirecionamentos personalizados a partir do seu domínio (ex: <span className="font-mono">{origin || "shopboxonline.com"}/grupo</span>).
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Slug</label>
            <div className="flex items-center rounded-md border border-input bg-background overflow-hidden">
              <span className="px-2 py-2 text-xs text-muted-foreground border-r border-input font-mono">/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="grupo"
                className="flex-1 px-2 py-2 text-sm bg-transparent outline-none"
                required
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">letras, números e hífens</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">URL de destino</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/…"
              type="url"
              className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background outline-none"
              required
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Descrição (opcional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Grupo Instagram — motos"
            className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {saving ? "Criando…" : "Criar link"}
        </button>
      </form>

      <div className="rounded-lg border border-border bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-bold uppercase tracking-wider">Seus links ({links.length})</span>
          <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground">Atualizar</button>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : links.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum link criado ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {links.map((l) => {
              const full = `${origin}/${l.slug}`;
              return (
                <li key={l.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold">/{l.slug}</span>
                      {!l.active && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          desativado
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{l.click_count} cliques</span>
                    </div>
                    <a
                      href={l.target_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-primary break-all inline-flex items-center gap-1"
                    >
                      {l.target_url} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    {l.description && <p className="text-xs text-muted-foreground mt-0.5">{l.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copy(l)}
                      title={`Copiar ${full}`}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-secondary hover:bg-muted"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copiar
                    </button>
                    <button
                      onClick={() => toggle(l)}
                      title={l.active ? "Desativar" : "Ativar"}
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-secondary hover:bg-muted"
                    >
                      <Power className="h-3.5 w-3.5" /> {l.active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      onClick={() => remove(l)}
                      title="Excluir"
                      className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
