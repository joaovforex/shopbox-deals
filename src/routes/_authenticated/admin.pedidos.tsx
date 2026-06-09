import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, TrendingUp, Package, DollarSign, ShoppingBag, Sparkles, Truck, Store, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, isSuperAdmin } from "@/lib/products";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos · Admin" }] }),
  component: OrdersPanel,
});

type Period = "day" | "week" | "month" | "all";

type OrderRow = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
  payment_method: string;
  delivery_method: string;
  status: string;
  total: number;
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
  if (period === "week") { d.setDate(d.getDate() - 7); return d; }
  if (period === "month") { d.setMonth(d.getMonth() - 1); return d; }
  return null;
}

function OrdersPanel() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [superAdmin, setSuperAdmin] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    isAdmin().then(setAdmin);
    isSuperAdmin().then(setSuperAdmin);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders", period],
    enabled: admin === true,
    queryFn: async () => {
      const since = startOf(period);
      let q = supabase
        .from("orders")
        .select("*")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      if (since) q = q.gte("created_at", since.toISOString());
      const { data: orders, error } = await q;
      if (error) throw error;
      const ids = (orders ?? []).map((o) => o.id);
      let items: ItemRow[] = [];
      if (ids.length) {
        const { data: it, error: ie } = await supabase.from("order_items").select("*").in("order_id", ids);
        if (ie) throw ie;
        items = (it ?? []) as ItemRow[];
      }
      return { orders: (orders ?? []) as OrderRow[], items };
    },
  });

  const stats = useMemo(() => {
    const orders = data?.orders ?? [];
    const items = data?.items ?? [];
    // Receita total agregada (soma de unit_price * quantity de TODOS os itens, independente de cliente)
    const revenue = items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);
    // Total de unidades vendidas (somando quantidade item a item)
    const unitsSold = items.reduce((s, i) => s + Number(i.quantity), 0);

    // Agregação precisa por produto: soma todas as unidades vendidas em todos os pedidos
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items) {
      const cur = byProduct.get(it.product_id) ?? { name: it.product_name, qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity);
      cur.revenue += Number(it.unit_price) * Number(it.quantity);
      byProduct.set(it.product_id, cur);
    }
    const ranking = [...byProduct.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.qty - a.qty);

    // Delivery breakdown
    const deliveryCount = orders.filter((o) => o.delivery_method === "delivery").length;
    const pickupCount = orders.filter((o) => o.delivery_method === "pickup").length;

    return { orders, items, revenue, unitsSold, ranking, deliveryCount, pickupCount };
  }, [data]);

  const insight = useMemo(() => generateInsight(stats.ranking, stats.orders.length, period), [stats, period]);

  async function deleteOrder(id: string) {
    if (!confirm("Excluir este pedido? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    try {
      const { error: e1 } = await supabase.from("order_items").delete().eq("order_id", id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("orders").delete().eq("id", id);
      if (e2) throw e2;
      toast.success("Pedido excluído");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (err: any) {
      toast.error("Falha ao excluir: " + (err?.message ?? "erro"));
    } finally {
      setBusy(false);
    }
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
            <div className="inline-flex bg-secondary rounded-md p-1">
              {(["day", "week", "month", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {p === "day" ? "Hoje" : p === "week" ? "7 dias" : p === "month" ? "30 dias" : "Tudo"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={<ShoppingBag className="h-5 w-5" />} label="Pedidos" value={String(stats.orders.length)} />
          <Kpi icon={<DollarSign className="h-5 w-5" />} label="Receita" value={brl(stats.revenue)} accent />
          <Kpi icon={<Package className="h-5 w-5" />} label="Itens vendidos" value={String(stats.unitsSold)} />
          <Kpi icon={<TrendingUp className="h-5 w-5" />} label="Ticket médio" value={stats.orders.length ? brl(stats.revenue / stats.orders.length) : brl(0)} />
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

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Top products */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-secondary">
              <h2 className="display text-lg">Produtos vendidos</h2>
              <p className="text-xs text-muted-foreground">Quantidade total no período selecionado</p>
            </div>
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
            ) : stats.ranking.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Nenhum produto vendido neste período.</div>
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
              {stats.orders.length === 0
                ? "Sem pedidos no período."
                : `${Math.round((stats.deliveryCount / Math.max(1, stats.orders.length)) * 100)}% dos pedidos pedem entrega.`}
            </div>
          </div>
        </div>

        {/* Orders list */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary flex items-center justify-between gap-2">
            <h2 className="display text-lg">Pedidos</h2>
            <span className="text-xs text-muted-foreground">{stats.orders.length} no período</span>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : stats.orders.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum pedido neste período.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-3">Pedido</th>
                    <th className="p-3">Data</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Contato</th>
                    <th className="p-3">Entrega</th>
                    <th className="p-3">Pagamento</th>
                    <th className="p-3 text-right">Total</th>
                    {superAdmin && <th className="p-3 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {stats.orders.map((o) => (
                    <tr key={o.id} className="border-t border-border hover:bg-secondary/40">
                      <td className="p-3 font-mono text-xs">
                        <Link to="/pedido/$id" params={{ id: o.id }} className="text-primary hover:underline">
                          {o.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="p-3 text-xs">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                      <td className="p-3">{o.customer_name}</td>
                      <td className="p-3 text-xs">
                        {o.customer_phone && <div>{formatPhone(o.customer_phone)}</div>}
                        {o.customer_email && <div className="text-muted-foreground">{o.customer_email}</div>}
                      </td>
                      <td className="p-3 text-xs uppercase">
                        <span className={`px-2 py-0.5 rounded font-bold ${o.delivery_method === "pickup" ? "bg-accent/20 text-accent" : "bg-primary/15 text-primary"}`}>
                          {o.delivery_method === "pickup" ? "Retirada" : "Entrega"}
                        </span>
                      </td>
                      <td className="p-3 text-xs uppercase">{o.payment_method}</td>
                      <td className="p-3 text-right font-bold text-price">{brl(Number(o.total))}</td>
                      {superAdmin && (
                        <td className="p-3 text-right">
                          <button
                            onClick={() => deleteOrder(o.id)}
                            disabled={busy}
                            title="Excluir pedido"
                            className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-destructive hover:bg-destructive/10 px-2 py-1 rounded disabled:opacity-50"
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
    </Shell>
  );
}

function formatPhone(d: string) {
  const s = d.replace(/\D/g, "");
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return d;
}

function generateInsight(
  ranking: { name: string; qty: number; revenue: number }[],
  orderCount: number,
  period: Period,
): string {
  if (ranking.length === 0) {
    return "Ainda não há vendas no período. Compartilhe seus produtos para começar a gerar relatórios inteligentes.";
  }
  const periodLabel = period === "day" ? "hoje" : period === "week" ? "nos últimos 7 dias" : period === "month" ? "nos últimos 30 dias" : "no histórico completo";
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
