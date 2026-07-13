import { createFileRoute, Outlet, useRouterState, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Share2, Eye, EyeOff, Crown, BarChart3, Truck, Users, Package, ShieldAlert, Undo2, ShoppingBag, CheckSquare, Square, XSquare, Gift, FileText, Settings } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { adminProductsInfiniteQuery, ADMIN_PRODUCTS_PAGE_SIZE, getRoleSummary, type Product, type RoleSummary } from "@/lib/products";
import { claimFirstAdmin } from "@/lib/admin.functions";
import { brl, discountPct, postDate } from "@/lib/format";
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

  const {
    data: pagedData,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching: isFetchingProducts,
  } = useInfiniteQuery({
    ...adminProductsInfiniteQuery(),
    enabled: canManageProducts && !isChildRoute,
  });
  const products: Product[] = (pagedData?.pages ?? []).flatMap((p) => p.items);
  const totalProducts = pagedData?.pages?.[0]?.total ?? products.length;
  const loadedCount = products.length;

  // Auto-carrega todas as páginas em background para que busca, aba "Esgotados"
  // e ações em massa ("Ocultar todos os esgotados") operem sobre o catálogo
  // completo, e não apenas sobre a primeira página de 100 produtos.
  useEffect(() => {
    if (!canManageProducts || isChildRoute) return;
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [canManageProducts, isChildRoute, hasNextPage, isFetchingNextPage, fetchNextPage, loadedCount]);


  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"todos" | "esgotados">("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkHiding, setIsBulkHiding] = useState(false);


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

  // Limpa seleção ao mudar de aba
  useEffect(() => { setSelected(new Set()); }, [tab]);

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
    // .select() força o retorno das linhas afetadas; se vier vazio, foi RLS bloqueando silenciosamente.
    const { data, error } = await supabase.from("products").delete().eq("id", p.id).select("id");
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) {
      return toast.error("Sem permissão para apagar este produto. Confirme que sua conta possui o cargo de admin, gerente ou catálogo.");
    }
    toast.success("Produto removido");
    refetch();
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const toggleActive = async (p: Product) => {
    const { data, error } = await supabase.from("products").update({ active: !p.active }).eq("id", p.id).select("id");
    if (error) return toast.error(error.message);
    if (!data || data.length === 0) {
      return toast.error("Sem permissão para alterar este produto.");
    }
    refetch();
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const bulkHide = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Ocultar ${ids.length} ${ids.length === 1 ? "produto" : "produtos"}?`)) return;
    setIsBulkHiding(true);
    const { data, error } = await supabase.from("products").update({ active: false }).in("id", ids).select("id");
    setIsBulkHiding(false);
    if (error) return toast.error(error.message);
    const changed = data?.length ?? 0;
    if (changed === 0) {
      return toast.error("Sem permissão para ocultar estes produtos.");
    }
    setSelected(new Set());
    toast.success(`${changed} produto(s) ocultado(s)`);
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
            <p className="text-sm text-muted-foreground">{totalProducts} cadastrados no total</p>
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
                <Link
                  to="/admin/vale-troca"
                  className="inline-flex items-center gap-2 bg-card border border-emerald-500/50 text-emerald-700 dark:text-emerald-400 font-black uppercase tracking-wider px-4 py-3 rounded-md hover:bg-emerald-500/10 text-sm"
                >
                  <Gift className="h-4 w-4" /> Vale-Troca
                </Link>
                <Link
                  to="/admin/fiscal"
                  className="inline-flex items-center gap-2 bg-card border border-blue-500/50 text-blue-700 dark:text-blue-400 font-black uppercase tracking-wider px-4 py-3 rounded-md hover:bg-blue-500/10 text-sm"
                >
                  <FileText className="h-4 w-4" /> Fiscal
                </Link>
                <Link
                  to="/admin/venda-manual"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md shadow-deal hover:scale-[1.02] text-sm"
                >
                  <ShoppingBag className="h-4 w-4" /> Venda manual
                </Link>
                <Link
                  to="/admin/configuracoes"
                  className="inline-flex items-center gap-2 bg-card border border-border font-black uppercase tracking-wider px-4 py-3 rounded-md hover:border-primary text-sm"
                >
                  <Settings className="h-4 w-4" /> Configurações
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
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

          {tab === "esgotados" && (
            <div className="flex items-center gap-2">
              {selected.size > 0 ? (
                <button
                  type="button"
                  disabled={isBulkHiding}
                  onClick={() => bulkHide(Array.from(selected))}
                  className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs hover:bg-destructive/90 disabled:opacity-50"
                >
                  <EyeOff className="h-4 w-4" />
                  Ocultar {selected.size} selecionado{selected.size === 1 ? "" : "s"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBulkHiding}
                  onClick={() => {
                    const ids = products.filter((p) => p.stock === 0 && p.active).map((p) => p.id);
                    bulkHide(ids);
                  }}
                  className="inline-flex items-center gap-2 bg-card border border-border text-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs hover:bg-secondary disabled:opacity-50"
                >
                  <EyeOff className="h-4 w-4" />
                  Ocultar todos os esgotados
                </button>
              )}
            </div>
          )}
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
          const activeEsgotados = tab === "esgotados" ? filtered.filter((p) => p.active) : [];
          const allSelected = activeEsgotados.length > 0 && activeEsgotados.every((p) => selected.has(p.id));
          const someSelected = activeEsgotados.some((p) => selected.has(p.id)) && !allSelected;

          const toggleSelectAll = () => {
            if (allSelected) {
              const next = new Set(selected);
              activeEsgotados.forEach((p) => next.delete(p.id));
              setSelected(next);
            } else {
              const next = new Set(selected);
              activeEsgotados.forEach((p) => next.add(p.id));
              setSelected(next);
            }
          };

          const toggleSelect = (id: string) => {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelected(next);
          };

          return (
          <>
          {/* Lista em cards para mobile — mantém as ações (compartilhar, ocultar, editar, apagar) sempre visíveis */}
          <div className="md:hidden flex flex-col gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="bg-card rounded-lg border border-border p-3">
                <div className="flex items-start gap-3">
                  {tab === "esgotados" && (
                    <button
                      type="button"
                      onClick={() => toggleSelect(p.id)}
                      className="mt-1 shrink-0 inline-flex items-center justify-center"
                      title={selected.has(p.id) ? "Desmarcar" : "Selecionar"}
                    >
                      {selected.has(p.id) ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                    </button>
                  )}
                  <div className="h-16 w-16 rounded bg-muted overflow-hidden shrink-0">
                    {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-xs font-mono text-muted-foreground">Cód. {p.sku}</div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-price">{brl(p.price)}</span>
                      {p.original_price && p.original_price > p.price && (
                        <span className="text-xs text-muted-foreground line-through">{brl(p.original_price)}</span>
                      )}
                      <span className="text-xs text-muted-foreground">· Estoque: {p.stock}</span>
                    </div>
                    <div className="mt-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${p.active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {p.active ? "Ativo" : "Oculto"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  <button onClick={() => share(p)} className="flex flex-col items-center gap-1 py-2 rounded bg-secondary/60 hover:bg-secondary text-xs" title="Compartilhar no WhatsApp">
                    <Share2 className="h-4 w-4 text-[#25D366]" />
                    Compartilhar
                  </button>
                  <button onClick={() => toggleActive(p)} className="flex flex-col items-center gap-1 py-2 rounded bg-secondary/60 hover:bg-secondary text-xs">
                    {p.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {p.active ? "Ocultar" : "Mostrar"}
                  </button>
                  <button onClick={() => { setEditing(p); setShowForm(true); }} className="flex flex-col items-center gap-1 py-2 rounded bg-secondary/60 hover:bg-secondary text-xs">
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button onClick={() => del(p)} className="flex flex-col items-center gap-1 py-2 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs">
                    <Trash2 className="h-4 w-4" />
                    Apagar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto bg-card rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
                <tr>
                  {tab === "esgotados" && (
                    <th className="p-3 w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="inline-flex items-center justify-center"
                        title={allSelected ? "Desmarcar todos" : "Selecionar todos"}
                      >
                        {allSelected ? <CheckSquare className="h-5 w-5 text-primary" /> : someSelected ? <XSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                      </button>
                    </th>
                  )}
                  <th className="p-3">Produto</th>
                  <th className="p-3">Postagem</th>
                  <th className="p-3">Preço</th>
                  <th className="p-3">Estoque</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    {tab === "esgotados" && (
                      <td className="p-3 w-10">
                        <button
                          type="button"
                          onClick={() => toggleSelect(p.id)}
                          className="inline-flex items-center justify-center"
                          title={selected.has(p.id) ? "Desmarcar" : "Selecionar"}
                        >
                          {selected.has(p.id) ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                        </button>
                      </td>
                    )}
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
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{postDate(p.created_at)}</div>
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
          </>
          );
        })()}

        <div className="mt-6 flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Exibindo {loadedCount} de {totalProducts} produtos
          </p>
          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-6 py-3 rounded-md shadow-deal hover:scale-[1.02] text-sm disabled:opacity-60 disabled:cursor-wait"
            >
              {isFetchingNextPage ? "Carregando..." : `Carregar mais ${Math.min(ADMIN_PRODUCTS_PAGE_SIZE, totalProducts - loadedCount)}`}
            </button>
          )}
          {!hasNextPage && loadedCount > 0 && isFetchingProducts === false && (
            <p className="text-[11px] text-muted-foreground">Todos os produtos foram carregados.</p>
          )}
        </div>
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



