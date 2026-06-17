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

    console.log("[refund] success", {
      orderId: order.id,
      customer: order.customer_name,
      amount: data.amount,
      full: isFull,
      reason: data.reason,
      operator: operatorName,
      mpRefundId: mpJson?.id,
    });

    // Remove o pedido COMPLETAMENTE para sair de todas as métricas
    const { error: delItemsErr } = await supabaseAdmin
      .from("order_items")
      .delete()
      .eq("order_id", order.id);
    if (delItemsErr) {
      throw new Error("Estorno feito no MP mas falhou ao remover itens do pedido: " + delItemsErr.message);
    }
    const { error: delOrderErr } = await supabaseAdmin
      .from("orders")
      .delete()
      .eq("id", order.id);
    if (delOrderErr) {
      throw new Error("Estorno feito no MP mas falhou ao remover pedido: " + delOrderErr.message);
    }

    return {
      ok: true,
      refundId: String(mpJson?.id ?? ""),
      amount: data.amount,
      full: isFull,
      removed: true,
    };
  });
