import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, MessageCircle, Package, Store, Clock, ArrowRight, Sparkles, Truck, ExternalLink } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { getPublicOrder } from "@/lib/orders.functions";
import { brl } from "@/lib/format";
import { STORE_ADDRESS, STORE_HOURS } from "@/lib/whatsapp";

export const Route = createFileRoute("/pedido/$id")({
  head: () => ({ meta: [{ title: "Pedido confirmado · shopbox" }] }),
  component: OrderPage,
});

function OrderPage() {
  const { id } = Route.useParams();
  const fetchOrder = useServerFn(getPublicOrder);

  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchOrder({ data: { id } }),
    refetchInterval: (q) => {
      const o = (q.state.data as { order?: { status?: string; fulfillment_status?: string } } | undefined)?.order;
      if (!o) return 5000;
      if (o.status === "pending") return 3000;
      if (o.status === "paid" && o.fulfillment_status !== "completed") return 15000;
      return false;
    },
  });

  const order = data?.order;
  const status = order?.status;
  const fulfillment = order?.fulfillment_status;
  const isPaid = status === "paid";
  const isCancelled = status === "cancelled";
  const isPending = !isPaid && !isCancelled;
  const isDelivery = order?.delivery_method === "delivery";
  const meStatus = (order?.maisentregas_status ?? "").toLowerCase();
  const isDelivered = isPaid && isDelivery && meStatus.startsWith("entregue");
  const isReady = isPaid && !isDelivery && (fulfillment === "ready" || fulfillment === "shipped");
  const isDone = isDelivered || (isPaid && !isDelivery && fulfillment === "completed");
  const isPreparing = isPaid && !isDelivery && (fulfillment === "pending" || fulfillment === "preparing");

  const shortId = id.slice(0, 8).toUpperCase();


  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <section className="container mx-auto px-4 py-10 flex-1">
        <div className="max-w-2xl mx-auto">
          {/* HERO */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-8 md:p-10 text-center mb-6">
            <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-accent/10 blur-3xl pointer-events-none" />

            <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-primary mb-4 ring-4 ring-primary/10">
              <CheckCircle2 className="h-12 w-12" strokeWidth={2.5} />
              <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-accent" />
            </div>

            <h1 className="display text-3xl md:text-5xl mb-2">
              {isCancelled ? "Pagamento não concluído"
                : isPending ? "Aguardando pagamento"
                : isDone ? (isDelivery ? "Pedido entregue!" : "Pedido entregue!")
                : isDelivery ? "EM ROTA DE ENTREGA"
                : isReady ? "PRONTO PARA RETIRADA"
                : isPreparing ? "EM SEPARAÇÃO"
                : "Pagamento confirmado!"}
            </h1>
            <p className="text-muted-foreground">
              {isCancelled
                ? "Não recebemos a confirmação do Mercado Pago."
                : isPending
                  ? "Assim que o Mercado Pago confirmar, atualizamos esta página automaticamente."
                  : isDone
                    ? "Obrigado pela compra! 💚"
                    : isDelivery
                      ? (meStatus ? `Status atual: ${meStatus}` : "Estamos preparando seu envio.")
                      : isReady
                        ? "Seu pedido já está separado e te aguarda na loja."
                        : isPreparing
                          ? "Nosso time está separando seus itens. Você receberá um aviso no WhatsApp assim que estiver pronto."
                          : "Recebemos seu pedido com sucesso 🎉"}
            </p>


            <div className="inline-flex items-center gap-2 mt-4 bg-background/60 backdrop-blur border border-border px-4 py-2 rounded-full">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Pedido</span>
              <span className="font-mono font-bold tracking-widest">#{shortId}</span>
            </div>
          </div>

          {/* WHATSAPP NOTICE — apenas enquanto não estiver pronto */}
          {(isPaid && !isReady && !isDone) && (
            <div className="rounded-xl border-2 border-[#25D366]/30 bg-[#25D366]/5 p-5 mb-6 flex gap-4">
              <div className="shrink-0 h-11 w-11 rounded-full bg-[#25D366]/15 text-[#25D366] flex items-center justify-center">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="text-sm">
                <p className="font-bold text-foreground mb-1">Acompanhe pelo WhatsApp</p>
                <p className="text-muted-foreground leading-relaxed">
                  Assim que nosso time iniciar a <strong className="text-foreground">separação</strong>, você recebe um aviso.
                  Quando o pedido estiver <strong className="text-foreground">pronto para retirada</strong>, te avisamos novamente.
                </p>
              </div>
            </div>
          )}

          {/* PICKUP INFO — reforçado quando pronto */}
          <div className={`rounded-xl border-2 p-5 mb-6 flex gap-4 ${isReady ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
            <div className={`shrink-0 h-11 w-11 rounded-full flex items-center justify-center ${isReady ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary"}`}>
              <Store className="h-5 w-5" />
            </div>
            <div className="text-sm flex-1">
              <p className="font-bold text-foreground mb-1">
                {isReady ? "Retire seu pedido na loja" : "Retirada na loja"}
              </p>
              <p className="text-foreground font-semibold">{STORE_ADDRESS}</p>
              <p className="text-muted-foreground inline-flex items-center gap-1.5 mt-1">
                <Clock className="h-3.5 w-3.5" /> {STORE_HOURS}
              </p>
              {isPaid && !isDone && !isCancelled && (
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-accent bg-accent/10 px-3 py-2 rounded">
                  ⏰ Você tem até 5 dias para retirar o produto na loja.
                </p>
              )}
            </div>
          </div>

          {/* ORDER DETAILS */}
          {isLoading ? (
            <div className="bg-card border border-border rounded-xl p-6 animate-pulse h-40" />
          ) : data?.order ? (
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold uppercase text-xs tracking-wider text-muted-foreground">Itens do pedido</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary px-2 py-1 rounded">
                  {isPaid ? "Pago" : isCancelled ? "Cancelado" : "Aguardando pagamento"}
                </span>
              </div>

              <ul className="space-y-2 text-sm">
                {data.items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-2 py-1">
                    <span className="text-foreground"><span className="text-muted-foreground">{it.quantity}×</span> {it.product_name}</span>
                    <span className="font-semibold whitespace-nowrap">{brl(Number(it.unit_price) * it.quantity)}</span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-border pt-4 flex justify-between items-baseline">
                <span className="font-bold">{isPaid ? "Total pago" : "Total"}</span>
                <span className="display text-2xl text-price">{brl(Number(data.order.total))}</span>
              </div>

              <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-4">
                <div><strong className="text-foreground">Cliente:</strong> {data.order.customer_name}</div>
                {data.order.customer_email && <div><strong className="text-foreground">Email:</strong> {data.order.customer_email}</div>}
                {data.order.customer_phone && <div><strong className="text-foreground">WhatsApp:</strong> {data.order.customer_phone}</div>}
                <div><strong className="text-foreground">Pagamento:</strong> {data.order.payment_method.toUpperCase()}</div>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              Seu pedido foi registrado. Guarde o número <span className="font-mono font-bold">#{shortId}</span> para retirar na loja.
            </div>
          )}

          <div className="text-center mt-8">
            <Link
              to="/loja"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-6 py-3 rounded-md shadow-deal hover:scale-[1.02] transition-transform"
            >
              Continuar comprando <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
