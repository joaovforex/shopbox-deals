import { createFileRoute, Outlet, useRouterState, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Share2, Eye, EyeOff, Crown, Truck, Package, ShieldAlert, CheckSquare, Square, XSquare } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { AdminSidebar } from "@/components/AdminSidebar";
import { startAutoAudit, auditPageView } from "@/lib/audit-auto";

import { supabase } from "@/integrations/supabase/client";
import { adminProductsInfiniteQuery, getRoleSummary, type Product, type RoleSummary } from "@/lib/products";
import { claimFirstAdmin } from "@/lib/admin.functions";
import { brl, discountPct, postDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProductForm, PRODUCT_FORM_DRAFT_KEY as DRAFT_KEY } from "@/components/ProductForm";
import { BulkShareDialog } from "@/components/BulkShareDialog";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { BulkProductActions } from "@/components/admin/BulkProductActions";
import { optimizedImage, optimizedSrcSet } from "@/lib/image-url";




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

  // Auditoria automática: registra escritas, RPCs e navegação de cada membro da equipe.
  useEffect(() => {
    if (!roles?.hasAnyTeamRole) return;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (cancelled || !u) return;
      const meta = u.user_metadata as Record<string, unknown> | undefined;
      startAutoAudit({ id: u.id, name: (meta?.full_name as string | undefined) ?? u.email ?? null });
      auditPageView(window.location.pathname);
    });
    return () => { cancelled = true; };
  }, [roles?.hasAnyTeamRole]);

  useEffect(() => {
    if (!roles?.hasAnyTeamRole) return;
    auditPageView(pathname);
  }, [pathname, roles?.hasAnyTeamRole]);


  // Cargo Caixa (sem catálogo/expedição) vai direto para Caixa QR
  useEffect(() => {
    if (!isChildRoute && roles && !roles.isCatalog && !roles.isFulfillment && roles.isCashier) {
      navigate({ to: "/admin/caixa-qr", replace: true });
      return;
    }
    // Expedição-only (sem catálogo) é redirecionado para sua área
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

  // Carregamento SOB DEMANDA: nunca puxamos os ~1.600 produtos de uma vez.
  // O admin carrega lotes de 100 ("Carregar mais") ou pede o catálogo inteiro
  // explicitamente quando precisa de busca/ações em massa globais.
  const [loadingAll, setLoadingAll] = useState(false);
  const loadAll = async () => {
    setLoadingAll(true);
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r = await fetchNextPage();
        const last = r.data?.pages?.[r.data.pages.length - 1];
        if (!last?.nextOffset) break;
      }
    } finally {
      setLoadingAll(false);
    }
  };



  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"todos" | "esgotados" | "ocultos">("todos");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkHiding, setIsBulkHiding] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkShareOpen, setBulkShareOpen] = useState(false);


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

  if (isChildRoute) {
    if (!roles) return <Outlet />;
    return (
      <div className="flex flex-col lg:flex-row min-h-screen w-full max-w-full overflow-x-hidden">
        <AdminSidebar roles={roles} />
        <div className="flex-1 min-w-0 w-full flex flex-col pb-20 lg:pb-0"><Outlet /></div>
      </div>
    );
  }

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
    const { data, error } = await supabase.rpc("admin_delete_products" as never, { p_ids: [p.id] } as never);
    if (error) return toast.error(error.message);
    if (!data || Number(data) === 0) return toast.error("Nenhum produto removido.");
    toast.success("Produto removido");
    refetch();
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const toggleActive = async (p: Product) => {
    const { data, error } = await supabase.rpc("admin_set_products_active" as never, { p_ids: [p.id], p_active: !p.active } as never);
    if (error) return toast.error(error.message);
    if (!data || Number(data) === 0) return toast.error("Nenhuma alteração aplicada.");
    refetch();
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const bulkHide = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Ocultar ${ids.length} ${ids.length === 1 ? "produto" : "produtos"}?`)) return;
    setIsBulkHiding(true);
    const { data, error } = await supabase.rpc("admin_set_products_active" as never, { p_ids: ids, p_active: false } as never);
    setIsBulkHiding(false);
    if (error) return toast.error(error.message);
    const changed = Number(data ?? 0);
    if (changed === 0) return toast.error("Nenhum produto alterado.");
    setSelected(new Set());
    toast.success(`${changed} produto(s) ocultado(s)`);
    refetch();
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const bulkDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`Apagar definitivamente ${ids.length} ${ids.length === 1 ? "produto" : "produtos"}? Essa ação não pode ser desfeita.`)) return;
    setIsBulkDeleting(true);
    const BATCH = 500;
    let removed = 0;
    let firstError: string | null = null;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const { data, error } = await supabase.rpc("admin_delete_products" as never, { p_ids: slice } as never);
      if (error) { firstError = error.message; break; }
      removed += Number(data ?? 0);
    }
    setIsBulkDeleting(false);
    if (firstError) return toast.error(firstError);
    if (removed === 0) return toast.error("Nenhum produto apagado.");
    setSelected(new Set());
    toast.success(`${removed} produto(s) apagado(s)`);
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
    <div className="flex flex-col lg:flex-row min-h-screen w-full max-w-full overflow-x-hidden">
      <AdminSidebar roles={roles} />
      <div className="flex-1 min-w-0 w-full flex flex-col">
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
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 bg-foreground text-background font-semibold px-3 py-1.5 rounded-md text-xs hover:opacity-90 transition-opacity"
            >
              <Plus className="h-3.5 w-3.5" /> Novo produto
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
            <button
              type="button"
              onClick={() => setTab("ocultos")}
              className={cn(
                "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all",
                tab === "ocultos"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Ocultos
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setSelectMode((v) => {
                  if (v) setSelected(new Set());
                  return !v;
                });
              }}
              className={cn(
                "inline-flex items-center gap-2 font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs border",
                selectMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:bg-secondary",
              )}
            >
              <CheckSquare className="h-4 w-4" />
              {selectMode ? "Sair da seleção" : "Selecionar"}
            </button>

            {selectMode && selected.size > 0 && (
              <button
                type="button"
                onClick={() => setBulkShareOpen(true)}
                className="inline-flex items-center gap-2 bg-[#25D366] text-white font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs hover:opacity-90"
              >
                <Share2 className="h-4 w-4" />
                Compartilhar {selected.size}
              </button>
            )}

            {tab === "esgotados" && (
              <>
                {selected.size > 0 ? (
                  <>
                    <button
                      type="button"
                      disabled={isBulkHiding}
                      onClick={() => bulkHide(Array.from(selected))}
                      className="inline-flex items-center gap-2 bg-card border border-border text-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs hover:bg-secondary disabled:opacity-50"
                    >
                      <EyeOff className="h-4 w-4" />
                      Ocultar {selected.size}
                    </button>
                    <button
                      type="button"
                      disabled={isBulkDeleting}
                      onClick={() => bulkDelete(Array.from(selected))}
                      className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs hover:bg-destructive/90 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir {selected.size}
                    </button>
                  </>
                ) : (
                  <>
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
                      Ocultar todos esgotados
                    </button>
                    <button
                      type="button"
                      disabled={isBulkDeleting}
                      onClick={() => {
                        const ids = products.filter((p) => p.stock === 0).map((p) => p.id);
                        bulkDelete(ids);
                      }}
                      className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs hover:bg-destructive/90 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir todos esgotados
                    </button>
                  </>
                )}
              </>
            )}

            {tab === "ocultos" && (
              selected.size > 0 ? (
                <button
                  type="button"
                  disabled={isBulkDeleting}
                  onClick={() => bulkDelete(Array.from(selected))}
                  className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs hover:bg-destructive/90 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir {selected.size}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBulkDeleting}
                  onClick={() => {
                    const ids = products.filter((p) => !p.active).map((p) => p.id);
                    bulkDelete(ids);
                  }}
                  className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs hover:bg-destructive/90 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir todos os ocultos
                </button>
              )
            )}
          </div>
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
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-11 rounded-md border border-border bg-card text-sm px-3 focus:outline-none focus:border-primary min-w-[180px]"
          >
            <option value="">Todas as categorias</option>
            {Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c)))
              .sort((a, b) => a.localeCompare(b, "pt-BR"))
              .map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
          </select>
          {(search || categoryFilter) && (
            <button
              onClick={() => { setSearch(""); setCategoryFilter(""); }}
              className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {(() => {
              const t = search.trim().toLowerCase();
              const byTab = tab === "esgotados"
                ? products.filter((p) => p.stock === 0)
                : tab === "ocultos"
                  ? products.filter((p) => !p.active)
                  : products;
              const byCat = categoryFilter ? byTab.filter((p) => p.category === categoryFilter) : byTab;
              const match = (p: typeof products[number]) =>
                p.name.toLowerCase().includes(t)
                || (p.category ?? "").toLowerCase().includes(t)
                || (p.sku ?? "").toLowerCase().includes(t);
              const n = t ? byCat.filter(match).length : byCat.length;
              return `${n} ${n === 1 ? "resultado" : "resultados"}`;
            })()}
          </span>
        </div>

        {hasNextPage && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0">
              Carregados {loadedCount} de {totalProducts}. Busca, abas e ações em massa consideram apenas o que está
              carregado.
            </span>
            <button
              type="button"
              onClick={loadAll}
              disabled={loadingAll}
              className="ml-auto inline-flex items-center gap-1.5 min-h-11 px-3 rounded-md border border-border bg-card font-bold uppercase tracking-wider hover:bg-secondary disabled:opacity-50"
            >
              {loadingAll ? "Carregando..." : "Carregar catálogo inteiro"}
            </button>
          </div>
        )}

        {selectMode && (
          <BulkProductActions
            selectedIds={Array.from(selected)}
            products={products}
            categories={Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b, "pt-BR"))}
            onDone={() => {
              setSelected(new Set());
              refetch();
              qc.invalidateQueries({ queryKey: ["products"] });
            }}
          />
        )}

        {(() => {
          const t = search.trim().toLowerCase();
          const byTab = tab === "esgotados"
            ? products.filter((p) => p.stock === 0)
            : tab === "ocultos"
              ? products.filter((p) => !p.active)
              : products;
          const byCat = categoryFilter ? byTab.filter((p) => p.category === categoryFilter) : byTab;
          const match = (p: typeof products[number]) =>
            p.name.toLowerCase().includes(t)
            || (p.category ?? "").toLowerCase().includes(t)
            || (p.sku ?? "").toLowerCase().includes(t);
          const filtered = t ? byCat.filter(match) : byCat;
          if (products.length === 0) {
            if (isFetchingProducts) {
              return <AdminSkeleton variant="cards" rows={8} />;
            }
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
                  {tab === "esgotados"
                    ? "Nenhum produto esgotado."
                    : tab === "ocultos"
                      ? "Nenhum produto oculto."
                      : `Nenhum produto encontrado para "${search}".`}
                </p>
              </div>
            );
          }
          const showCheckbox = selectMode || tab === "esgotados" || tab === "ocultos";
          const selectableSet = tab === "esgotados"
            ? filtered.filter((p) => p.active)
            : filtered;
          const allSelected = selectableSet.length > 0 && selectableSet.every((p) => selected.has(p.id));
          const someSelected = selectableSet.some((p) => selected.has(p.id)) && !allSelected;

          const toggleSelectAll = () => {
            if (allSelected) {
              const next = new Set(selected);
              selectableSet.forEach((p) => next.delete(p.id));
              setSelected(next);
            } else {
              const next = new Set(selected);
              selectableSet.forEach((p) => next.add(p.id));
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
                  {showCheckbox && (
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
                    {p.image_url && (
                      <img
                        src={optimizedImage(p.image_url, { width: 128, quality: 65 })}
                        srcSet={optimizedSrcSet(p.image_url, 128, 65)}
                        width={64}
                        height={64}
                        loading="lazy"
                        decoding="async"
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}

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
                  {showCheckbox && (
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
                    {showCheckbox && (
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
                          {p.image_url && (
                            <img
                              src={optimizedImage(p.image_url, { width: 96, quality: 65 })}
                              srcSet={optimizedSrcSet(p.image_url, 96, 65)}
                              width={48}
                              height={48}
                              loading="lazy"
                              decoding="async"
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}

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
              {isFetchingNextPage ? "Carregando..." : `Carregar mais`}
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

      {bulkShareOpen && (
        <BulkShareDialog
          products={products.filter((p) => selected.has(p.id))}
          onClose={() => setBulkShareOpen(false)}
        />
      )}

      <Footer />
      </div>
    </div>
  );
}



