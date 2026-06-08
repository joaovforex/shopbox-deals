import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Share2, Eye, EyeOff, Upload, Crown } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { fetchProducts, isAdmin, uploadProductImage, type Product } from "@/lib/products";
import { claimFirstAdmin } from "@/lib/admin.functions";
import { brl, discountPct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · shopbox" }] }),
  component: AdminPage,
});

function AdminPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const claim = useServerFn(claimFirstAdmin);
  const qc = useQueryClient();

  const refresh = () => isAdmin().then(setAdmin);
  useEffect(() => { refresh(); }, []);

  const { data: products = [], refetch } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => fetchProducts(),
    enabled: admin === true,
  });

  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (admin === null) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">Carregando...</div>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md text-center bg-card border border-border rounded-xl p-8">
            <Crown className="h-12 w-12 mx-auto mb-3 text-primary" />
            <h1 className="display text-2xl mb-2">Área restrita</h1>
            <p className="text-sm text-muted-foreground mb-5">
              Você precisa ser administrador. Se for o primeiro acesso da loja, clique abaixo para
              se tornar o administrador inicial.
            </p>
            <button
              onClick={async () => {
                try {
                  const r = await claim({});
                  if (r.ok) {
                    toast.success("Você agora é administrador!");
                    refresh();
                  } else {
                    toast.error("Já existe um administrador. Peça acesso a ele.");
                  }
                } catch (e: any) {
                  toast.error(e.message ?? "Erro");
                }
              }}
              className="bg-primary text-primary-foreground font-black uppercase tracking-wider px-6 py-3 rounded-md shadow-deal"
            >
              Tornar-me administrador
            </button>
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

  const share = (p: Product) => {
    const url = `${window.location.origin}/produto/${p.id}`;
    const off = discountPct(p.original_price, p.price);
    const text = `🔥 *${p.name}* na shopbox por apenas ${brl(p.price)}${off > 0 ? ` (${off}% OFF!)` : ""}\n\n👉 ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent font-bold">Painel do vendedor</div>
            <h1 className="display text-4xl">Produtos</h1>
            <p className="text-sm text-muted-foreground">{products.length} cadastrados</p>
          </div>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-5 py-3 rounded-md shadow-deal hover:scale-[1.02]"
          >
            <Plus className="h-5 w-5" /> Novo produto
          </button>
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

function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [originalPrice, setOriginalPrice] = useState(
    product?.original_price ? String(product.original_price) : "",
  );
  const [category, setCategory] = useState(product?.category ?? "");
  const [stock, setStock] = useState(product ? String(product.stock) : "0");
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setImageUrl(url);
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e.message ?? "Erro no upload");
    } finally {
      setUploading(false);
    }
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
        image_url: imageUrl || null,
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

        <div className="grid md:grid-cols-[160px_1fr] gap-4">
          <label className="aspect-square rounded-lg border-2 border-dashed border-border bg-muted overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary relative">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="text-center text-xs text-muted-foreground p-2">
                <Upload className="h-6 w-6 mx-auto mb-1" />
                {uploading ? "Enviando..." : "Foto"}
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>

          <div className="space-y-3">
            <Input label="Nome" value={name} onChange={setName} required />
            <Input label="Categoria" value={category} onChange={setCategory} placeholder="Ex: Eletrônicos" />
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
}: { label: string; value: string; onChange: (v: string) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
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
