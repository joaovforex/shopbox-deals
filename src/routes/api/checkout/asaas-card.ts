// Checkout TRANSPARENTE de cartão: o cliente digita o cartão no nosso site e
// nós enviamos direto para a API da Asaas (uma autorização só, sem carnê e sem
// redirecionamento para a fatura hospedada).
//
// HIGIENE: número do cartão e CVV existem apenas em memória durante o request.
// Nada de cartão é logado ou gravado — só o id da cobrança e o status.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type Body = {
  order_id?: string;
  installments?: number;
  card?: {
    holder_name?: string;
    number?: string;
    expiry_month?: string;
    expiry_year?: string;
    ccv?: string;
  };
  holder?: {
    postal_code?: string;
    address_number?: string;
  };
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** IP do dispositivo do cliente (primeiro IP do x-forwarded-for). */
function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return (
    first ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"
  );
}

export const Route = createFileRoute("/api/checkout/asaas-card")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) return json({ error: "Backend não configurado" }, 500);
          if (!process.env.ASAAS_API_KEY) return json({ error: "Pagamento não configurado" }, 500);

          const auth = request.headers.get("authorization") ?? "";
          if (!auth.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);
          const token = auth.slice(7);

          const supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: userData, error: userErr } = await supabase.auth.getUser(token);
          const userId = userData?.user?.id;
          if (userErr || !userId) return json({ error: "Sessão expirada" }, 401);

          const body = (await request.json().catch(() => null)) as Body | null;
          const orderId = (body?.order_id ?? "").trim();
          if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "Pedido inválido" }, 400);

          const cardNumber = (body?.card?.number ?? "").replace(/\D/g, "");
          const ccv = (body?.card?.ccv ?? "").replace(/\D/g, "");
          const holderName = (body?.card?.holder_name ?? "").trim();
          const expMonth = (body?.card?.expiry_month ?? "").replace(/\D/g, "");
          const expYearRaw = (body?.card?.expiry_year ?? "").replace(/\D/g, "");
          const expYear = expYearRaw.length === 2 ? `20${expYearRaw}` : expYearRaw;

          if (cardNumber.length < 13 || cardNumber.length > 19)
            return json({ error: "Número do cartão inválido" }, 400);
          if (ccv.length < 3 || ccv.length > 4) return json({ error: "CVV inválido" }, 400);
          if (holderName.length < 3) return json({ error: "Informe o nome impresso no cartão" }, 400);
          const monthNum = Number(expMonth);
          if (!(monthNum >= 1 && monthNum <= 12)) return json({ error: "Validade inválida" }, 400);
          if (expYear.length !== 4) return json({ error: "Validade inválida" }, 400);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: order, error: orderErr } = await supabaseAdmin
            .from("orders")
            .select(
              "id,user_id,status,total,customer_name,customer_email,customer_phone,customer_cpf,asaas_customer_id,asaas_payment_id,shipping_zip,shipping_number,shipping_street,shipping_complement,shipping_district,shipping_city,shipping_state",
            )
            .eq("id", orderId)
            .maybeSingle();
          if (orderErr) return json({ error: "Falha ao carregar pedido" }, 500);
          if (!order) return json({ error: "Pedido não encontrado" }, 404);
          const o = order as Record<string, string | number | null>;
          if (o.user_id && o.user_id !== userId) return json({ error: "Sem permissão" }, 403);
          if (o.status !== "pending")
            return json({ error: "Este pedido não está mais aguardando pagamento" }, 409);
          if (o.asaas_payment_id)
            return json({ error: "Já existe uma cobrança em andamento para este pedido" }, 409);

          const total = Number(o.total ?? 0);
          if (!(total >= 5)) return json({ error: "Valor inválido para pagamento com cartão" }, 400);

          const { findOrCreateCustomer, createTransparentCardPayment, isApprovedStatus } =
            await import("@/lib/asaas.server");
          const { maxInstallmentsFor } = await import("@/lib/installments");

          const installments = Math.max(
            1,
            Math.min(Math.floor(Number(body?.installments ?? 1)) || 1, maxInstallmentsFor(total)),
          );

          const customerId =
            (o.asaas_customer_id as string | null) ||
            (await findOrCreateCustomer({
              name: String(o.customer_name ?? "Cliente"),
              cpfCnpj: String(o.customer_cpf ?? ""),
              email: String(o.customer_email ?? ""),
              mobilePhone: String(o.customer_phone ?? ""),
              postalCode: (o.shipping_zip as string | null) ?? null,
              address: (o.shipping_street as string | null) ?? null,
              addressNumber: (o.shipping_number as string | null) ?? null,
              complement: (o.shipping_complement as string | null) ?? null,
              province: (o.shipping_district as string | null) ?? null,
              city: (o.shipping_city as string | null) ?? null,
              state: (o.shipping_state as string | null) ?? null,
            }));

          const postalCode =
            (body?.holder?.postal_code ?? "").replace(/\D/g, "") ||
            String(o.shipping_zip ?? "").replace(/\D/g, "");
          const addressNumber =
            (body?.holder?.address_number ?? "").trim() || String(o.shipping_number ?? "") || "S/N";
          if (postalCode.length !== 8) return json({ error: "Informe o CEP do titular do cartão" }, 400);

          let result: { id: string; status: string };
          try {
            result = await createTransparentCardPayment({
              customerId,
              value: total,
              externalReference: orderId,
              description: `Pedido shopbox ${orderId.slice(0, 8).toUpperCase()}`,
              installmentCount: installments,
              remoteIp: clientIp(request),
              card: {
                holderName,
                number: cardNumber,
                expiryMonth: expMonth,
                expiryYear: expYear,
                ccv,
              },
              holderInfo: {
                name: String(o.customer_name ?? holderName),
                email: String(o.customer_email ?? ""),
                cpfCnpj: String(o.customer_cpf ?? ""),
                postalCode,
                addressNumber,
                phone: String(o.customer_phone ?? ""),
              },
            });
          } catch (err) {
            // Recusa de captura / cartão inválido / conta sem cartão habilitado.
            const message = err instanceof Error ? err.message : "Pagamento recusado";
            console.warn("[asaas:card] charge failed", { orderId, message });
            await supabaseAdmin
              .from("orders")
              .update({
                asaas_customer_id: customerId,
                mp_payment_status: "rejected",
                mp_last_attempt_at: new Date().toISOString(),
              } as never)
              .eq("id", orderId);
            return json({ outcome: "refused", error: message }, 402);
          }

          const status = (result.status || "").toUpperCase();
          await supabaseAdmin
            .from("orders")
            .update({
              asaas_customer_id: customerId,
              asaas_payment_id: result.id,
              asaas_status: status,
              payment_provider: "asaas",
              mp_last_attempt_at: new Date().toISOString(),
            } as never)
            .eq("id", orderId);

          if (isApprovedStatus(status)) {
            const { data: confirmResult, error: confirmErr } = await supabaseAdmin.rpc(
              "confirm_order_paid" as never,
              { p_order_id: orderId, p_mp_payment_id: result.id } as never,
            );
            if (confirmErr) {
              console.error("[asaas:card] confirm_order_paid error", confirmErr);
              return json(
                {
                  outcome: "approved",
                  orderId,
                  warning: "Pagamento aprovado, mas houve um atraso ao liberar o pedido.",
                },
                200,
              );
            }
            await supabaseAdmin
              .from("orders")
              .update({ mp_payment_status: "approved" } as never)
              .eq("id", orderId);
            if (confirmResult === "ok" || confirmResult === "already_paid") {
              try {
                const { createDeliveryForOrder } = await import("@/lib/maisentregas.functions");
                await createDeliveryForOrder(orderId);
              } catch (err) {
                console.error("[asaas:card] maisentregas error", orderId, err);
              }
            }
            return json({ outcome: "approved", orderId });
          }

          if (status === "AWAITING_RISK_ANALYSIS") {
            return json({ outcome: "analysis", orderId });
          }

          if (status === "REPROVED_BY_RISK_ANALYSIS") {
            await supabaseAdmin
              .from("orders")
              .update({
                status: "cancelled",
                cancellation_reason: "asaas:REPROVED_BY_RISK_ANALYSIS",
                mp_payment_status: "rejected",
              } as never)
              .eq("id", orderId)
              .eq("status", "pending");
            return json(
              {
                outcome: "refused",
                error: "Pagamento não aprovado pela análise antifraude. Tente outro cartão ou pague com Pix.",
              },
              402,
            );
          }

          // Qualquer outro status (PENDING etc.) fica aguardando confirmação.
          return json({ outcome: "analysis", orderId });
        } catch (err) {
          console.error("[asaas:card] unexpected error", err);
          return json({ error: "Falha ao processar o pagamento. Tente novamente." }, 500);
        }
      },
    },
  },
});
