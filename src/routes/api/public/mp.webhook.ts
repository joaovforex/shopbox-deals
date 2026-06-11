import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const url = new URL(request.url);

        const dataId =
          url.searchParams.get("data.id") ??
          (() => {
            try {
              return (JSON.parse(rawBody) as { data?: { id?: string | number } })?.data?.id?.toString() ?? "";
            } catch {
              return "";
            }
          })();

        const type = url.searchParams.get("type") ?? (() => {
          try {
            return (JSON.parse(rawBody) as { type?: string })?.type ?? "";
          } catch {
            return "";
          }
        })();

        // O botão "Testar" do Mercado Pago costuma enviar um ID fictício.
        // Aceitamos só como health-check, sem processar pedido nem consultar APIs.
        if (type === "payment" && dataId === "123456") {
          console.info("[mp:webhook] mercado pago test notification accepted");
          return new Response("ok", { status: 200 });
        }

        const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
        if (!accessToken || !webhookSecret) {
          console.error("[mp:webhook] missing env");
          return new Response("config", { status: 500 });
        }

        // Mercado Pago manifesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
        const xSignature = request.headers.get("x-signature") ?? "";
        const xRequestId = request.headers.get("x-request-id") ?? "";

        const sigParts = Object.fromEntries(
          xSignature.split(",").map((p) => {
            const [k, v] = p.split("=").map((s) => s.trim());
            return [k, v ?? ""];
          }),
        );
        const ts = sigParts["ts"];
        const v1 = sigParts["v1"];

        if (!ts || !v1 || !dataId) {
          console.warn("[mp:webhook] missing signature parts", { ts: !!ts, v1: !!v1, dataId: !!dataId });
          return new Response("bad signature", { status: 401 });
        }

        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        const expected = createHmac("sha256", webhookSecret).update(manifest).digest("hex");

        const a = Buffer.from(expected, "utf8");
        const b = Buffer.from(v1, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          console.warn("[mp:webhook] signature mismatch");
          return new Response("invalid signature", { status: 401 });
        }

        let payload: { type?: string; action?: string; data?: { id?: string | number } } = {};
        try {
          payload = JSON.parse(rawBody);
        } catch {
          // sometimes MP sends empty body and data via query
        }

        const eventType = payload.type ?? type;
        if (eventType !== "payment") {
          // Não processamos outros tipos por enquanto
          return new Response("ignored", { status: 200 });
        }

        // Busca detalhes do pagamento
        const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!payRes.ok) {
          console.error("[mp:webhook] fetch payment failed", payRes.status);
          return new Response("payment fetch failed", { status: 502 });
        }
        const payment = (await payRes.json()) as {
          id: number;
          status: string;
          external_reference?: string;
          payment_method_id?: string;
        };

        const orderId = payment.external_reference;
        if (!orderId) {
          console.warn("[mp:webhook] payment without external_reference");
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Mapeia status MP -> status da loja
        let newStatus: "paid" | "pending" | "cancelled" = "pending";
        if (payment.status === "approved") newStatus = "paid";
        else if (
          payment.status === "rejected" ||
          payment.status === "cancelled" ||
          payment.status === "refunded" ||
          payment.status === "charged_back"
        ) {
          newStatus = "cancelled";
        }

        // Não rebaixa um pedido já pago/cancelado
        const { data: current } = await supabaseAdmin
          .from("orders")
          .select("status")
          .eq("id", orderId)
          .maybeSingle();
        if (!current) {
          console.warn("[mp:webhook] order not found", orderId);
          return new Response("ok", { status: 200 });
        }
        if (current.status === "paid" || current.status === "cancelled") {
          return new Response("already finalized", { status: 200 });
        }

        const { error: updErr } = await supabaseAdmin
          .from("orders")
          .update({
            status: newStatus,
            mp_payment_id: String(payment.id),
          })
          .eq("id", orderId);
        if (updErr) {
          console.error("[mp:webhook] update error", updErr);
          return new Response("update failed", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
