import { createFileRoute, Outlet, useRouterState, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Share2, Eye, EyeOff, Crown, BarChart3, Truck, Users, Package, ShieldAlert, Undo2 } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { fetchProducts, getRoleSummary, type Product, type RoleSummary } from "@/lib/products";
import { claimFirstAdmin } from "@/lib/admin.functions";
import { brl, discountPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductForm, PRODUCT_FORM_DRAFT_KEY as DRAFT_KEY } from "@/components/ProductForm";



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

  // Expedição-only (sem catálogo) é redirecionado para sua área
  useEffect(() => {
    if (!isChildRoute && roles && !roles.isCatalog && roles.isFulfillment) {
      navigate({ to: "/admin/expedicao", replace: true });
    }
  }, [roles, isChildRoute, navigate]);

  const canManageProducts = !!roles && (roles.isCatalog || roles.isManager);

  const { data: products = [], refetch } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => fetchProducts(),
    enabled: canManageProducts && !isChildRoute,
  });

  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"todos" | "esgotados">("todos");


  // If a draft for an existing product was in progress, reopen edit form once loaded.
  useEffect(() => {
    if (isChildRoute) return;
    if (!products.length || editing || showForm) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { productId: string | null };
      if (!d.productId) return;
      const p = products.find((x) => x.id === d.productId);
      if (p) { setEditing(p); setShowForm(true); }
    } catch {}
  }, [products, editing, showForm, isChildRoute]);

  // Auto-reopen the product form when returning from a mobile camera launch that
  // evicted the page from memory (a saved draft exists in sessionStorage).
  useEffect(() => {
    if (isChildRoute) return;
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
  }, [isChildRoute]);

  if (isChildRoute) return <Outlet />;

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
              {roles.isSuperAdmin ? (
                <><Crown className="h-3.5 w-3.5" /> Super Admin · Dono</>
              ) : roles.isManager ? (
                <><Truck className="h-3.5 w-3.5" /> ADM · Catálogo + Expedição</>
              ) : (
                <><Package className="h-3.5 w-3.5" /> Catálogo</>
              )}
            </div>
            <h1 className="display text-4xl">Produtos</h1>
            <p className="text-sm text-muted-foreground">{products.filter((p) => p.stock > 0).length} cadastrados</p>
            {!roles.isSuperAdmin && !roles.isManager && (
              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Você só pode gerenciar produtos. Pedidos, expedição e métricas são restritos ao Super Admin.
              </p>
            )}
            {roles.isManager && (
              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" /> Você tem acesso a Catálogo e Expedição. Métricas e gestão de equipe são restritas ao Super Admin.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {(roles.isSuperAdmin || roles.isManager) && (
              <Link
                to="/admin/expedicao"
                className="inline-flex items-center gap-2 bg-card border-2 border-primary text-primary font-black uppercase tracking-wider px-4 py-3 rounded-md hover:bg-primary hover:text-primary-foreground text-sm"
              >
                <Truck className="h-4 w-4" /> Expedição
              </Link>
            )}
            {roles.isSuperAdmin && (
              <>
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
                <Link
                  to="/admin/reembolsos"
                  className="inline-flex items-center gap-2 bg-card border border-amber-500/50 text-amber-700 dark:text-amber-400 font-black uppercase tracking-wider px-4 py-3 rounded-md hover:bg-amber-500/10 text-sm"
                >
                  <Undo2 className="h-4 w-4" /> Reembolsos
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
        <div className="mb-4 inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setTab("todos")}
            className={cn(
              "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all",
              tab === "todos"
                ? "bg-background text-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setTab("esgotados")}
            className={cn(
              "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all",
              tab === "esgotados"
                ? "bg-background text-foreground shadow"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Esgotados
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, código ou categoria..."
              className="w-full h-11 pl-4 pr-4 rounded-md border border-border bg-card text-sm focus:outline-none focus:border-primary"
            />
          </div>
          {search && (
            <button onClick={() => setSearch("")} className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
              Limpar
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {(() => {
              const t = search.trim().toLowerCase();
              const byTab = tab === "esgotados" ? products.filter((p) => p.stock === 0) : products;
              const match = (p: typeof products[number]) =>
                p.name.toLowerCase().includes(t)
                || (p.category ?? "").toLowerCase().includes(t)
                || (p.sku ?? "").toLowerCase().includes(t);
              const n = t ? byTab.filter(match).length : byTab.length;
              return `${n} ${n === 1 ? "resultado" : "resultados"}`;
            })()}
          </span>
        </div>
        {(() => {
          const t = search.trim().toLowerCase();
          const byTab = tab === "esgotados" ? products.filter((p) => p.stock === 0) : products;
          const match = (p: typeof products[number]) =>
            p.name.toLowerCase().includes(t)
            || (p.category ?? "").toLowerCase().includes(t)
            || (p.sku ?? "").toLowerCase().includes(t);
          const filtered = t ? byTab.filter(match) : byTab;
          if (products.length === 0) {
            return (
              <div className="text-center py-20 bg-card rounded-lg border border-border">
                <p className="text-muted-foreground">Nenhum produto ainda. Clique em "Novo produto" para começar.</p>
              </div>
            );
          }
          if (filtered.length === 0) {
            return (
              <div className="text-center py-20 bg-card rounded-lg border border-border">
                <p className="text-muted-foreground">
                  {tab === "esgotados" ? "Nenhum produto esgotado." : `Nenhum produto encontrado para "${search}".`}
                </p>
              </div>
            );
          }
          return (
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
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded bg-muted overflow-hidden flex-shrink-0">
                          {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-xs font-mono text-muted-foreground">Cód. {p.sku}</div>
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
          );
        })()}
      </section>


      {showForm && (
        <ProductForm
          product={editing}
          onClose={() => { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} setShowForm(false); }}
          onSaved={() => { setShowForm(false); refetch(); qc.invalidateQueries({ queryKey: ["products"] }); }}
        />
      )}

      <Footer />
    </div>
  );
}



