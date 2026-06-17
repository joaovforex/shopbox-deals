import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RefundInput = {
  orderId: string;
  amount: number;
  reason: string;
  confirmText: string;
};

export const refundOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: RefundInput) => {
    if (!data || typeof data !== "object") throw new Error("Payload inválido");
    if (typeof data.orderId !== "string" || data.orderId.length < 10) throw new Error("Pedido inválido");
    if (typeof data.amount !== "number" || !isFinite(data.amount) || data.amount <= 0) throw new Error("Valor inválido");
    if (typeof data.reason !== "string" || data.reason.trim().length < 5 || data.reason.length > 500) {
      throw new Error("Informe um motivo (mín. 5, máx. 500 caracteres)");
    }
    if (data.confirmText !== "REEMBOLSAR") throw new Error('Digite "REEMBOLSAR" para confirmar');
    return { orderId: data.orderId, amount: Math.round(data.amount * 100) / 100, reason: data.reason.trim() };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // SUPERADMIN check (role 'admin')
    const { data: isSuper, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error("Falha ao validar permissão");
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode emitir reembolso");

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: oerr } = await supabaseAdmin
      .from("orders")
      .select("id,status,total,mp_payment_id,refund_status,customer_name")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oerr) throw new Error("Falha ao buscar pedido");
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "paid") throw new Error("Apenas pedidos pagos podem ser reembolsados");
    if (order.refund_status === "refunded" || order.refund_status === "partially_refunded") {
      throw new Error("Pedido já reembolsado");
    }
    if (!order.mp_payment_id) {
      throw new Error("Pedido sem pagamento Mercado Pago associado — estorne manualmente");
    }

    const total = Number(order.total);
    if (data.amount > total + 0.001) throw new Error(`Valor maior que o total do pedido (${total})`);
    const isFull = Math.abs(total - data.amount) < 0.01;

    // Call Mercado Pago refund API
    const idempotencyKey = `refund-${order.id}-${Date.now()}`;
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${order.mp_payment_id}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: isFull ? JSON.stringify({}) : JSON.stringify({ amount: data.amount }),
    });
    const mpJson: any = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      const msg = mpJson?.message || mpJson?.error || `Mercado Pago retornou ${mpRes.status}`;
      throw new Error(`Falha no estorno: ${msg}`);
    }

    // Resolve operator name
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const operatorName = prof?.full_name || null;

    const refundStatus = isFull ? "refunded" : "partially_refunded";
    const { error: uerr } = await supabaseAdmin
      .from("orders")
      .update({
        refunded_at: new Date().toISOString(),
        refunded_amount: data.amount,
        refund_reason: data.reason,
        refunded_by: userId,
        refunded_by_name: operatorName,
        mp_refund_id: String(mpJson?.id ?? ""),
        refund_status: refundStatus,
        status: isFull ? "refunded" : order.status,
      })
      .eq("id", order.id);
    if (uerr) throw new Error("Estorno feito no MP mas falhou ao atualizar pedido: " + uerr.message);

    return {
      ok: true,
      refundId: String(mpJson?.id ?? ""),
      amount: data.amount,
      full: isFull,
    };
  });
