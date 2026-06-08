import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Package, ArrowRight } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/pedido/$id")({
  head: () => ({ meta: [{ title: "Pedido confirmado · shopbox" }] }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data: order, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);
      return { order, items: items ?? [] };
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <section className="container mx-auto px-4 py-10 flex-1">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary mb-3">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h1 className="display text-3xl md:text-4xl">Pedido confirmado!</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Número do pedido: <span className="font-mono font-bold">{id.slice(0, 8).toUpperCase()}</span>
            </p>
          </div>

          {isLoading || !data?.order ? (
            <div className="bg-card border border-border rounded-lg p-6 animate-pulse h-40" />
          ) : (
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-primary" />
                <span className="font-semibold capitalize">Status: {data.order.status === "paid" ? "Pago" : data.order.status}</span>
              </div>

              <div className="border-t border-border pt-4">
                <h2 className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-2">Itens</h2>
                <ul className="space-y-2 text-sm">
                  {data.items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span>{it.quantity}x {it.product_name}</span>
                      <span className="font-semibold">{brl(Number(it.unit_price) * it.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-border pt-4 flex justify-between items-baseline">
                <span className="font-bold">Total pago</span>
                <span className="display text-2xl text-price">{brl(Number(data.order.total))}</span>
              </div>

              <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-4">
                <div><strong>Cliente:</strong> {data.order.customer_name}</div>
                {data.order.customer_email && <div><strong>Email:</strong> {data.order.customer_email}</div>}
                {data.order.customer_phone && <div><strong>WhatsApp:</strong> {data.order.customer_phone}</div>}
                <div><strong>{data.order.delivery_method === "pickup" ? "Retirada" : "Entrega"}:</strong> {data.order.shipping_address}</div>
                <div><strong>Pagamento:</strong> {data.order.payment_method.toUpperCase()}</div>
              </div>
            </div>
          )}

          <div className="text-center mt-6">
            <Link to="/loja" className="inline-flex items-center gap-2 text-primary hover:underline font-semibold">
              Continuar comprando <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
