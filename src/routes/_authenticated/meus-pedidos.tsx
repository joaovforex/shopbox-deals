import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Package, ArrowRight, Clock, CheckCircle2, Store, XCircle, Truck, ExternalLink } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { STORE_ADDRESS } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/meus-pedidos")({
  head: () => ({ meta: [{ title: "Meus pedidos · shopbox" }] }),
  component: MyOrdersPage,
});

type OrderItem = { id: string; product_name: string; quantity: number };
type Row = {
  id: string;
  created_at: string;
  status: string;
  fulfillment_status: string;
  total: number;
  payment_method: string;
  delivery_method: string | null;
  shipping_street: string | null;
  shipping_number: string | null;
  shipping_district: string | null;
  shipping_city: string | null;
  maisentregas_status: string | null;
  maisentregas_tracking_url: string | null;
  order_items: OrderItem[] | null;
};

function statusBadge(o: Row): { label: string; cls: string; icon: React.ReactNode } {
  if (o.status === "cancelled") return { label: "Cancelado", cls: "bg-destructive/15 text-destructive", icon: <XCircle className="h-3.5 w-3.5" /> };
  if (o.status === "pending") return { label: "Aguardando pagamento", cls: "bg-muted text-muted-foreground", icon: <Clock className="h-3.5 w-3.5" /> };
  // paid
  if (o.delivery_method === "delivery") {
    const s = (o.maisentregas_status ?? "").toLowerCase();
    if (s.startsWith("entregue")) return { label: "Entregue", cls: "bg-[#25D366]/20 text-[#25D366]", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
    if (s) return { label: s, cls: "bg-primary/15 text-primary", icon: <Truck className="h-3.5 w-3.5" /> };
    return { label: "Preparando envio", cls: "bg-accent/20 text-accent", icon: <Package className="h-3.5 w-3.5" /> };
  }
  if (o.fulfillment_status === "completed") return { label: "Entregue", cls: "bg-[#25D366]/20 text-[#25D366]", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
  if (o.fulfillment_status === "ready" || o.fulfillment_status === "shipped") return { label: "Pronto para retirada", cls: "bg-primary text-primary-foreground", icon: <Store className="h-3.5 w-3.5" /> };
  if (o.fulfillment_status === "preparing") return { label: "Em separação", cls: "bg-accent/20 text-accent", icon: <Package className="h-3.5 w-3.5" /> };
  return { label: "Pagamento confirmado", cls: "bg-primary/15 text-primary", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
}


function MyOrdersPage() {
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as Row[];
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, status, fulfillment_status, total, payment_method, delivery_method, shipping_street, shipping_number, shipping_district, shipping_city, maisentregas_status, maisentregas_tracking_url, order_items(id, product_name, quantity)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },

    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      channel = supabase
        .channel(`orders-user-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
          () => { queryClient.invalidateQueries({ queryKey: ["my-orders"] }); },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [queryClient]);


  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-8">
          <div className="text-xs uppercase tracking-widest text-accent font-bold">Sua conta</div>
          <h1 className="display text-3xl md:text-4xl">Meus pedidos</h1>
          <p className="text-sm text-muted-foreground">Acompanhe o status dos seus pedidos e a retirada na loja.</p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 flex-1">
        {isLoading ? (
          <div className="text-muted-foreground">Carregando...</div>
        ) : !orders || orders.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <Package className="h-10 w-10 mx-auto mb-3 text-primary" />
            <p className="font-bold mb-1">Você ainda não fez pedidos</p>
            <p className="text-sm text-muted-foreground mb-5">Explore as ofertas e seu próximo pedido aparecerá aqui.</p>
            <Link to="/loja" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-5 py-3 rounded-md">
              Ver ofertas <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const b = statusBadge(o);
              const isReady = o.status === "paid" && o.delivery_method !== "delivery" && (o.fulfillment_status === "ready" || o.fulfillment_status === "shipped");
              const isDelivery = o.status === "paid" && o.delivery_method === "delivery";

              return (
                <li key={o.id}>
                  <Link
                    to="/pedido/$id"
                    params={{ id: o.id }}
                    className="block bg-card border border-border hover:border-primary rounded-xl p-4 transition-colors"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</div>
                        <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded ${b.cls}`}>
                        {b.icon} {b.label}
                      </span>
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Produtos</p>
                        <ul className="text-sm text-foreground space-y-0.5">
                          {(o.order_items ?? []).map((item) => (
                            <li key={item.id} className="truncate">
                              {item.quantity}x {item.product_name}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <span className="display text-xl text-price whitespace-nowrap">{brl(Number(o.total))}</span>
                    </div>
                    {isReady && (
                      <div className="mt-3 text-xs bg-primary/10 border border-primary/30 rounded px-3 py-2">
                        <strong className="text-primary">Pronto para retirada.</strong>{" "}
                        Endereço: <span className="font-semibold">{STORE_ADDRESS}</span>.{" "}
                        <span className="text-accent font-bold">Você tem até 5 dias para retirar.</span>
                      </div>
                    )}
                    {isDelivery && (
                      <div className="mt-3 text-xs bg-primary/10 border border-primary/30 rounded px-3 py-2 flex flex-wrap items-center gap-2 justify-between">
                        <div>
                          <strong className="text-primary inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> Entrega em casa</strong>{" "}
                          {o.shipping_street && (
                            <span className="text-muted-foreground">— {o.shipping_street}, {o.shipping_number}{o.shipping_district ? `, ${o.shipping_district}` : ""}</span>
                          )}
                        </div>
                        {o.maisentregas_tracking_url && (
                          <a
                            href={o.maisentregas_tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                          >
                            Acompanhar <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </Link>

                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Footer />
    </div>
  );
}
