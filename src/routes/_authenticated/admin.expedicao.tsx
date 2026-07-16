import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Store, Printer, Package, CheckCircle2, Clock, AlertTriangle, Filter, RotateCcw, CheckCheck, ScanLine, BellRing, Truck, Search, X, Undo2, XCircle, Hourglass, Gift, Copy, Check, QrCode } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { RefundModal } from "@/components/RefundModal";
import { ExchangeVoucherModal } from "@/components/ExchangeVoucherModal";
import { supabase } from "@/integrations/supabase/client";
import { hasAnyRole, isSuperAdmin } from "@/lib/products";
import { brl } from "@/lib/format";
import { refundOrder, listCieloRefundQueue, retryCieloRefundNow, type CieloRefundQueueRow } from "@/lib/refunds.functions";
import { createExchangeVoucher } from "@/lib/exchange-vouchers.functions";
import { printVoucherReceipt } from "@/lib/voucherReceipt";
import { openWhatsApp, orderReminderMessage } from "@/lib/whatsapp";
import { dispatchDelivery } from "@/lib/maisentregas.functions";

export const Route = createFileRoute("/_authenticated/admin/expedicao")({
  head: () => ({ meta: [{ title: "Expedição · Admin" }] }),
  component: FulfillmentPage,
});

type OrderRow = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_cpf?: string | null;
  shipping_address: string | null;
  shipping_zip: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  delivery_method: string;
  payment_method: string;
  status: string;
  fulfillment_status: string;
  total: number;
  mp_payment_id?: string | null;
  refund_status?: string | null;
  label_status?: string | null;
  label_generated_at?: string | null;
  label_generated_by_name?: string | null;
  label_printed_at?: string | null;
  label_printed_by_name?: string | null;
  maisentregas_order_id?: string | null;
  maisentregas_status?: string | null;
  delivered_at?: string | null;
};

type ItemRow = {
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  product_id?: string | null;
  sku?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  preparing: "Em preparo",
  ready: "Pronto",
  shipped: "Enviado",
  completed: "Concluído",
};

function nextStatus(current: string, delivery: string): string {
  const flow = delivery === "pickup"
    ? ["pending", "preparing", "ready", "completed"]
    : ["pending", "preparing", "ready", "shipped", "completed"];
  const i = flow.indexOf(current);
  if (i < 0 || i >= flow.length - 1) return current;
  return flow[i + 1];
}

function hoursSince(iso?: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function isDelayed(o: OrderRow) {
  if (o.fulfillment_status === "completed") return false;
  // Considera atrasado apenas após 5 dias (120h) desde a criação do pedido.
  const FIVE_DAYS_HOURS = 24 * 5;
  if (hoursSince(o.created_at) > FIVE_DAYS_HOURS) return true;
  return false;
}

const REFUND_PENDING_STATUSES = ["queued", "processing", "refund_failed"];
function isRefundPending(o: Pick<OrderRow, "refund_status">) {
  return !!o.refund_status && REFUND_PENDING_STATUSES.includes(o.refund_status);
}

function filterFulfillmentOrders(orders: OrderRow[], tab: "separation" | "pickup" | "delivery" | "done" | "notifications" | "refunds", labelFilter: "all" | "none" | "generated" | "printed") {
  let list = orders.filter((o) => {
    if (tab === "refunds") return isRefundPending(o);
    // Pedidos em fila de reembolso saem das abas de expedição normais
    if (isRefundPending(o)) return false;
    if (tab === "done") return o.fulfillment_status === "completed";
    if (tab === "separation") return o.fulfillment_status === "pending" || o.fulfillment_status === "preparing";
    if (tab === "pickup") return o.delivery_method === "pickup" && o.fulfillment_status !== "completed";
    if (tab === "delivery") return o.delivery_method === "delivery" && o.fulfillment_status !== "completed";
    return false;
  });
  if (labelFilter !== "all") {
    list = list.filter((o) => {
      if (labelFilter === "none") return !o.label_status;
      if (labelFilter === "generated") return o.label_status === "generated";
      if (labelFilter === "printed") return o.label_status === "printed";
      return true;
    });
  }
  return list;
}

function barcodeValue(id: string) {
  return id.replace(/-/g, "").slice(0, 12).toLowerCase();
}

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

async function attachSkus(rawItems: ItemRow[]) {
  const productIds = [...new Set(rawItems.map((i) => i.product_id).filter((x): x is string => typeof x === "string"))];
  const skuMap = new Map<string, string>();
  for (const productChunk of chunkArray(productIds, 80)) {
    const { data: prods, error } = await supabase.from("products").select("id, sku").in("id", productChunk);
    if (error) throw error;
    for (const p of (prods ?? []) as Array<{ id: string; sku: string }>) {
      skuMap.set(p.id, p.sku);
    }
  }
  return rawItems.map((i) => ({ ...i, sku: i.product_id ? skuMap.get(i.product_id) ?? null : null }));
}

async function fetchOrderItems(orderIds: string[]) {
  const rawItems: ItemRow[] = [];
  for (const idChunk of chunkArray(orderIds, 60)) {
    const { data: it, error } = await supabase
      .from("order_items")
      .select("order_id, product_name, quantity, unit_price, product_id")
      .in("order_id", idChunk);
    if (error) throw error;
    rawItems.push(...((it ?? []) as ItemRow[]));
  }
  return attachSkus(rawItems);
}

function FulfillmentPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [superAdmin, setSuperAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"separation" | "pickup" | "delivery" | "done" | "notifications" | "refunds">("separation");
  const [labelFilter, setLabelFilter] = useState<"all" | "none" | "generated" | "printed">("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [voucherTarget, setVoucherTarget] = useState<OrderRow | null>(null);
  const refundFn = useServerFn(refundOrder);
  const voucherFn = useServerFn(createExchangeVoucher);
  const searchActive = search.trim().length >= 2;
  const qc = useQueryClient();

  useEffect(() => {
    hasAnyRole(["admin", "manager", "fulfillment"]).then(setAllowed);
    isSuperAdmin().then(setSuperAdmin);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["fulfillment-orders", tab, labelFilter],
    enabled: allowed === true,
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "paid")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const orderList = (orders ?? []) as OrderRow[];
      const ids = filterFulfillmentOrders(orderList, tab, labelFilter).map((o) => o.id);
      let items: ItemRow[] = [];
      if (ids.length) {
        items = await fetchOrderItems(ids);
      }
      return { orders: orderList, items };
    },
  });

  // Pedidos não concluídos (pendentes/cancelados) que NÃO chegaram à expedição
  const { data: notifData } = useQuery({
    queryKey: ["fulfillment-notifications"],
    enabled: allowed === true,
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, created_at, customer_name, customer_email, customer_phone, payment_method, delivery_method, status, total, mp_payment_id, stock_restored_at, cancellation_reason")
        .in("status", ["pending", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      const list = (orders ?? []) as Array<{
        id: string; created_at: string; customer_name: string; customer_email: string | null;
        customer_phone: string | null; payment_method: string; delivery_method: string;
        status: string; total: number; mp_payment_id: string | null; stock_restored_at: string | null;
        cancellation_reason: string | null;
      }>;
      const ids = list.map((o) => o.id);
      const itemsByOrder = new Map<string, ItemRow[]>();
      if (ids.length) {
        const items = await fetchOrderItems(ids);
        for (const i of items) {
          const arr = itemsByOrder.get(i.order_id) ?? [];
          arr.push(i);
          itemsByOrder.set(i.order_id, arr);
        }
      }
      return { orders: list, itemsByOrder };
    },
    refetchInterval: 30000,
  });

  // Fila de reembolsos Cielo (para exibir status por pedido na aba Reembolsos)
  const fetchRefundQueue = useServerFn(listCieloRefundQueue);
  const retryRefundFn = useServerFn(retryCieloRefundNow);
  const { data: refundQueue } = useQuery({
    queryKey: ["cielo-refund-queue"],
    enabled: allowed === true && superAdmin === true,
    queryFn: () => fetchRefundQueue(),
    refetchInterval: 30000,
  });
  const refundQueueByOrder = useMemo(() => {
    const map = new Map<string, CieloRefundQueueRow>();
    for (const r of refundQueue ?? []) {
      const existing = map.get(r.order_id);
      // preferir o mais recente
      if (!existing || new Date(r.created_at).getTime() > new Date(existing.created_at).getTime()) {
        map.set(r.order_id, r);
      }
    }
    return map;
  }, [refundQueue]);

  // Busca global por nome ou CPF, independente de aba/data/status
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["fulfillment-search", search.trim()],
    enabled: allowed === true && searchActive,
    queryFn: async () => {
      const term = search.trim();
      const digits = term.replace(/\D/g, "");
      let q = supabase
        .from("orders")
        .select("*")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(100);
      if (digits.length >= 3) {
        q = q.or(`customer_name.ilike.%${term}%,customer_cpf.ilike.%${digits}%`);
      } else {
        q = q.ilike("customer_name", `%${term}%`);
      }
      const { data: orders, error } = await q;
      if (error) throw error;
      const ids = (orders ?? []).map((o) => o.id);
      let items: ItemRow[] = [];
      if (ids.length) {
        items = await fetchOrderItems(ids);
      }
      return { orders: (orders ?? []) as OrderRow[], items };
    },
  });

  // Atualização em tempo real: novos pedidos + mudanças
  useEffect(() => {
    if (allowed !== true) return;
    const channel = supabase
      .channel("expedicao-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
          qc.invalidateQueries({ queryKey: ["fulfillment-notifications"] });
          if (payload.eventType === "INSERT") {
            const row = payload.new as { customer_name?: string; delivery_method?: string };
            if (row.delivery_method === "pickup") {
              toast.success(`Novo pedido de ${row.customer_name ?? "cliente"}`);
            }
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [allowed, qc]);

  const dispatchFn = useServerFn(dispatchDelivery);
  const advance = async (o: OrderRow) => {
    const ns = nextStatus(o.fulfillment_status, o.delivery_method);
    if (ns === o.fulfillment_status) return;
    const { error } = await supabase.rpc("set_fulfillment_status" as never, { p_order_id: o.id, p_status: ns } as never);
    if (error) return toast.error(error.message);
    toast.success(`Status atualizado para "${STATUS_LABEL[ns]}"`);
    // Quando o pedido de entrega vira "Pronto", dispara a corrida na TBT Express.
    if (ns === "ready" && o.delivery_method === "delivery" && !o.maisentregas_order_id) {
      try {
        const r = await dispatchFn({ data: { orderId: o.id } });
        if (r?.ok) toast.success("Entrega enviada para a TBT Express.");
        else toast.error(`Não foi possível despachar a entrega: ${r?.reason ?? "erro"}`);
      } catch (e: any) {
        toast.error(e?.message || "Falha ao despachar entrega.");
      }
    }
    qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
  };

  const markDelivered = async (o: OrderRow) => {
    try {
      const { error } = await supabase.rpc("set_fulfillment_status" as never, { p_order_id: o.id, p_status: "completed" } as never);
      if (error) {
        console.error("[markDelivered] erro RPC:", error);
        return toast.error(error.message || "Não foi possível marcar como entregue. Atualize a página e tente novamente.");
      }
    } catch (e: any) {
      console.error("[markDelivered] exceção:", e);
      return toast.error(e?.message || "Falha ao atualizar o pedido.");
    }
    qc.setQueryData(["fulfillment-orders"], (prev: any) => {
      if (!prev?.orders) return prev;
      return { ...prev, orders: prev.orders.map((x: OrderRow) => x.id === o.id ? { ...x, fulfillment_status: "completed" } : x) };
    });
    toast.success("Pedido marcado como entregue.");
    qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
  };



  const itemsByOrder = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    const source = searchActive ? (searchData?.items ?? []) : (data?.items ?? []);
    for (const it of source) {
      const arr = map.get(it.order_id) ?? [];
      arr.push(it);
      map.set(it.order_id, arr);
    }
    return map;
  }, [data, searchData, searchActive]);

  const orders = useMemo(() => {
    if (searchActive) {
      return [...(searchData?.orders ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    let list = (data?.orders ?? []).filter((o) => {
      if (tab === "done") return o.fulfillment_status === "completed";
      if (tab === "separation") return o.fulfillment_status === "pending" || o.fulfillment_status === "preparing";
      if (tab === "pickup") return o.delivery_method === "pickup" && o.fulfillment_status !== "completed";
      if (tab === "delivery") return o.delivery_method === "delivery" && o.fulfillment_status !== "completed";
      return false;
    });
    list = filterFulfillmentOrders(data?.orders ?? [], tab, labelFilter);
    if (tab === "done") {
      return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list.sort((a, b) => {
      const da = isDelayed(a) ? -1 : 0;
      const db = isDelayed(b) ? -1 : 0;
      if (da !== db) return da - db;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [data, searchData, searchActive, tab, labelFilter]);

  if (allowed === null) {
    return <Shell><div className="flex-1 flex items-center justify-center">Carregando...</div></Shell>;
  }
  if (!allowed) {
    return <Shell><div className="flex-1 flex items-center justify-center p-6 text-muted-foreground">Acesso restrito à equipe de Expedição.</div></Shell>;
  }

  const delayedCount = orders.filter(isDelayed).length;

  return (
    <Shell>
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao admin
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-widest text-accent font-bold">Departamento</div>
              <h1 className="display text-3xl md:text-4xl">Expedição</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Separe os pedidos por <strong>Retirada na loja</strong> e <strong>Entrega motoboy</strong>. Escaneie a etiqueta para confirmar a entrega.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href="/etiqueta/qrcode"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-foreground text-background font-black uppercase tracking-widest text-xs px-4 py-2.5 rounded shadow hover:opacity-90"
                title="Imprimir etiqueta com QR Code da loja"
              >
                <QrCode className="h-4 w-4" strokeWidth={2.5} /> QR Code Loja
              </a>
              <a
                href="/etiqueta/fragil"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-[#E11D1D] text-white font-black uppercase tracking-widest text-xs px-4 py-2.5 rounded shadow hover:opacity-90"
                title="Imprimir etiqueta FRÁGIL para encomendas com vidro"
              >
                <AlertTriangle className="h-4 w-4" strokeWidth={3} /> Etiqueta Frágil
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 space-y-4">
        {/* Busca global por nome ou CPF */}
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido por nome do cliente ou CPF (qualquer data, status ou aba)..."
              className="w-full pl-10 pr-9 py-2.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchActive && (
            <div className="text-[11px] mt-2 text-accent font-bold uppercase tracking-wider">
              Buscando em todos os pedidos · {searchLoading ? "carregando…" : `${(searchData?.orders ?? []).length} encontrado(s)`}
            </div>
          )}
          {search.trim().length === 1 && (
            <div className="text-[11px] mt-2 text-muted-foreground">Digite ao menos 2 caracteres…</div>
          )}
        </div>

        {!searchActive && (tab === "pickup" || tab === "delivery") && (
          <ScannerPanel
            orders={(data?.orders ?? []).filter((o) => o.delivery_method === tab)}
            onDeliver={markDelivered}
            mode={tab}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-secondary rounded-md p-1">
            <TabBtn active={tab === "separation"} onClick={() => setTab("separation")} icon={<Hourglass className="h-4 w-4" />}>
              Em separação ({(data?.orders ?? []).filter((o) => o.fulfillment_status === "pending" || o.fulfillment_status === "preparing").length})
            </TabBtn>
            <TabBtn active={tab === "pickup"} onClick={() => setTab("pickup")} icon={<Store className="h-4 w-4" />}>
              Retirada ({(data?.orders ?? []).filter((o) => o.delivery_method === "pickup" && o.fulfillment_status !== "completed").length})
            </TabBtn>
            <TabBtn active={tab === "delivery"} onClick={() => setTab("delivery")} icon={<Truck className="h-4 w-4" />}>
              Entrega ({(data?.orders ?? []).filter((o) => o.delivery_method === "delivery" && o.fulfillment_status !== "completed").length})
            </TabBtn>
            <TabBtn active={tab === "done"} onClick={() => setTab("done")} icon={<CheckCircle2 className="h-4 w-4" />}>
              Entregues ({(data?.orders ?? []).filter((o) => o.fulfillment_status === "completed").length})
            </TabBtn>
            {superAdmin && (
              <TabBtn active={tab === "refunds"} onClick={() => setTab("refunds")} icon={<Undo2 className="h-4 w-4" />}>
                Reembolsos ({(data?.orders ?? []).filter(isRefundPending).length})
              </TabBtn>
            )}
            <TabBtn active={tab === "notifications"} onClick={() => setTab("notifications")} icon={<BellRing className="h-4 w-4" />}>
              Notificações ({(notifData?.orders ?? []).length})
            </TabBtn>
          </div>


          <div className="inline-flex items-center gap-1 bg-secondary rounded-md p-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground ml-2" />
            {(["all", "none", "generated", "printed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLabelFilter(f)}
                className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded ${
                  labelFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "Todas" : f === "none" ? "Não gerada" : f === "generated" ? "Gerada" : "Impressa"}
              </button>
            ))}
          </div>

          {delayedCount > 0 && (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-3 py-1.5 rounded-md">
              <AlertTriangle className="h-3.5 w-3.5" />
              {delayedCount} pedido{delayedCount > 1 ? "s" : ""} atrasado{delayedCount > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {!searchActive && tab === "notifications" ? (
          <NotificationsPanel rows={notifData?.orders ?? []} itemsByOrder={notifData?.itemsByOrder ?? new Map()} />
        ) : !searchActive && tab === "refunds" && superAdmin ? (
          <RefundsPanel
            orders={orders}
            queueByOrder={refundQueueByOrder}
            itemsByOrder={itemsByOrder}
            onRetry={async (queueId: string) => {
              try {
                await retryRefundFn({ data: { queueId } });
                toast.success("Tentativa disparada. Aguardando resultado…");
                qc.invalidateQueries({ queryKey: ["cielo-refund-queue"] });
                qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao retentar");
              }
            }}
          />
        ) : (searchActive ? searchLoading : isLoading) ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">Carregando...</div>
        ) : orders.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-primary" />
            {searchActive ? "Nenhum pedido encontrado para esta busca." : "Nenhum pedido em aberto nesta fila."}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {orders.map((o) => {
              const items = itemsByOrder.get(o.id) ?? [];
              const labelType = o.delivery_method === "pickup" ? "retirada" : "envio";
              const delayed = isDelayed(o);
              return (
                <article key={o.id} className={`bg-card border rounded-lg p-4 flex flex-col gap-3 ${delayed ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}>
                  <header className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</div>
                      <div className="font-bold">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("pt-BR")}
                      </div>
                      {o.fulfillment_status === "completed" && o.delivered_at && (
                        <div className="text-xs font-semibold text-[#25D366] inline-flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                          Entregue em {new Date(o.delivered_at).toLocaleString("pt-BR")}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {delayed && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-destructive text-destructive-foreground">
                          <AlertTriangle className="h-3 w-3" /> Atrasado
                        </span>
                      )}
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${
                        o.fulfillment_status === "pending" ? "bg-muted text-muted-foreground" :
                        o.fulfillment_status === "preparing" ? "bg-accent/20 text-accent" :
                        o.fulfillment_status === "ready" ? "bg-primary/20 text-primary" :
                        "bg-[#25D366]/20 text-[#25D366]"
                      }`}>
                        <Clock className="inline h-3 w-3 mr-1" />
                        {STATUS_LABEL[o.fulfillment_status] ?? o.fulfillment_status}
                      </span>
                    </div>
                  </header>

                  <div className="text-xs text-muted-foreground border-y border-border py-2 space-y-1">
                    {o.delivery_method === "delivery" ? (
                      <>
                        <div><strong className="text-foreground inline-flex items-center gap-1"><Truck className="h-3 w-3" /> Entrega motoboy:</strong> {o.shipping_address}</div>
                        {o.maisentregas_status && (
                          <div className="inline-flex items-center gap-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                            Mais Entregas: {o.maisentregas_status.replace(/_/g, " ")}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <strong className="text-foreground">Retirada na loja:</strong> aguardando cliente · {o.customer_phone}
                      </>
                    )}
                  </div>

                  <ul className="text-sm space-y-1">
                    {items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="whitespace-nowrap">{it.quantity}x</span>
                          {it.product_id ? (
                            <a
                              href={`/produto/${it.product_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate underline decoration-dotted hover:text-primary"
                              title="Abrir produto em nova aba (mostra mesmo se esgotado)"
                            >
                              {it.product_name}
                            </a>
                          ) : (
                            <span className="truncate">{it.product_name}</span>
                          )}
                          {it.sku && <SkuChip sku={it.sku} />}
                        </span>
                        <span className="font-semibold whitespace-nowrap">{brl(it.unit_price * it.quantity)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold text-price">{brl(Number(o.total))}</span>
                  </div>

                  <div className="text-[11px] text-muted-foreground bg-secondary/40 rounded px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold uppercase tracking-wider text-[10px]">Etiqueta</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        o.label_status === "printed" ? "bg-[#25D366]/20 text-[#25D366]" :
                        o.label_status === "generated" ? "bg-accent/20 text-accent" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {o.label_status === "printed" ? "Impressa" : o.label_status === "generated" ? "Gerada" : "Não gerada"}
                      </span>
                    </div>
                    {o.label_generated_at && (
                      <div>Gerada {new Date(o.label_generated_at).toLocaleString("pt-BR")}{o.label_generated_by_name ? ` · ${o.label_generated_by_name}` : ""}</div>
                    )}
                    {o.label_printed_at && (
                      <div>Impressa {new Date(o.label_printed_at).toLocaleString("pt-BR")}{o.label_printed_by_name ? ` · ${o.label_printed_by_name}` : ""}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <a
                      href={`/etiqueta/${o.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs bg-secondary hover:bg-muted px-3 py-2 rounded font-bold uppercase tracking-wider"
                    >
                      <Printer className="h-3.5 w-3.5" /> {o.label_status === "generated" ? "Reimprimir" : "Etiqueta"} {labelType}
                    </a>
                    {o.label_status === "generated" && (
                      <a
                        href={`/etiqueta/${o.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs bg-accent/20 text-accent hover:bg-accent/30 px-3 py-2 rounded font-bold uppercase tracking-wider"
                        title="Abrir etiqueta novamente para reimpressão"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reimprimir
                      </a>
                    )}
                    {o.fulfillment_status !== "completed" && (
                      <button
                        onClick={() => advance(o)}
                        className="inline-flex items-center gap-1.5 text-xs bg-primary text-primary-foreground hover:opacity-90 px-3 py-2 rounded font-bold uppercase tracking-wider"
                      >
                        Avançar → {STATUS_LABEL[nextStatus(o.fulfillment_status, o.delivery_method)]}
                      </button>
                    )}
                    {o.fulfillment_status !== "completed" && (
                      <button
                        onClick={() => markDelivered(o)}
                        className="inline-flex items-center gap-1.5 text-xs bg-[#25D366] text-white hover:opacity-90 px-3 py-2 rounded font-bold uppercase tracking-wider"
                        title="Confirmar entrega ao cliente"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Entregue
                      </button>
                    )}
                    {o.delivery_method === "pickup" && delayed && o.customer_phone && (
                      <button
                        onClick={() => openWhatsApp(o.customer_phone, orderReminderMessage(o.customer_name, o.id))}
                        className="inline-flex items-center gap-1.5 text-xs bg-[#25D366] text-white hover:opacity-90 px-3 py-2 rounded font-bold uppercase tracking-wider"
                        title="Enviar lembrete de retirada via WhatsApp"
                      >
                        <BellRing className="h-3.5 w-3.5" /> Lembrar WhatsApp
                      </button>
                    )}
                    {superAdmin && o.status === "paid" && o.mp_payment_id && !o.refund_status && o.fulfillment_status !== "completed" && (
                      <button
                        onClick={() => setRefundTarget(o)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 text-xs bg-amber-600 text-white hover:opacity-90 px-3 py-2 rounded font-bold uppercase tracking-wider disabled:opacity-50"
                        title="Estornar via Mercado Pago"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Estornar
                      </button>
                    )}
                    {superAdmin && o.status === "paid" && !o.refund_status && (
                      <button
                        onClick={() => setVoucherTarget(o)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 text-xs bg-emerald-600 text-white hover:opacity-90 px-3 py-2 rounded font-bold uppercase tracking-wider disabled:opacity-50"
                        title="Emitir vale-troca (cashback) para este cliente"
                      >
                        <Gift className="h-3.5 w-3.5" /> Vale-Troca
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
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
              qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
              qc.invalidateQueries({ queryKey: ["fulfillment-search"] });
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
              if (res.receipt) printVoucherReceipt(res.receipt);
              setVoucherTarget(null);
              qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
              qc.invalidateQueries({ queryKey: ["fulfillment-search"] });
            } catch (err: any) {
              toast.error(err?.message ?? "Falha ao emitir vale-troca");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </Shell>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon} {children}
    </button>
  );
}

function ScannerPanel({ orders, onDeliver, mode }: { orders: OrderRow[]; onDeliver: (o: OrderRow) => void; mode: "pickup" | "delivery" }) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [last, setLast] = useState<{ id: string; name: string; ok: boolean } | null>(null);

  // Foca apenas na primeira montagem. NÃO refocar em cada clique — isso
  // impedia o usuário de selecionar/copiar SKUs, códigos e textos da tela.
  // Para voltar a mirar o leitor USB, o operador clica no próprio input
  // (ou usa o botão "Focar leitor" abaixo).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = code.trim();
    setCode("");
    if (!raw) return;

    const norm = raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const match = orders.find(
      (o) => {
        const id = o.id.toLowerCase();
        const compact = o.id.replace(/-/g, "").toLowerCase();
        return id === norm || id.startsWith(norm) || compact === norm || compact.startsWith(norm) || barcodeValue(o.id) === norm;
      },
    );

    if (!match) {
      setLast({ id: raw, name: "—", ok: false });
      toast.error(`Pedido não encontrado para o código ${raw.slice(0, 12)}…`);
      return;
    }

    if (match.fulfillment_status === "completed") {
      setLast({ id: match.id, name: match.customer_name, ok: false });
      toast.info(`Pedido de ${match.customer_name} já está marcado como entregue.`);
      return;
    }

    onDeliver(match);
    setLast({ id: match.id, name: match.customer_name, ok: true });
  };

  return (
    <form
      onSubmit={submit}
      className="bg-card border-2 border-dashed border-primary/40 rounded-lg p-3 flex flex-wrap items-center gap-3"
    >
      <div className="flex items-center gap-2 text-primary">
        <ScanLine className="h-5 w-5" />
        <span className="font-bold uppercase tracking-wider text-xs">
          Leitor · {mode === "pickup" ? "Retirada na loja" : "Entrega motoboy"}
        </span>
      </div>
      <input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Escaneie a etiqueta do pedido…"
        autoFocus
        className="flex-1 min-w-[220px] bg-secondary/60 border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="submit"
        className="text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground px-3 py-2 rounded hover:opacity-90"
      >
        Confirmar entrega
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        className="text-xs font-bold uppercase tracking-wider bg-secondary hover:bg-muted px-3 py-2 rounded"
        title="Voltar o foco para o leitor USB"
      >
        Focar leitor
      </button>
      {last && (
        <div
          className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${
            last.ok ? "bg-[#25D366]/20 text-[#25D366]" : "bg-destructive/15 text-destructive"
          }`}
        >
          {last.ok ? "✓ Entregue" : "✗ Falhou"} · {last.name !== "—" ? last.name : last.id.slice(0, 8).toUpperCase()}
        </div>
      )}
      <div className="basis-full text-[11px] text-muted-foreground">
        Para bipar, clique no campo acima (ou em "Focar leitor"). Você pode copiar SKUs e códigos livremente sem perder a seleção.
      </div>
    </form>
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

type NotifRow = {
  id: string; created_at: string; customer_name: string; customer_email: string | null;
  customer_phone: string | null; payment_method: string; delivery_method: string;
  status: string; total: number; mp_payment_id: string | null; stock_restored_at: string | null;
  cancellation_reason?: string | null;
};

function notifReason(o: NotifRow): { title: string; detail: string; tone: "warn" | "danger" | "info" } {
  const ageMin = (Date.now() - new Date(o.created_at).getTime()) / 60000;
  if (o.status === "pending") {
    if (ageMin > 30) {
      return {
        title: "Pagamento não concluído",
        detail: "Pedido criado há mais de 30 min sem confirmação do Mercado Pago. O cliente provavelmente abandonou o checkout ou o pagamento expirou.",
        tone: "danger",
      };
    }
    return {
      title: "Aguardando pagamento",
      detail: o.mp_payment_id
        ? "Mercado Pago ainda não confirmou o pagamento. Aguardando webhook."
        : "Cliente foi redirecionado ao Mercado Pago e ainda não finalizou o pagamento.",
      tone: "warn",
    };
  }
  // cancelled — usar motivo explícito gravado pelo backend
  const reason = o.cancellation_reason;
  if (reason === "out_of_stock") {
    return {
      title: "Cancelado por falta de estoque",
      detail: "Quando o pagamento chegou, um dos itens estava sem estoque. O pedido foi cancelado automaticamente e o estoque foi devolvido.",
      tone: "danger",
    };
  }
  if (reason === "payment_refused" || (!reason && o.mp_payment_id)) {
    return {
      title: "Pagamento recusado / cancelado",
      detail: "Mercado Pago retornou o pagamento como não aprovado (recusado, estornado ou cancelado pelo cliente). O pedido não seguiu para a expedição.",
      tone: "danger",
    };
  }
  // expired ou cancelamento sem pagamento iniciado = abandono
  return {
    title: "Pedido expirado",
    detail: "O cliente não concluiu o pagamento dentro do prazo (30 min) e o pedido foi cancelado automaticamente. Estoque permaneceu disponível.",
    tone: "info",
  };
}

function NotificationsPanel({ rows, itemsByOrder }: { rows: NotifRow[]; itemsByOrder: Map<string, ItemRow[]> }) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
        <BellRing className="h-10 w-10 mx-auto mb-2 text-primary" />
        Nenhum pedido pendente ou cancelado nas últimas atualizações.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Pedidos que <strong className="text-foreground">não chegaram à expedição</strong> — geralmente porque o pagamento não foi confirmado.
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map((o) => {
          const r = notifReason(o);
          const Icon = r.tone === "danger" ? XCircle : r.tone === "warn" ? Hourglass : AlertTriangle;
          const toneCls =
            r.tone === "danger" ? "border-destructive/40 bg-destructive/5" :
            r.tone === "warn" ? "border-accent/40 bg-accent/5" :
            "border-border bg-muted/30";
          const iconCls =
            r.tone === "danger" ? "text-destructive" :
            r.tone === "warn" ? "text-accent" :
            "text-muted-foreground";
          const items = itemsByOrder.get(o.id) ?? [];
          return (
            <article key={o.id} className={`border rounded-lg p-4 flex flex-col gap-2 ${toneCls}`}>
              <header className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[11px] text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</div>
                  <div className="font-bold">{o.customer_name}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${o.status === "cancelled" ? "bg-destructive text-destructive-foreground" : "bg-accent/20 text-accent"}`}>
                  {o.status === "cancelled" ? "Cancelado" : "Pendente"}
                </span>
              </header>
              {items.length > 0 && (
                <ul className="text-xs space-y-1 border-t border-border/50 pt-2">
                  <li className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    {o.status === "cancelled" ? "Tentou comprar" : "Itens do pedido"}
                  </li>
                  {items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="whitespace-nowrap">{it.quantity}x</span>
                        {it.product_id ? (
                          <a
                            href={`/produto/${it.product_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate underline decoration-dotted hover:text-primary"
                            title="Abrir produto em nova aba"
                          >
                            {it.product_name}
                          </a>
                        ) : (
                          <span className="truncate">{it.product_name}</span>
                        )}
                        {it.sku && <SkuChip sku={it.sku} small />}
                      </span>
                      <span className="font-semibold whitespace-nowrap">{brl(it.unit_price * it.quantity)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-start gap-2 border-t border-border/50 pt-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconCls}`} />
                <div className="text-sm">
                  <div className="font-bold">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.detail}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2">
                <span>{o.payment_method === "pix" ? "PIX" : "Cartão / MP"} · {o.delivery_method === "pickup" ? "Retirada" : "Entrega"}</span>
                <span className="font-bold text-foreground">{brl(Number(o.total))}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SkuChip({ sku, small = false }: { sku: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(sku);
      setCopied(true);
      toast.success(`SKU ${sku} copiado`);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Clique para copiar o SKU"
      className={`inline-flex items-center gap-1 rounded bg-accent/20 hover:bg-accent/30 font-mono font-bold uppercase tracking-wider text-accent shrink-0 ${
        small ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]"
      }`}
    >
      {sku}
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  );
}


// ============================================================
// Painel de Reembolsos (aba na Expedição)
// Mostra pedidos com refund_status em queued/processing/refund_failed
// e o nível de processamento na fila Cielo.
// ============================================================

function refundStatusLabel(orderStatus: string | null | undefined, queue: CieloRefundQueueRow | undefined): { label: string; tone: "warn" | "info" | "error" | "ok" } {
  if (queue?.status === "completed") return { label: "Reembolsado", tone: "ok" };
  if (queue?.status === "processing") return { label: "Processando estorno…", tone: "info" };
  if (queue?.status === "failed" || orderStatus === "refund_failed") return { label: "Falhou — ação necessária", tone: "error" };
  if (queue?.status === "pending") return { label: "Aguardando saldo (D+1)", tone: "warn" };
  if (orderStatus === "queued") return { label: "Na fila (D+1)", tone: "warn" };
  return { label: "Em análise", tone: "info" };
}

function RefundsPanel({
  orders,
  queueByOrder,
  itemsByOrder,
  onRetry,
}: {
  orders: OrderRow[];
  queueByOrder: Map<string, CieloRefundQueueRow>;
  itemsByOrder: Map<string, ItemRow[]>;
  onRetry: (queueId: string) => void | Promise<void>;
}) {
  if (orders.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
        <Undo2 className="h-10 w-10 mx-auto mb-2 text-primary" />
        Nenhum pedido em fila de reembolso.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 text-xs text-foreground">
        <strong className="uppercase tracking-wider text-accent">Como funciona:</strong>{" "}
        Reembolsos Cielo são processados automaticamente no próximo dia útil (D+1), quando o saldo é liberado pela adquirente.
        Se o saldo ainda não estiver disponível, o sistema tenta novamente a cada 24h até completar.
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {orders.map((o) => {
          const q = queueByOrder.get(o.id);
          const st = refundStatusLabel(o.refund_status, q);
          const items = itemsByOrder.get(o.id) ?? [];
          const tone =
            st.tone === "ok" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" :
            st.tone === "error" ? "bg-destructive/10 text-destructive border-destructive/30" :
            st.tone === "info" ? "bg-blue-500/10 text-blue-600 border-blue-500/30" :
            "bg-amber-500/10 text-amber-700 border-amber-500/30";
          const nextAttempt = q?.next_attempt_at ? new Date(q.next_attempt_at) : null;
          const lastAttempt = q?.last_attempt_at ? new Date(q.last_attempt_at) : null;
          return (
            <article key={o.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
              <header className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
                    #{o.id.slice(0, 8).toUpperCase()}
                  </div>
                  <div className="font-bold">{o.customer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("pt-BR")} · {brl(o.total)}
                  </div>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border ${tone}`}>
                  {st.label}
                </span>
              </header>

              {items.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {items.map((it, i) => (
                    <li key={i}>· {it.quantity}× {it.product_name}</li>
                  ))}
                </ul>
              )}

              <div className="text-[11px] grid grid-cols-2 gap-2 border-t border-border pt-2">
                <div>
                  <div className="uppercase tracking-wider text-muted-foreground">Tentativas</div>
                  <div className="font-mono font-bold">{q ? `${q.attempts}/${q.max_attempts}` : "—"}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider text-muted-foreground">Valor</div>
                  <div className="font-mono font-bold">{q ? brl(q.amount) : brl(o.total)}</div>
                </div>
                {lastAttempt && (
                  <div className="col-span-2">
                    <div className="uppercase tracking-wider text-muted-foreground">Última tentativa</div>
                    <div>{lastAttempt.toLocaleString("pt-BR")}</div>
                  </div>
                )}
                {nextAttempt && q?.status !== "completed" && (
                  <div className="col-span-2">
                    <div className="uppercase tracking-wider text-muted-foreground">Próxima tentativa</div>
                    <div>{nextAttempt.toLocaleString("pt-BR")}</div>
                  </div>
                )}
                {q?.last_error && (
                  <div className="col-span-2">
                    <div className="uppercase tracking-wider text-muted-foreground">Último erro</div>
                    <div className="text-destructive">{q.last_error}{q.last_error_code ? ` (${q.last_error_code})` : ""}</div>
                  </div>
                )}
              </div>

              {q && q.status !== "completed" && (
                <div className="flex justify-end">
                  <button
                    onClick={() => onRetry(q.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-wider hover:opacity-90"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Tentar agora
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
