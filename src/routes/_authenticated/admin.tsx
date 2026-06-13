import { createFileRoute, Outlet, useRouterState, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Share2, Eye, EyeOff, Upload, Crown, BarChart3, Truck, Users, Package, ShieldAlert } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { fetchProducts, getRoleSummary, uploadProductImage, type Product, type RoleSummary } from "@/lib/products";
import { claimFirstAdmin } from "@/lib/admin.functions";
import { brl, discountPct } from "@/lib/format";
import { PRODUCT_CATEGORIES } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · shopbox" }] }),
  component: AdminPage,
});

function AdminPage() {
  const [roles, setRoles] = useState<RoleSummary | null>(null);
  const claim = useServerFn(claimFirstAdmin);
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isChildRoute = pathname !== "/admin" && pathname.startsWith("/admin/");

  const refresh = async () => setRoles(await getRoleSummary());
  useEffect(() => { refresh(); }, []);

  // Expedição-only é redirecionado para sua área
  useEffect(() => {
    if (!isChildRoute && roles && !roles.isSuperAdmin && !roles.isCatalog && roles.isFulfillment) {
      navigate({ to: "/admin/expedicao", replace: true });
    }
  }, [roles, isChildRoute, navigate]);

  if (isChildRoute) return <Outlet />;

  const canManageProducts = !!roles && (roles.isSuperAdmin || roles.isCatalog);

  const { data: products = [], refetch } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => fetchProducts(),
    enabled: canManageProducts,
  });

  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Auto-reopen the product form when returning from a mobile camera launch that
  // evicted the page from memory (a saved draft exists in sessionStorage).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { productId: string | null };
      if (d.productId) {
        // For edit drafts we need the product loaded — handled below once products arrive.
        return;
      }
      setEditing(null);
      setShowForm(true);
    } catch {}
  }, []);

  if (roles === null) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">Carregando...</div>
      </div>
    );
  }

  if (!roles.hasAnyTeamRole) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md text-center bg-card border border-border rounded-xl p-8">
            <Crown className="h-12 w-12 mx-auto mb-3 text-primary" />
            <h1 className="display text-2xl mb-2">Área restrita</h1>
            <p className="text-sm text-muted-foreground mb-5">
              Você precisa ser o Super Admin (dono) ou ter uma função interna. Se for o primeiro
              acesso da loja, clique abaixo para se tornar o Super Admin inicial.
            </p>
            <button
              onClick={async () => {
                try {
                  const r = await claim({});
                  if (r.ok) { toast.success("Você agora é o Super Admin (Dono)!"); refresh(); }
                  else toast.error("Já existe um Super Admin. Peça acesso a ele.");
                } catch (e: any) { toast.error(e.message ?? "Erro"); }
              }}
              className="bg-primary text-primary-foreground font-black uppercase tracking-wider px-6 py-3 rounded-md shadow-deal"
            >
              Tornar-me Super Admin
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!canManageProducts) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center bg-card border border-border rounded-xl p-8">
            <Truck className="h-12 w-12 mx-auto mb-3 text-primary" />
            <h1 className="display text-2xl mb-2">Sua área é Expedição</h1>
            <p className="text-sm text-muted-foreground mb-5">
              Você é responsável pelo envio e retirada dos pedidos. Catálogo e relatórios são
              restritos ao Super Admin.
            </p>
            <Link to="/admin/expedicao" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-5 py-3 rounded-md">
              <Truck className="h-4 w-4" /> Ir para Expedição
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const del = async (p: Product) => {
    if (!confirm(`Apagar "${p.name}"?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Produto removido");
    refetch();
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const toggleActive = async (p: Product) => {
    const { error } = await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    refetch();
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const share = async (p: Product) => {
    const url = `${window.location.origin}/produto/${p.id}`;
    const off = discountPct(p.original_price, p.price);
    const stockLine =
      p.stock > 0 ? `📦 ${p.stock} ${p.stock === 1 ? "peça" : "peças"} em estoque` : "❌ Sem estoque no momento";
    const text = [
      `🔥 *${p.name}*`,
      `Por ${brl(p.price)}${off > 0 ? ` (${off}% OFF!)` : ""}`,
      p.description ? "" : null,
      p.description ?? null,
      "",
      stockLine,
      "",
      "COMPRE NO LINK ABAIXO:",
      `👇 ${url}`,
    ].filter((l) => l !== null).join("\n");

    const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
    if (nav?.share && p.image_url) {
      try {
        const res = await fetch(p.image_url);
        const blob = await res.blob();
        const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
        const safe = p.name.replace(/[^\w]+/g, "-").toLowerCase().slice(0, 40) || "produto";
        const file = new File([blob], `${safe}.${ext}`, { type: blob.type || "image/jpeg" });
        if (nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], text, title: p.name });
          return;
        }
      } catch {}
      try {
        await nav.share({ title: p.name, text, url });
        return;
      } catch {}
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };


  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent font-bold flex items-center gap-2">
              {roles.isSuperAdmin ? (<><Crown className="h-3.5 w-3.5" /> Super Admin · Dono</>) : (<><Package className="h-3.5 w-3.5" /> Catálogo</>)}
            </div>
            <h1 className="display text-4xl">Produtos</h1>
            <p className="text-sm text-muted-foreground">{products.length} cadastrados</p>
            {!roles.isSuperAdmin && (
              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Você só pode gerenciar produtos. Pedidos, expedição e métricas são restritos ao Super Admin.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {roles.isSuperAdmin && (
              <>
                <Link
                  to="/admin/expedicao"
                  className="inline-flex items-center gap-2 bg-card border-2 border-primary text-primary font-black uppercase tracking-wider px-4 py-3 rounded-md hover:bg-primary hover:text-primary-foreground text-sm"
                >
                  <Truck className="h-4 w-4" /> Expedição
                </Link>
                <Link
                  to="/admin/pedidos"
                  className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md hover:opacity-90 text-sm"
                >
                  <BarChart3 className="h-4 w-4" /> Pedidos & Métricas
                </Link>
                <Link
                  to="/admin/equipe"
                  className="inline-flex items-center gap-2 bg-card border border-border font-black uppercase tracking-wider px-4 py-3 rounded-md hover:border-primary text-sm"
                >
                  <Users className="h-4 w-4" /> Equipe
                </Link>
              </>
            )}
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md shadow-deal hover:scale-[1.02] text-sm"
            >
              <Plus className="h-4 w-4" /> Novo produto
            </button>
          </div>
        </div>
      </section>


      <section className="container mx-auto px-4 py-8 flex-1">
        {products.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-lg border border-border">
            <p className="text-muted-foreground">Nenhum produto ainda. Clique em "Novo produto" para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-card rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Preço</th>
                  <th className="p-3">Estoque</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded bg-muted overflow-hidden flex-shrink-0">
                          {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          {p.category && <div className="text-xs text-muted-foreground">{p.category}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-price">{brl(p.price)}</div>
                      {p.original_price && p.original_price > p.price && (
                        <div className="text-xs text-muted-foreground line-through">{brl(p.original_price)}</div>
                      )}
                    </td>
                    <td className="p-3">{p.stock}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-1 rounded font-bold ${p.active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {p.active ? "Ativo" : "Oculto"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => share(p)} className="p-2 hover:bg-secondary rounded" title="Compartilhar no WhatsApp">
                          <Share2 className="h-4 w-4 text-[#25D366]" />
                        </button>
                        <button onClick={() => toggleActive(p)} className="p-2 hover:bg-secondary rounded" title={p.active ? "Ocultar" : "Mostrar"}>
                          {p.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button onClick={() => { setEditing(p); setShowForm(true); }} className="p-2 hover:bg-secondary rounded" title="Editar">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => del(p)} className="p-2 hover:bg-destructive/10 text-destructive rounded" title="Apagar">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <ProductForm
          product={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refetch(); qc.invalidateQueries({ queryKey: ["products"] }); }}
        />
      )}

      <Footer />
    </div>
  );
}

const DRAFT_KEY = "shopbox:product-form-draft";

type Draft = {
  productId: string | null;
  name: string;
  description: string;
  price: string;
  originalPrice: string;
  category: string;
  stock: string;
  images: string[];
  active: boolean;
};

function loadDraft(productId: string | null): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if ((d.productId ?? null) !== productId) return null;
    return d;
  } catch {
    return null;
  }
}

function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const draft = loadDraft(product?.id ?? null);
  const [name, setName] = useState(draft?.name ?? product?.name ?? "");
  const [description, setDescription] = useState(draft?.description ?? product?.description ?? "");
  const [price, setPrice] = useState(draft?.price ?? (product ? String(product.price) : ""));
  const [originalPrice, setOriginalPrice] = useState(
    draft?.originalPrice ?? (product?.original_price ? String(product.original_price) : ""),
  );
  const [category, setCategory] = useState(draft?.category ?? product?.category ?? "");
  const [stock, setStock] = useState(draft?.stock ?? (product ? String(product.stock) : "0"));
  const [images, setImages] = useState<string[]>(
    draft?.images ??
      (product ? (product.images?.length ? product.images : product.image_url ? [product.image_url] : []) : []),
  );
  const [active, setActive] = useState(draft?.active ?? product?.active ?? true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Persist draft to sessionStorage so the form survives mobile WebView reloads
  // (when the native camera app is launched and the page is evicted from memory).
  useEffect(() => {
    const d: Draft = {
      productId: product?.id ?? null,
      name, description, price, originalPrice, category, stock, images, active,
    };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
  }, [product?.id, name, description, price, originalPrice, category, stock, images, active]);

  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} };

  const handleFiles = async (files: FileList) => {
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadProductImage(file);
        urls.push(url);
      }
      setImages((p) => [...p, ...urls]);
      toast.success(`${urls.length} imagem(ns) enviada(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx: number) => setImages((p) => p.filter((_, i) => i !== idx));
  const moveImage = (idx: number, dir: -1 | 1) => {
    setImages((p) => {
      const next = [...p];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return p;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        original_price: originalPrice ? Number(originalPrice) : null,
        category: category.trim() || null,
        stock: Number(stock),
        image_url: images[0] ?? null,
        images,
        active,
        created_by: user?.id ?? null,
      };
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
        toast.success("Produto atualizado");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("Produto cadastrado");
      }
      clearDraft();
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={save}
        className="bg-card border-2 border-primary rounded-xl w-full max-w-2xl my-8 p-6 space-y-4 shadow-deal"
      >
        <div className="flex items-center justify-between">
          <h2 className="display text-2xl">{product ? "Editar produto" : "Novo produto"}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Fotos do produto ({images.length})
            </label>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs bg-secondary hover:bg-muted px-3 py-1.5 rounded cursor-pointer">
                📷 Tirar foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
                />
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs bg-secondary hover:bg-muted px-3 py-1.5 rounded cursor-pointer">
                <Upload className="h-3.5 w-3.5" /> {uploading ? "Enviando..." : "Adicionar fotos"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
                />
              </label>
            </div>
          </div>


          {images.length === 0 ? (
            <label className="block aspect-[4/1] rounded-lg border-2 border-dashed border-border bg-muted flex items-center justify-center cursor-pointer hover:border-primary">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
              />
              <div className="text-center text-xs text-muted-foreground">
                <Upload className="h-6 w-6 mx-auto mb-1" />
                Clique para enviar uma ou mais imagens
              </div>
            </label>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {images.map((src, idx) => (
                <div key={src} className="relative aspect-square rounded-md overflow-hidden border border-border group">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  {idx === 0 && (
                    <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded">CAPA</span>
                  )}
                  <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                    <button type="button" onClick={() => moveImage(idx, -1)} className="bg-secondary text-xs px-1.5 py-0.5 rounded" disabled={idx === 0}>←</button>
                    <button type="button" onClick={() => moveImage(idx, 1)} className="bg-secondary text-xs px-1.5 py-0.5 rounded" disabled={idx === images.length - 1}>→</button>
                    <button type="button" onClick={() => removeImage(idx)} className="bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Nome" value={name} onChange={setName} required />
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1 h-10"
            >
              <option value="">Selecione...</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Preço (R$)" type="number" step="0.01" value={price} onChange={setPrice} required />
          <Input label="De (R$)" type="number" step="0.01" value={originalPrice} onChange={setOriginalPrice} placeholder="opcional" />
          <Input label="Estoque" type="number" value={stock} onChange={setStock} required />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary h-4 w-4" />
          <span className="text-sm">Produto ativo (visível na loja)</span>
        </label>

        <div className="flex gap-2 justify-end pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md hover:bg-secondary text-sm">Cancelar</button>
          <button
            type="submit"
            disabled={busy || uploading}
            className="bg-primary text-primary-foreground font-black uppercase tracking-wider px-6 py-2 rounded-md shadow-deal disabled:opacity-60"
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Input({
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
