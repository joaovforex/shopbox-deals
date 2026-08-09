import { supabase } from "@/integrations/supabase/client";

/**
 * Métricas do admin calculadas NO BANCO (RPCs SECURITY DEFINER com checagem de
 * cargo admin/manager). Nenhuma métrica trafega linhas cruas — isso evita o teto
 * de 1000 linhas da Data API, que fazia os relatórios travarem/zerarem quando a
 * loja passou de 1000 pedidos.
 */

export type PaymentBreakdown = {
  method: string;
  provider: string;
  orders_count: number;
  revenue: number;
};

export type RankedProduct = { id: string | null; name: string; qty: number; revenue: number };
export type RankedCategory = { name: string; qty: number; revenue: number };

export type OrderMetrics = {
  orders_count: number;
  units_sold: number;
  revenue: number;
  products_revenue: number;
  shipping_revenue: number;
  cashback_used_total: number;
  cash_collected: number;
  avg_ticket: number;
  delivery_count: number;
  pickup_count: number;
  by_payment: PaymentBreakdown[];
  product_ranking: RankedProduct[];
  category_ranking: RankedCategory[];
};

export type MetricsFilters = {
  from?: string | null;
  to?: string | null;
  delivery?: string | null;
  payment?: string | null;
  category?: string | null;
};

/** Traduz erros crus do Postgres/Supabase em mensagens claras para o admin. */
export class AdminMetricsError extends Error {
  kind: "auth" | "permission" | "unknown";
  constructor(kind: "auth" | "permission" | "unknown", message: string) {
    super(message);
    this.kind = kind;
    this.name = "AdminMetricsError";
  }
}

function toFriendlyError(error: { message?: string; code?: string } | null): AdminMetricsError {
  const raw = error?.message ?? "";
  if (/JWT|not authenticated|invalid claim|token is expired/i.test(raw)) {
    return new AdminMetricsError("auth", "Sessão expirada, entre novamente.");
  }
  if (/permissão|permission|denied/i.test(raw)) {
    return new AdminMetricsError("permission", "Você não tem permissão para ver estes relatórios.");
  }
  return new AdminMetricsError("unknown", `Erro ao carregar métricas: ${raw || "falha desconhecida"}`);
}

async function assertSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new AdminMetricsError("auth", "Sessão expirada, entre novamente.");
}

const EMPTY_METRICS: OrderMetrics = {
  orders_count: 0,
  units_sold: 0,
  revenue: 0,
  products_revenue: 0,
  shipping_revenue: 0,
  cashback_used_total: 0,
  cash_collected: 0,
  avg_ticket: 0,
  delivery_count: 0,
  pickup_count: 0,
  by_payment: [],
  product_ranking: [],
  category_ranking: [],
};

export async function fetchOrderMetrics(f: MetricsFilters): Promise<OrderMetrics> {
  await assertSession();
  const { data, error } = await supabase.rpc("admin_order_metrics" as never, {
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_delivery: f.delivery ?? null,
    p_payment: f.payment ?? null,
    p_category: f.category ?? null,
  } as never);
  if (error) throw toFriendlyError(error);
  const raw = (data ?? {}) as Partial<OrderMetrics>;
  return {
    ...EMPTY_METRICS,
    ...raw,
    orders_count: Number(raw.orders_count ?? 0),
    units_sold: Number(raw.units_sold ?? 0),
    revenue: Number(raw.revenue ?? 0),
    products_revenue: Number(raw.products_revenue ?? 0),
    shipping_revenue: Number(raw.shipping_revenue ?? 0),
    avg_ticket: Number(raw.avg_ticket ?? 0),
    delivery_count: Number(raw.delivery_count ?? 0),
    pickup_count: Number(raw.pickup_count ?? 0),
    by_payment: (raw.by_payment ?? []).map((p) => ({
      ...p,
      orders_count: Number(p.orders_count ?? 0),
      revenue: Number(p.revenue ?? 0),
    })),
    product_ranking: (raw.product_ranking ?? []).map((p) => ({
      ...p,
      qty: Number(p.qty ?? 0),
      revenue: Number(p.revenue ?? 0),
    })),
    category_ranking: (raw.category_ranking ?? []).map((c) => ({
      ...c,
      qty: Number(c.qty ?? 0),
      revenue: Number(c.revenue ?? 0),
    })),
  };
}

export type AdminOrderRow = {
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
  delivery_fee: number | null;
  mp_payment_id: string | null;
  refund_status: string | null;
  refunded_amount: number | null;
  refunded_at: string | null;
  fulfillment_status: string | null;
};

export type OrdersPageParams = MetricsFilters & {
  search?: string | null;
  status?: string | null;
  limit: number;
  offset: number;
};

export async function fetchOrdersPage(
  p: OrdersPageParams,
): Promise<{ rows: AdminOrderRow[]; total: number }> {
  await assertSession();
  const { data, error } = await supabase.rpc("admin_orders_page" as never, {
    p_from: p.from ?? null,
    p_to: p.to ?? null,
    p_search: p.search?.trim() ? p.search.trim() : null,
    p_delivery: p.delivery ?? null,
    p_payment: p.payment ?? null,
    p_status: p.status ?? null,
    p_category: p.category ?? null,
    p_limit: p.limit,
    p_offset: p.offset,
  } as never);
  if (error) throw toFriendlyError(error);
  const rows = (data ?? []) as Array<AdminOrderRow & { total_count: number }>;
  return {
    rows: rows.map(({ total_count: _tc, ...r }) => ({ ...r, total: Number(r.total) })),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

export type CatalogValue = {
  active_count: number;
  out_of_stock_count: number;
  total_units: number;
  total_retail: number;
  total_original: number;
};

export async function fetchCatalogValue(): Promise<CatalogValue> {
  await assertSession();
  const { data, error } = await supabase.rpc("admin_catalog_value" as never, {} as never);
  if (error) throw toFriendlyError(error);
  const raw = (data ?? {}) as Partial<CatalogValue>;
  return {
    active_count: Number(raw.active_count ?? 0),
    out_of_stock_count: Number(raw.out_of_stock_count ?? 0),
    total_units: Number(raw.total_units ?? 0),
    total_retail: Number(raw.total_retail ?? 0),
    total_original: Number(raw.total_original ?? 0),
  };
}

export async function fetchCashbackOutstanding(): Promise<{ balance: number; entries: number }> {
  await assertSession();
  const { data, error } = await supabase.rpc("admin_cashback_outstanding" as never, {} as never);
  if (error) throw toFriendlyError(error);
  const raw = (data ?? {}) as { balance?: number; entries?: number };
  return { balance: Number(raw.balance ?? 0), entries: Number(raw.entries ?? 0) };
}
