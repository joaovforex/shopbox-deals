import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, TrendingUp, Package, DollarSign, ShoppingBag, Sparkles, Truck, Store, Trash2, AlertTriangle, Search, Filter, X, Undo2, Share2, Gift, Download, CalendarIcon, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { Header, Footer } from "@/components/Header";
import { RefundModal } from "@/components/RefundModal";
import { ExchangeVoucherModal } from "@/components/ExchangeVoucherModal";
import { DeleteOrderDialog } from "@/components/admin/DeleteOrderDialog";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, isSuperAdmin, clearRolesCache } from "@/lib/products";
import {
  fetchOrderMetrics,
  fetchOrdersPage,
  fetchCatalogValue,
  AdminMetricsError,
  type OrderMetrics,
  type AdminOrderRow,
} from "@/lib/admin-metrics";
import { brl } from "@/lib/format";
import { PRODUCT_CATEGORIES } from "@/lib/categories";
import { refundOrder } from "@/lib/refunds.functions";
import { createExchangeVoucher } from "@/lib/exchange-vouchers.functions";
import { listAllCustomers } from "@/lib/customers.functions";
import { getPosChargesMetrics } from "@/lib/caixa-qr.functions";
import { logAudit } from "@/lib/audit";
import { maskCpf, maskEmail, maskPhone, formatCpfFull, formatPhoneFull } from "@/lib/mask";
import { Eye, EyeOff } from "lucide-react";



export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos · Admin" }] }),
  component: OrdersPanel,
});

type Period = "day" | "week" | "month" | "all";

const PAGE_SIZE = 50;

type StatusFilter = "all" | "paid" | "fulfillment" | "delivered" | "refunded" | "cancelled";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Pago" },
  { value: "fulfillment", label: "Separado/Retirada" },
  { value: "delivered", label: "Entregue" },
  { value: "refunded", label: "Estornado" },
  { value: "cancelled", label: "Cancelado/Arquivado" },
];

function orderStatusGroup(o: OrderRow): Exclude<StatusFilter, "all"> {
  if (o.status !== "paid") return "cancelled";
  if (o.refund_status || o.refunded_at) return "refunded";
  if (o.fulfillment_status === "completed") return "delivered";
  if (o.fulfillment_status === "preparing" || o.fulfillment_status === "ready" || o.fulfillment_status === "shipped") return "fulfillment";
  return "paid";
}

type OrderRow = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_cpf: string | null;
  shipping_address: string | null;
  payment_method: string;
  delivery_method: string;
  status: string;
  total: number;
  mp_payment_id: string | null;
  refund_status: string | null;
  refunded_amount: number | null;
  fulfillment_status: string | null;
  refunded_at: string | null;
};
type ItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
};

function startOf(period: Period): Date | null {
  const now = new Date();
  if (period === "all") return null;
  const d = new Date(now);
  if (period === "day") { d.setHours(0, 0, 0, 0); return d; }
  if (period === "week") {
    // Janela rolante dos últimos 8 dias (hoje + 7 dias anteriores), sempre
    // iniciando às 00:00 do 8º dia atrás. Não é semana civil dom→dom — é
    // um período rolante fixo de 8 dias para acompanhar tendência.
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (period === "month") { d.setMonth(d.getMonth() - 1); return d; }
  return null;
}

function OrdersPanel() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [superAdmin, setSuperAdmin] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchCpf, setSearchCpf] = useState("");
  const [filterDelivery, setFilterDelivery] = useState<"all" | "delivery" | "pickup">("all");
  const [filterPayment, setFilterPayment] = useState<"all" | "pix" | "card">("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("paid");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [voucherTarget, setVoucherTarget] = useState<OrderRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderRow | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const refundFn = useServerFn(refundOrder);
  const voucherFn = useServerFn(createExchangeVoucher);
  const listCustomersFn = useServerFn(listAllCustomers);
  const posMetricsFn = useServerFn(getPosChargesMetrics);
  const [exportingCustomers, setExportingCustomers] = useState(false);
  const qc = useQueryClient();

  const posMetrics = useQuery({
    queryKey: ["pos-charges", "metrics"],
    queryFn: () => posMetricsFn(),
    enabled: admin === true,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  async function downloadCustomersCsv() {
    if (exportingCustomers) return;
    setExportingCustomers(true);
    try {
      const rows = await listCustomersFn();
      const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
      const csv = ["nome,email,whatsapp", ...rows.map((r) => `${esc(r.nome)},${esc(r.email)},${esc(r.whatsapp)}`)].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `clientes-shopbox-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} clientes exportados`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar clientes");
    } finally {
      setExportingCustomers(false);
    }
  }


  useEffect(() => {
    isAdmin().then(setAdmin);
    isSuperAdmin().then(setSuperAdmin);
  }, []);

  // Ao buscar por nome/CPF, ignora o período selecionado e procura em todos os pedidos.
  const hasCustomRange = !!(dateFrom || dateTo);
  const effectivePeriod: Period = searchCpf.trim() || hasCustomRange ? "all" : period;

  // Intervalo efetivo (ISO) aplicado tanto nas métricas quanto na listagem.
  const range = useMemo(() => {
    if (dateFrom || dateTo) {
      return {
        from: dateFrom ? new Date(dateFrom + "T00:00:00").toISOString() : null,
        to: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : null,
      };
    }
    const since = startOf(effectivePeriod);
    return { from: since ? since.toISOString() : null, to: null };
  }, [dateFrom, dateTo, effectivePeriod]);

  const filters = {
    from: range.from,
    to: range.to,
    delivery: filterDelivery === "all" ? null : filterDelivery,
    payment: filterPayment === "all" ? null : filterPayment,
    category: filterCategory === "all" ? null : filterCategory,
  };

  // MÉTRICAS: calculadas no banco (RPC). Nunca dependem do teto de 1000 linhas.
  const metricsQuery = useQuery({
    queryKey: ["admin-order-metrics", filters],
    enabled: admin === true,
    queryFn: () => fetchOrderMetrics(filters),
    staleTime: 30_000,
  });

  // LISTA: paginada no banco, com contagem real total.
  const ordersQuery = useQuery({
    queryKey: ["admin-orders", filters, debouncedSearch, filterStatus, page],
    enabled: admin === true,
    queryFn: () =>
      fetchOrdersPage({
        ...filters,
        search: debouncedSearch,
        status: filterStatus === "all" ? null : filterStatus,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  const metrics: OrderMetrics | undefined = metricsQuery.data;
  const orders: AdminOrderRow[] = ordersQuery.data?.rows ?? [];
  const ordersTotal = ordersQuery.data?.total ?? 0;
  const isLoading = ordersQuery.isLoading;
  const metricsLoading = metricsQuery.isLoading;

  const loadError = (metricsQuery.error ?? ordersQuery.error) as Error | undefined;
  const errorMessage = loadError
    ? loadError instanceof AdminMetricsError
      ? loadError.message
      : `Erro ao carregar métricas: ${loadError.message}`
    : null;

  // Revalida o papel sempre que a permissão falhar — evita cache velho de cargos.
  useEffect(() => {
    if (loadError instanceof AdminMetricsError && loadError.kind !== "unknown") {
      clearRolesCache();
      isAdmin().then(setAdmin);
      isSuperAdmin().then(setSuperAdmin);
    }
  }, [loadError]);

  const stats = useMemo(
    () => ({
      ordersCount: metrics?.orders_count ?? 0,
      revenue: metrics?.revenue ?? 0,
      unitsSold: metrics?.units_sold ?? 0,
      avgTicket: metrics?.avg_ticket ?? 0,
      ranking: metrics?.product_ranking ?? [],
      categoryRanking: metrics?.category_ranking ?? [],
      byPayment: metrics?.by_payment ?? [],
      deliveryCount: metrics?.delivery_count ?? 0,
      pickupCount: metrics?.pickup_count ?? 0,
    }),
    [metrics],
  );

  const insight = useMemo(() => generateInsight(stats.ranking, stats.ordersCount, period), [stats, period]);

  const periodLabel = (() => {
    if (hasCustomRange) {
      const f = dateFrom ? new Date(dateFrom + "T00:00:00").toLocaleDateString("pt-BR") : "início";
      const t = dateTo ? new Date(dateTo + "T00:00:00").toLocaleDateString("pt-BR") : "hoje";
      return `${f} a ${t}`;
    }
    if (period === "day") return "Hoje";
    if (period === "week") return "Últimos 8 dias";
    if (period === "month") return "Últimos 30 dias";
    return "Todo o período";
  })();

  function buildFullReport(): string {
    const lines: string[] = [];
    lines.push(`📊 *RELATÓRIO SHOPBOX*`);
    lines.push(`🗓️ ${periodLabel}`);
    lines.push("");
    lines.push(`🧾 ${stats.ordersCount} pedidos · 📦 ${stats.unitsSold} itens · 💰 ${brl(stats.revenue)}`);
    lines.push(`🛵 Entrega: ${stats.deliveryCount} · 🏪 Retirada: ${stats.pickupCount}`);
    lines.push("");
    lines.push(`*VENDAS POR CATEGORIA*`);
    if (stats.categoryRanking.length === 0) {
      lines.push("— sem vendas no período —");
    } else {
      for (const c of stats.categoryRanking) {
        lines.push(`• ${c.name}: ${c.qty} un · ${brl(c.revenue)}`);
      }
    }
    lines.push("");
    lines.push(`*ITENS VENDIDOS*`);
    if (stats.ranking.length === 0) {
      lines.push("— nenhum item vendido —");
    } else {
      for (const r of stats.ranking) {
        lines.push(`• ${r.name} — ${r.qty}x · ${brl(r.revenue)}`);
      }
    }
    return lines.join("\n");
  }

  /**
   * Relatório por categoria: agregado NO BANCO (RPC), sem teto de 1000 linhas.
   * Quando a categoria pedida é a mesma do filtro atual, reutiliza as métricas já carregadas.
   */
  async function shareCategoryReport(catName?: string) {
    const cat = catName ?? filterCategory;
    let m = metrics;
    if (catName && catName !== filterCategory) {
      try {
        m = await fetchOrderMetrics({ ...filters, category: cat });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao gerar relatório");
        return;
      }
    }
    const lines: string[] = [];
    lines.push(`📊 *RELATÓRIO · ${cat.toUpperCase()}*`);
    lines.push(`🗓️ ${periodLabel}`);
    lines.push("");
    lines.push(`🧾 ${m?.orders_count ?? 0} pedidos · 📦 ${m?.units_sold ?? 0} itens · 💰 ${brl(m?.revenue ?? 0)}`);
    lines.push("");
    lines.push(`*ITENS VENDIDOS · ${cat.toUpperCase()}*`);
    const rank = m?.product_ranking ?? [];
    if (rank.length === 0) {
      lines.push("— nenhum item vendido —");
    } else {
      for (const r of rank) lines.push(`• ${r.name} — ${r.qty}x · ${brl(r.revenue)}`);
    }
    await shareReport(lines.join("\n"), `Relatório · ${cat} · ${periodLabel}`);
  }


  async function shareReport(text: string, title: string) {
    const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
    if (nav?.share) {
      try { await nav.share({ title, text }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Relatório copiado");
    } catch {}
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function deleteOrder(target: OrderRow) {
    setBusy(true);
    try {
      const { error: e1 } = await supabase.from("order_items").delete().eq("order_id", target.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("orders").delete().eq("id", target.id);
      if (e2) throw e2;
      await logAudit({
        action: "order.delete",
        entity: "order",
        entity_id: target.id,
        details: {
          customer_name: target.customer_name,
          total: target.total,
          status: target.status,
          payment_method: target.payment_method,
        },
      });
      toast.success("Pedido excluído");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "erro";
      toast.error("Falha ao excluir: " + msg);
    } finally {
      setBusy(false);
    }
  }

  function toggleReveal(key: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function wipeAll() {
    if (wipeConfirm !== "EXCLUIR TUDO") {
      toast.error('Digite "EXCLUIR TUDO" para confirmar');
      return;
    }
    setBusy(true);
    try {
      const { error: e1 } = await supabase.from("order_items").delete().not("id", "is", null);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("orders").delete().not("id", "is", null);
      if (e2) throw e2;
      await logAudit({ action: "orders.wipe_all", entity: "orders", entity_id: null });
      toast.success("Todos os pedidos foram excluídos");
      setWipeOpen(false);
      setWipeConfirm("");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (err: any) {
      toast.error("Falha ao limpar: " + (err?.message ?? "erro"));
    } finally {
      setBusy(false);
    }
  }

  if (admin === null) {
    return <Shell><div className="flex-1 flex items-center justify-center">Carregando...</div></Shell>;
  }
  if (!admin) {
    return <Shell><div className="flex-1 flex items-center justify-center p-6 text-center text-muted-foreground">Acesso restrito a administradores.</div></Shell>;
  }

  return (
    <Shell>
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao admin
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-accent font-bold">Painel</div>
              <h1 className="display text-3xl md:text-4xl">Pedidos & Relatórios</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex bg-secondary rounded-md p-1">
                {(["day", "week", "month", "all"] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPeriod(p); setDateFrom(""); setDateTo(""); }}
                    className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${period === p && !hasCustomRange ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {p === "day" ? "Hoje" : p === "week" ? "8 dias" : p === "month" ? "30 dias" : "Tudo"}
                  </button>
                ))}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-auto justify-start text-left font-normal gap-2 text-xs", !hasCustomRange && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {hasCustomRange ? (
                      <span>
                        {dateFrom ? new Date(dateFrom + "T00:00:00").toLocaleDateString("pt-BR") : "início"}
                        {" até "}
                        {dateTo ? new Date(dateTo + "T00:00:00").toLocaleDateString("pt-BR") : "hoje"}
                      </span>
                    ) : (
                      <span>Selecionar datas</span>
                    )}
                    {hasCustomRange && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDateFrom(""); setDateTo(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); setDateFrom(""); setDateTo(""); } }}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        title="Limpar datas"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    selected={{
                      from: dateFrom ? new Date(dateFrom + "T00:00:00") : undefined,
                      to: dateTo ? new Date(dateTo + "T00:00:00") : undefined,
                    } as DateRange}
                    onSelect={(range: DateRange | undefined) => {
                      const fmt = (d?: Date) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
                      setDateFrom(fmt(range?.from));
                      setDateTo(fmt(range?.to));
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={<ShoppingBag className="h-5 w-5" />} label="Pedidos" value={String(stats.ordersCount)} />
          <Kpi icon={<DollarSign className="h-5 w-5" />} label="Receita" value={brl(stats.revenue)} accent />
          <Kpi icon={<Package className="h-5 w-5" />} label="Itens vendidos" value={String(stats.unitsSold)} />
          <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Ticket médio" value={brl(stats.avgTicket)} />
        </div>

        {/* Valor do catálogo publicado no site */}
        <CatalogValueCard />


        {/* Caixa QR — métricas separadas (balcão, fora do fluxo da loja online) */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="bg-primary text-primary-foreground rounded-md p-2">
                <QrCode className="h-4 w-4" />
              </div>
              <div>
                <h3 className="display text-lg leading-tight">Caixa QR (balcão)</h3>
                <p className="text-[11px] text-muted-foreground">
                  Vendas provisórias pelo QR no balcão. Independentes da loja online.
                </p>
              </div>
            </div>
            <Link
              to="/admin/caixa-qr"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider border border-border rounded-md px-3 py-1.5 hover:border-primary"
            >
              Abrir Caixa QR
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={<DollarSign className="h-5 w-5" />}
              label="Caixa hoje"
              value={brl(posMetrics.data?.paidToday.total ?? 0)}
              accent
            />
            <Kpi
              icon={<ShoppingBag className="h-5 w-5" />}
              label="Vendas hoje"
              value={String(posMetrics.data?.paidToday.count ?? 0)}
            />
            <Kpi
              icon={<TrendingUp className="h-5 w-5" />}
              label="Caixa 8 dias"
              value={brl(posMetrics.data?.paid8Days.total ?? 0)}
            />
            <Kpi
              icon={<Package className="h-5 w-5" />}
              label="Vendas 8 dias"
              value={String(posMetrics.data?.paid8Days.count ?? 0)}
            />
          </div>
          {(posMetrics.data?.pending8Days ?? 0) > 0 && (
            <p className="text-[11px] text-muted-foreground mt-3">
              {posMetrics.data?.pending8Days} cobrança(s) do caixa aguardando pagamento nos últimos 8 dias.
            </p>
          )}
        </div>


        {/* Insight */}
        <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border border-primary/40 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <div className="bg-primary text-primary-foreground rounded-md p-2 flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="display text-xl mb-1">Relatório inteligente</h2>
              <p className="text-sm whitespace-pre-line text-foreground/90">{insight}</p>
            </div>
          </div>
        </div>

        <div className={`grid gap-6 ${filterCategory !== "all" ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {/* Top products — só aparece quando uma categoria é selecionada */}
          {filterCategory !== "all" && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-secondary flex items-start justify-between gap-2">
                <div>
                  <h2 className="display text-lg">Vendidos · {filterCategory}</h2>
                  <p className="text-xs text-muted-foreground">{stats.unitsSold} itens · {brl(stats.revenue)} · {periodLabel}</p>
                </div>
                <button
                  onClick={() => shareCategoryReport()}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90"
                  title="Exportar relatório desta categoria"
                >
                  <Share2 className="h-3.5 w-3.5" /> WhatsApp
                </button>
              </div>
              {metricsLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
              ) : stats.ranking.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">Nenhum produto vendido nesta categoria.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr><th className="p-3">#</th><th className="p-3">Produto</th><th className="p-3 text-right">Qtd</th><th className="p-3 text-right">Receita</th></tr>
                  </thead>
                  <tbody>
                    {stats.ranking.map((r, i) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-3 font-bold text-muted-foreground">{i + 1}</td>
                        <td className="p-3">{r.name}</td>
                        <td className="p-3 text-right font-bold">{r.qty}</td>
                        <td className="p-3 text-right text-price font-bold">{brl(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Delivery split */}
          <div className="bg-card border border-border rounded-lg p-5 space-y-3">
            <h2 className="display text-lg">Entrega vs Retirada</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary rounded-md p-4">
                <div className="flex items-center gap-2 text-sm font-bold"><Truck className="h-4 w-4" /> Entrega</div>
                <div className="display text-3xl mt-1">{stats.deliveryCount}</div>
              </div>
              <div className="bg-secondary rounded-md p-4">
                <div className="flex items-center gap-2 text-sm font-bold"><Store className="h-4 w-4" /> Retirada</div>
                <div className="display text-3xl mt-1">{stats.pickupCount}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.ordersCount === 0
                ? "Sem pedidos pagos no período."
                : `${Math.round((stats.deliveryCount / Math.max(1, stats.ordersCount)) * 100)}% dos pedidos pedem entrega.`}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="bg-card border border-border rounded-lg overflow-hidden lg:col-span-2">
          <div className="px-4 py-3 border-b border-border bg-secondary flex items-start justify-between gap-2">
            <div>
              <h2 className="display text-lg">Vendas por categoria</h2>
              <p className="text-xs text-muted-foreground">
                {filterCategory === "all"
                  ? "Selecione uma categoria abaixo (filtro) para ver os produtos vendidos dela."
                  : `Filtrando por: ${filterCategory}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={downloadCustomersCsv}
                disabled={exportingCustomers}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-accent text-accent-foreground px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-60"
                title="Baixar lista atualizada de clientes (nome, email, WhatsApp) em CSV"
              >
                <Download className="h-3.5 w-3.5" />
                {exportingCustomers ? "Gerando..." : "Baixar clientes · CSV"}
              </button>
              <button
                onClick={() => shareReport(buildFullReport(), "Relatório Shopbox")}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90"
                title="Exportar relatório completo para WhatsApp"
              >
                <Share2 className="h-3.5 w-3.5" /> Relatório completo · WhatsApp
              </button>
            </div>

          </div>
          {metricsLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : stats.categoryRanking.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Sem vendas no período.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="p-3">Categoria</th><th className="p-3 text-right">Itens</th><th className="p-3 text-right">Receita</th><th className="p-3 text-right">% Receita</th><th className="p-3 text-right">Ação</th></tr>
              </thead>
              <tbody>
                {stats.categoryRanking.map((c) => {
                  const totalRev = stats.categoryRanking.reduce((s, x) => s + x.revenue, 0);
                  const pct = totalRev > 0 ? Math.round((c.revenue / totalRev) * 100) : 0;
                  return (
                    <tr key={c.name} className="border-t border-border">
                      <td className="p-3 font-semibold">{c.name}</td>
                      <td className="p-3 text-right font-bold">{c.qty}</td>
                      <td className="p-3 text-right text-price font-bold">{brl(c.revenue)}</td>
                      <td className="p-3 text-right text-muted-foreground">{pct}%</td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-3 justify-end">
                          <button
                            onClick={() => { setFilterCategory(c.name); setShowFilters(true); }}
                            className="text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
                            title="Ver produtos desta categoria"
                          >
                            Ver itens
                          </button>
                          <button
                            onClick={() => shareCategoryReport(c.name)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90"
                            title={`Exportar relatório de ${c.name} (${periodLabel}) para WhatsApp`}
                          >
                            <Share2 className="h-3 w-3" /> WhatsApp
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        </div>



        {/* Orders list */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="display text-lg">Pedidos</h2>
              <span className="text-xs text-muted-foreground">{ordersTotal} no período{ordersTotal > PAGE_SIZE ? ` · página ${page + 1} de ${Math.ceil(ordersTotal / PAGE_SIZE)}` : ""}</span>
            </div>

            {/* Search & Filters */}
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <div className="relative min-w-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={searchCpf}
                    onChange={(e) => setSearchCpf(e.target.value)}
                    placeholder="Buscar por nome, e-mail, telefone, CPF ou nº do pedido..."
                    className="w-full pl-9 pr-8 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {searchCpf && (
                    <button
                      onClick={() => setSearchCpf("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowFilters((s) => !s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded border text-xs font-bold uppercase tracking-wider shrink-0 ${showFilters ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}
                >
                  <Filter className="h-3.5 w-3.5" /> Filtros
                </button>
              </div>

              {searchCpf.trim() && (
                <div className="text-[11px] text-accent font-bold uppercase tracking-wider">
                  Buscando em todos os pedidos (período ignorado)
                </div>
              )}

              {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <select
                    value={filterDelivery}
                    onChange={(e) => setFilterDelivery(e.target.value as any)}
                    className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">Todos os tipos de entrega</option>
                    <option value="delivery">Entrega</option>
                    <option value="pickup">Retirada</option>
                  </select>
                  <select
                    value={filterPayment}
                    onChange={(e) => setFilterPayment(e.target.value as any)}
                    className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">Todos os pagamentos</option>
                    <option value="pix">Pix</option>
                    <option value="card">Cartão</option>
                  </select>
                  <div className="flex flex-wrap gap-1.5 col-span-1 sm:col-span-2 lg:col-span-4">
                    {STATUS_FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFilterStatus(opt.value)}
                        className={`min-h-9 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider shrink-0 ${
                          filterStatus === opt.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">Todas as categorias</option>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : orders.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {searchCpf || filterDelivery !== "all" || filterPayment !== "all" || filterStatus !== "paid"
                ? "Nenhum pedido encontrado com os filtros aplicados."
                : "Nenhum pedido neste período."}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3">Pedido</th>
                      <th className="p-3">Data</th>
                      <th className="p-3">Cliente</th>
                      <th className="p-3">CPF</th>
                      <th className="p-3">Contato</th>
                      <th className="p-3">Entrega</th>
                      <th className="p-3">Pagamento</th>
                      <th className="p-3 text-right">Total</th>
                      {superAdmin && <th className="p-3 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-t border-border hover:bg-secondary/40">
                        <td className="p-3 font-mono text-xs">
                          <Link to="/pedido/$id" params={{ id: o.id }} className="text-primary hover:underline">
                            {o.id.slice(0, 8).toUpperCase()}
                          </Link>
                        </td>
                        <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                        <td className="p-3">{o.customer_name}</td>
                        <td className="p-3 text-xs font-mono">
                          <RevealField
                            value={o.customer_cpf}
                            reveal={revealed.has(`cpf:${o.id}`)}
                            onToggle={() => toggleReveal(`cpf:${o.id}`)}
                            masked={maskCpf(o.customer_cpf)}
                            full={formatCpfFull(o.customer_cpf)}
                          />
                        </td>
                        <td className="p-3 text-xs">
                          {o.customer_phone && (
                            <RevealField
                              value={o.customer_phone}
                              reveal={revealed.has(`ph:${o.id}`)}
                              onToggle={() => toggleReveal(`ph:${o.id}`)}
                              masked={maskPhone(o.customer_phone)}
                              full={formatPhoneFull(o.customer_phone)}
                            />
                          )}
                          {o.customer_email && (
                            <RevealField
                              className="text-muted-foreground"
                              value={o.customer_email}
                              reveal={revealed.has(`em:${o.id}`)}
                              onToggle={() => toggleReveal(`em:${o.id}`)}
                              masked={maskEmail(o.customer_email)}
                              full={o.customer_email}
                            />
                          )}
                        </td>
                        <td className="p-3 text-xs uppercase">
                          <span className={`px-2 py-0.5 rounded font-bold ${o.delivery_method === "pickup" ? "bg-accent/20 text-accent" : "bg-primary/15 text-primary"}`}>
                            {o.delivery_method === "pickup" ? "Retirada" : "Entrega"}
                          </span>
                        </td>
                        <td className="p-3 text-xs uppercase">{o.payment_method}</td>
                        <td className="p-3 text-right font-bold text-price">{brl(Number(o.total))}</td>
                        {superAdmin && (
                          <td className="p-3 text-right whitespace-nowrap">
                            {o.status === "paid" && o.mp_payment_id && !o.refund_status && (
                              <button
                                onClick={() => setRefundTarget(o)}
                                disabled={busy}
                                title="Estornar via Mercado Pago"
                                className="min-h-9 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 px-2 py-1 rounded disabled:opacity-50 mr-1"
                              >
                                <Undo2 className="h-3.5 w-3.5" /> Estornar
                              </button>
                            )}
                            {o.refund_status && (
                              <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mr-1 ${refundBadgeClass(o.refund_status)}`}>
                                {refundLabel(o.refund_status)}
                              </span>
                            )}

                            <button
                              onClick={() => setDeleteTarget(o)}
                              disabled={busy}
                              title="Excluir pedido (Super Admin)"
                              className="min-h-9 inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-destructive-foreground bg-destructive hover:opacity-90 px-2 py-1 rounded disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Excluir
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>


              {/* Mobile cards */}
              <ul className="md:hidden divide-y divide-border">
                {orders.map((o) => (
                  <li key={o.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link to="/pedido/$id" params={{ id: o.id }} className="font-mono text-xs text-primary font-bold">
                        #{o.id.slice(0, 8).toUpperCase()}
                      </Link>
                      <span className="font-black text-price text-base">{brl(Number(o.total))}</span>
                    </div>
                    <div className="text-sm font-semibold break-words">{o.customer_name}</div>
                    {o.customer_cpf && (
                      <div className="text-[11px] font-mono text-muted-foreground">
                        CPF:{" "}
                        <RevealField
                          value={o.customer_cpf}
                          reveal={revealed.has(`cpf:${o.id}`)}
                          onToggle={() => toggleReveal(`cpf:${o.id}`)}
                          masked={maskCpf(o.customer_cpf)}
                          full={formatCpfFull(o.customer_cpf)}
                          inline
                        />
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {o.customer_phone && (
                        <div>
                          📱{" "}
                          <RevealField
                            value={o.customer_phone}
                            reveal={revealed.has(`ph:${o.id}`)}
                            onToggle={() => toggleReveal(`ph:${o.id}`)}
                            masked={maskPhone(o.customer_phone)}
                            full={formatPhoneFull(o.customer_phone)}
                            inline
                          />
                        </div>
                      )}
                      {o.customer_email && (
                        <div className="break-all">
                          ✉️{" "}
                          <RevealField
                            value={o.customer_email}
                            reveal={revealed.has(`em:${o.id}`)}
                            onToggle={() => toggleReveal(`em:${o.id}`)}
                            masked={maskEmail(o.customer_email)}
                            full={o.customer_email}
                            inline
                          />
                        </div>
                      )}
                      <div>🕒 {new Date(o.created_at).toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${o.delivery_method === "pickup" ? "bg-accent/20 text-accent" : "bg-primary/15 text-primary"}`}>
                        {o.delivery_method === "pickup" ? "Retirada" : "Entrega"}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-secondary">{o.payment_method}</span>
                      {o.refund_status && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${refundBadgeClass(o.refund_status)}`}>
                          {refundLabel(o.refund_status)}
                        </span>
                      )}

                      {superAdmin && o.status === "paid" && o.mp_payment_id && !o.refund_status && (
                        <button
                          onClick={() => setRefundTarget(o)}
                          disabled={busy}
                          className="min-h-11 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 border border-amber-500/40 px-3 py-2 rounded disabled:opacity-50"
                        >
                          <Undo2 className="h-3 w-3" /> Estornar
                        </button>
                      )}
                      {superAdmin && o.status === "paid" && !o.refund_status && (
                        <button
                          onClick={() => setVoucherTarget(o)}
                          disabled={busy}
                          className="min-h-11 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-3 py-2 rounded disabled:opacity-50"
                        >
                          <Gift className="h-3 w-3" /> Vale-Troca
                        </button>
                      )}
                      {superAdmin && (
                        <button
                          onClick={() => setDeleteTarget(o)}
                          disabled={busy}
                          className="min-h-11 ml-auto inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider bg-destructive text-destructive-foreground px-3 py-2 rounded disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" /> Excluir
                        </button>
                      )}
                    </div>

                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Danger zone */}
        {superAdmin && (
          <div className="border-2 border-destructive/40 rounded-lg p-5 bg-destructive/5">
            <div className="flex items-start gap-3">
              <div className="bg-destructive text-destructive-foreground rounded-md p-2 flex-shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="display text-xl mb-1 text-destructive">Zona de perigo</h2>
                <p className="text-sm text-muted-foreground mb-3">
                  Apaga TODOS os pedidos e itens da base. As métricas serão zeradas. Não pode ser desfeito.
                </p>
                {!wipeOpen ? (
                  <button
                    onClick={() => setWipeOpen(true)}
                    className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground font-bold uppercase tracking-wider text-xs px-4 py-2 rounded hover:opacity-90"
                  >
                    <Trash2 className="h-4 w-4" /> Limpar todos os pedidos
                  </button>
                ) : (
                  <div className="space-y-2 max-w-md">
                    <label className="text-xs font-bold uppercase tracking-wider text-destructive">
                      Digite <span className="font-mono">EXCLUIR TUDO</span> para confirmar:
                    </label>
                    <input
                      type="text"
                      value={wipeConfirm}
                      onChange={(e) => setWipeConfirm(e.target.value)}
                      placeholder="EXCLUIR TUDO"
                      className="w-full px-3 py-2 rounded border border-destructive/40 bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={wipeAll}
                        disabled={busy || wipeConfirm !== "EXCLUIR TUDO"}
                        className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground font-bold uppercase tracking-wider text-xs px-4 py-2 rounded hover:opacity-90 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" /> Confirmar exclusão total
                      </button>
                      <button
                        onClick={() => { setWipeOpen(false); setWipeConfirm(""); }}
                        disabled={busy}
                        className="text-xs font-bold uppercase tracking-wider px-4 py-2 rounded border border-border hover:bg-secondary"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
      {refundTarget && (
        <RefundModal
          orderId={refundTarget.id}
          busy={busy}
          onClose={() => setRefundTarget(null)}
          onConfirm={async (payload) => {
            setBusy(true);
            try {
              const res = await refundFn({ data: { orderId: refundTarget.id, ...payload } });
              if ((res as any).queued) {
                toast.info((res as any).message ?? "Reembolso enfileirado — tentaremos automaticamente a cada 24h");
              } else {
                toast.success((res.full ? "Reembolso total efetuado" : `Reembolso parcial de ${brl(res.amount)} efetuado`) + " · pedido removido");
                if (res.receipt) {
                  const { printRefundReceipt } = await import("@/lib/refundReceipt");
                  printRefundReceipt(res.receipt);
                }
              }
              setRefundTarget(null);
              qc.invalidateQueries({ queryKey: ["admin-orders"] });
            } catch (err: any) {
              toast.error(err?.message ?? "Falha no estorno");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {voucherTarget && (
        <ExchangeVoucherModal
          orderId={voucherTarget.id}
          busy={busy}
          onClose={() => setVoucherTarget(null)}
          onConfirm={async (payload) => {
            setBusy(true);
            try {
              const res = await voucherFn({ data: { orderId: voucherTarget.id, ...payload } });
              toast.success(`Vale-troca de ${brl(res.amount)} emitido · cliente já pode usar como cashback`);
              if (res.receipt) {
                const { printVoucherReceipt } = await import("@/lib/voucherReceipt");
                printVoucherReceipt(res.receipt);
              }
              setVoucherTarget(null);
              qc.invalidateQueries({ queryKey: ["admin-orders"] });
              qc.invalidateQueries({ queryKey: ["admin-exchange-vouchers"] });
            } catch (err: any) {
              toast.error(err?.message ?? "Falha ao emitir vale-troca");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {deleteTarget && (
        <DeleteOrderDialog
          orderId={deleteTarget.id}
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteOrder(deleteTarget)}
        />
      )}
    </Shell>
  );
}

function RevealField({
  value,
  masked,
  full,
  reveal,
  onToggle,
  className,
  inline,
}: {
  value: string | null | undefined;
  masked: string;
  full: string;
  reveal: boolean;
  onToggle: () => void;
  className?: string;
  inline?: boolean;
}) {
  if (!value) return <span className={className}>—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className={inline ? "" : "select-all"}>{reveal ? full : masked}</span>
      <button
        type="button"
        onClick={onToggle}
        title={reveal ? "Ocultar" : "Revelar"}
        aria-label={reveal ? "Ocultar dado" : "Revelar dado"}
        className="text-muted-foreground hover:text-foreground p-0.5 rounded"
      >
        {reveal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </button>
    </span>
  );
}


function generateInsight(
  ranking: { name: string; qty: number; revenue: number }[],
  orderCount: number,
  period: Period,
): string {
  if (ranking.length === 0) {
    return "Ainda não há vendas no período. Compartilhe seus produtos para começar a gerar relatórios inteligentes.";
  }
  const periodLabel = period === "day" ? "hoje" : period === "week" ? "nos últimos 8 dias" : period === "month" ? "nos últimos 30 dias" : "no histórico completo";
  const top = ranking[0];
  const totalQty = ranking.reduce((s, r) => s + r.qty, 0);
  const topShare = Math.round((top.qty / totalQty) * 100);
  const totalRev = ranking.reduce((s, r) => s + r.revenue, 0);
  const topRevShare = Math.round((top.revenue / totalRev) * 100);

  const parts: string[] = [];
  parts.push(`🏆 Campeão de vendas ${periodLabel}: "${top.name}" (${top.qty} ${top.qty === 1 ? "unidade" : "unidades"}, ${topShare}% do volume e ${topRevShare}% da receita).`);

  if (ranking.length >= 2) {
    const runner = ranking[1];
    parts.push(`🥈 Em segundo: "${runner.name}" com ${runner.qty} vendido(s).`);
  }

  if (topShare >= 60) {
    parts.push(`⚠️ Sua receita está concentrada em um único produto — reforce o estoque de "${top.name}" e considere destacar produtos complementares para diversificar.`);
  } else if (ranking.length >= 3) {
    parts.push(`✅ Mix saudável: os 3 mais vendidos somam ${Math.round(((ranking[0].qty + ranking[1].qty + ranking[2].qty) / totalQty) * 100)}% do volume.`);
  }

  const avgPerOrder = totalQty / Math.max(1, orderCount);
  parts.push(`🛒 Média de ${avgPerOrder.toFixed(1)} ${avgPerOrder >= 2 ? "itens" : "item"} por pedido em ${orderCount} ${orderCount === 1 ? "pedido" : "pedidos"}.`);

  const slow = ranking[ranking.length - 1];
  if (ranking.length >= 4 && slow.qty <= 1) {
    parts.push(`💡 "${slow.name}" teve baixa saída — considere promoção ou combinar com o campeão.`);
  }

  return parts.join("\n");
}


function CatalogValueCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-value"],
    queryFn: async () => {
      // Pagina para além do limite implícito de 1000 do PostgREST
      const PAGE = 1000;
      let totalRetail = 0;
      let totalOriginal = 0;
      let totalUnits = 0;
      let activeCount = 0;
      let outOfStockCount = 0;
      for (let from = 0; ; from += PAGE) {
        const { data: rows, error } = await supabase
          .from("products")
          .select("price, original_price, stock")
          .eq("active", true)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const list = rows ?? [];
        for (const r of list) {
          const price = Number(r.price ?? 0);
          const original = Number(r.original_price ?? price);
          const stock = Number(r.stock ?? 0);
          activeCount += 1;
          if (stock <= 0) outOfStockCount += 1;
          totalUnits += Math.max(0, stock);
          totalRetail += price * Math.max(0, stock);
          totalOriginal += original * Math.max(0, stock);
        }
        if (list.length < PAGE) break;
      }
      return { totalRetail, totalOriginal, totalUnits, activeCount, outOfStockCount };
    },
    staleTime: 5 * 60_000,
  });

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-primary text-primary-foreground rounded-md p-2">
          <Package className="h-4 w-4" />
        </div>
        <div>
          <h3 className="display text-lg leading-tight">Valor do catálogo publicado</h3>
          <p className="text-[11px] text-muted-foreground">
            Soma de preço × estoque de todos os produtos ativos no site. Independe de vendas.
          </p>
        </div>
      </div>
      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">Calculando…</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={<DollarSign className="h-5 w-5" />} label="Valor total (venda)" value={brl(data.totalRetail)} accent />
          <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Valor s/ desconto" value={brl(data.totalOriginal)} />
          <Kpi icon={<Package className="h-5 w-5" />} label="Unidades em estoque" value={String(data.totalUnits)} />
          <Kpi icon={<ShoppingBag className="h-5 w-5" />} label="Produtos ativos" value={`${data.activeCount}${data.outOfStockCount ? ` · ${data.outOfStockCount} s/ estoque` : ""}`} />
        </div>
      )}
    </div>
  );
}



function Kpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "bg-primary/10 border-primary/40" : "bg-card border-border"}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-bold">
        {icon} {label}
      </div>
      <div className={`display text-2xl mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {children}
      <Footer />
    </div>
  );
}

function refundLabel(s: string): string {
  switch (s) {
    case "refunded": return "Reembolsado";
    case "queued": return "Reemb. na fila";
    case "processing": return "Reemb. em andamento";
    case "refund_failed": return "Reemb. falhou";
    case "partial": return "Reemb. parcial";
    default: return "Reemb. parcial";
  }
}
function refundBadgeClass(s: string): string {
  switch (s) {
    case "refunded": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "queued":
    case "processing": return "bg-sky-500/15 text-sky-700 dark:text-sky-400";
    case "refund_failed": return "bg-destructive/15 text-destructive";
    default: return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  }
}
