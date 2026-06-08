import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Truck, Store, Printer, Package, CheckCircle2, Clock } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { hasAnyRole } from "@/lib/products";
import { brl } from "@/lib/format";

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
  shipping_address: string | null;
  shipping_zip: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  delivery_method: string;
  payment_method: string;
  status: string;
  fulfillment_status: string;
  total: number;
  label_status?: string | null;
  label_generated_at?: string | null;
  label_generated_by_name?: string | null;
  label_printed_at?: string | null;
  label_printed_by_name?: string | null;
};

type ItemRow = {
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
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

function FulfillmentPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"delivery" | "pickup">("delivery");
  const qc = useQueryClient();

  useEffect(() => {
    hasAnyRole(["admin", "fulfillment"]).then(setAllowed);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["fulfillment-orders"],
    enabled: allowed === true,
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("*")
        .neq("fulfillment_status", "completed")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (orders ?? []).map((o) => o.id);
      let items: ItemRow[] = [];
      if (ids.length) {
        const { data: it } = await supabase.from("order_items").select("order_id, product_name, quantity, unit_price").in("order_id", ids);
        items = (it ?? []) as ItemRow[];
      }
      return { orders: (orders ?? []) as OrderRow[], items };
    },
  });

  const advance = async (o: OrderRow) => {
    const ns = nextStatus(o.fulfillment_status, o.delivery_method);
    if (ns === o.fulfillment_status) return;
    const { error } = await supabase.from("orders").update({ fulfillment_status: ns } as never).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success(`Status atualizado para "${STATUS_LABEL[ns]}"`);
    qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
  };

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const it of data?.items ?? []) {
      const arr = map.get(it.order_id) ?? [];
      arr.push(it);
      map.set(it.order_id, arr);
    }
    return map;
  }, [data]);

  const orders = (data?.orders ?? []).filter((o) =>
    tab === "delivery" ? o.delivery_method === "delivery" : o.delivery_method === "pickup",
  );

  if (allowed === null) {
    return <Shell><div className="flex-1 flex items-center justify-center">Carregando...</div></Shell>;
  }
  if (!allowed) {
    return <Shell><div className="flex-1 flex items-center justify-center p-6 text-muted-foreground">Acesso restrito à equipe de Expedição.</div></Shell>;
  }

  return (
    <Shell>
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao admin
          </Link>
          <div className="text-xs uppercase tracking-widest text-accent font-bold">Departamento</div>
          <h1 className="display text-3xl md:text-4xl">Expedição</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cada pedido cai automaticamente na fila certa: <strong>envio</strong> ou <strong>retirada</strong>. Imprima a etiqueta e avance o status conforme prepara.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 space-y-4">
        <div className="inline-flex bg-secondary rounded-md p-1">
          <TabBtn active={tab === "delivery"} onClick={() => setTab("delivery")} icon={<Truck className="h-4 w-4" />}>
            Envio ({(data?.orders ?? []).filter((o) => o.delivery_method === "delivery").length})
          </TabBtn>
          <TabBtn active={tab === "pickup"} onClick={() => setTab("pickup")} icon={<Store className="h-4 w-4" />}>
            Retirada na loja ({(data?.orders ?? []).filter((o) => o.delivery_method === "pickup").length})
          </TabBtn>
        </div>

        {isLoading ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">Carregando...</div>
        ) : orders.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-primary" />
            Nenhum pedido em aberto nesta fila.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {orders.map((o) => {
              const items = itemsByOrder.get(o.id) ?? [];
              const labelType = o.delivery_method === "pickup" ? "retirada" : "envio";
              return (
                <article key={o.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
                  <header className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</div>
                      <div className="font-bold">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${
                      o.fulfillment_status === "pending" ? "bg-muted text-muted-foreground" :
                      o.fulfillment_status === "preparing" ? "bg-accent/20 text-accent" :
                      o.fulfillment_status === "ready" ? "bg-primary/20 text-primary" :
                      "bg-[#25D366]/20 text-[#25D366]"
                    }`}>
                      <Clock className="inline h-3 w-3 mr-1" />
                      {STATUS_LABEL[o.fulfillment_status] ?? o.fulfillment_status}
                    </span>
                  </header>

                  <div className="text-xs text-muted-foreground border-y border-border py-2">
                    {o.delivery_method === "delivery" ? (
                      <>
                        <strong className="text-foreground">Endereço:</strong> {o.shipping_address}
                      </>
                    ) : (
                      <>
                        <strong className="text-foreground">Retirada:</strong> aguardando cliente · {o.customer_phone}
                      </>
                    )}
                  </div>

                  <ul className="text-sm space-y-1">
                    {items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          {it.quantity}x {it.product_name}
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
                      <Printer className="h-3.5 w-3.5" /> Etiqueta {labelType}
                    </a>
                    {o.fulfillment_status !== "completed" && (
                      <button
                        onClick={() => advance(o)}
                        className="inline-flex items-center gap-1.5 text-xs bg-primary text-primary-foreground hover:opacity-90 px-3 py-2 rounded font-bold uppercase tracking-wider"
                      >
                        Avançar → {STATUS_LABEL[nextStatus(o.fulfillment_status, o.delivery_method)]}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
