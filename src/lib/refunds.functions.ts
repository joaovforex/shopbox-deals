import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RefundInput = {
  orderId: string;
  amount: number;
  reason: string;
  confirmText: string;
  customerConfirm: string;
  customerVerify: string;
  expectedCustomerName: string;
  expectedTotal: number;
  expectedMpPaymentId: string | null;
};

function digitsOnly(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

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
    if (typeof data.customerConfirm !== "string" || data.customerConfirm.trim().length < 2) {
      throw new Error("Confirme o nome do cliente");
    }
    if (typeof data.customerVerify !== "string" || !/^\d{4}$/.test(data.customerVerify)) {
      throw new Error("Confirme os 4 últimos dígitos do telefone ou CPF do cliente");
    }
    if (typeof data.expectedCustomerName !== "string" || data.expectedCustomerName.trim().length < 2) {
      throw new Error("Faltam dados de verificação do pedido (nome esperado)");
    }
    if (typeof data.expectedTotal !== "number" || !isFinite(data.expectedTotal) || data.expectedTotal <= 0) {
      throw new Error("Faltam dados de verificação do pedido (total esperado)");
    }
    return {
      orderId: data.orderId,
      amount: Math.round(data.amount * 100) / 100,
      reason: data.reason.trim(),
      customerConfirm: data.customerConfirm.trim().toLowerCase(),
      customerVerify: data.customerVerify,
      expectedCustomerName: data.expectedCustomerName.trim(),
      expectedTotal: Math.round(data.expectedTotal * 100) / 100,
      expectedMpPaymentId: data.expectedMpPaymentId ?? null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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
      .select("id,status,total,mp_payment_id,refund_status,customer_name,customer_phone,customer_email,customer_cpf,payment_method,created_at")
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

    // ============================================================
    // BLINDAGEM ANTI-REEMBOLSO-NO-CLIENTE-ERRADO
    // Cliente envia o que está visível na tela. Se qualquer um dos
    // campos esperados não bater com o pedido real no DB, ABORTAR.
    // ============================================================
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const realName = normalize(order.customer_name ?? "");
    const expectedName = normalize(data.expectedCustomerName);
    if (realName !== expectedName) {
      console.error("[refund] ABORT: expectedCustomerName mismatch", {
        orderId: order.id, expected: data.expectedCustomerName, actual: order.customer_name, operator: userId,
      });
      throw new Error(
        `Inconsistência detectada: a tela mostrava "${data.expectedCustomerName}" mas o pedido no banco é de "${order.customer_name}". Reembolso ABORTADO. Recarregue a página e tente novamente.`,
      );
    }
    const realTotal = Math.round(Number(order.total) * 100) / 100;
    if (Math.abs(realTotal - data.expectedTotal) > 0.01) {
      console.error("[refund] ABORT: expectedTotal mismatch", {
        orderId: order.id, expected: data.expectedTotal, actual: realTotal, operator: userId,
      });
      throw new Error(
        `Inconsistência detectada: a tela mostrava total ${data.expectedTotal} mas o pedido no banco é ${realTotal}. Reembolso ABORTADO.`,
      );
    }
    if (data.expectedMpPaymentId && data.expectedMpPaymentId !== order.mp_payment_id) {
      console.error("[refund] ABORT: expectedMpPaymentId mismatch", {
        orderId: order.id, expected: data.expectedMpPaymentId, actual: order.mp_payment_id, operator: userId,
      });
      throw new Error(`Inconsistência detectada no ID de pagamento. Reembolso ABORTADO.`);
    }

    // Operador deve digitar primeiro nome do cliente
    const normConf = data.customerConfirm.replace(/\s+/g, " ");
    const namesMatch =
      realName === normConf ||
      realName.startsWith(normConf) ||
      realName.split(" ")[0] === normConf.split(" ")[0];
    if (!namesMatch) {
      throw new Error(
        `Nome confirmado ("${data.customerConfirm}") não corresponde ao cliente do pedido ("${order.customer_name}"). Reembolso ABORTADO.`,
      );
    }

    // Operador deve digitar os 4 últimos dígitos do telefone OU CPF do cliente.
    // Isso garante que ela está olhando para o cliente certo, não apenas clicou
    // numa linha de tabela que pode ter mudado de posição por refetch.
    const phoneDigits = digitsOnly(order.customer_phone);
    const cpfDigits = digitsOnly(order.customer_cpf);
    const verifyMatches =
      (phoneDigits.length >= 4 && phoneDigits.slice(-4) === data.customerVerify) ||
      (cpfDigits.length >= 4 && cpfDigits.slice(-4) === data.customerVerify);
    if (!verifyMatches) {
      console.error("[refund] ABORT: customerVerify mismatch", {
        orderId: order.id, operator: userId,
      });
      throw new Error(
        "Os 4 dígitos não conferem com o telefone nem com o CPF deste pedido. Reembolso ABORTADO.",
      );
    }

    const total = Number(order.total);
    if (data.amount > total + 0.001) throw new Error(`Valor maior que o total do pedido (${total})`);
    const isFull = Math.abs(total - data.amount) < 0.01;

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_name,variant_color,quantity,unit_price")
      .eq("order_id", order.id);

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

    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const operatorName = prof?.full_name || "—";
    const mpRefundId = String(mpJson?.id ?? "");

    const itemsSnapshot = (items ?? []).map((it: any) => ({
      name: it.product_name,
      color: it.variant_color,
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
    }));

    // Grava o histórico de reembolso ANTES de remover o pedido.
    const { error: insErr } = await supabaseAdmin.from("refunds").insert({
      order_id: order.id,
      mp_payment_id: order.mp_payment_id,
      mp_refund_id: mpRefundId,
      amount: data.amount,
      is_full: isFull,
      reason: data.reason,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      customer_phone: order.customer_phone,
      customer_cpf: order.customer_cpf,
      payment_method: order.payment_method,
      order_total: total,
      order_created_at: order.created_at,
      items: itemsSnapshot,
      operator_id: userId,
      operator_name: operatorName,
    });
    if (insErr) {
      console.error("[refund] failed to log refund history", insErr);
      throw new Error("Estorno feito no MP mas falhou ao registrar histórico: " + insErr.message);
    }

    console.log("[refund] success", {
      orderId: order.id,
      customer: order.customer_name,
      amount: data.amount,
      full: isFull,
      operator: operatorName,
      mpRefundId,
    });

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
      refundId: mpRefundId,
      amount: data.amount,
      full: isFull,
      removed: true,
      receipt: {
        orderId: order.id,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        customerEmail: order.customer_email,
        paymentMethod: order.payment_method,
        orderTotal: total,
        refundedAmount: data.amount,
        isFull,
        reason: data.reason,
        operatorName,
        refundedAt: new Date().toISOString(),
        mpRefundId,
        items: itemsSnapshot,
      },
    };
  });

export type RefundHistoryRow = {
  id: string;
  order_id: string;
  mp_refund_id: string | null;
  amount: number;
  is_full: boolean;
  reason: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_cpf: string | null;
  payment_method: string | null;
  order_total: number | null;
  order_created_at: string | null;
  items: { name: string; color: string | null; quantity: number; unitPrice: number }[];
  operator_name: string | null;
  created_at: string;
};

export const listRefunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RefundHistoryRow[]> => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode ver reembolsos");

    const { data, error } = await supabase
      .from("refunds")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Falha ao listar reembolsos: " + error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      mp_refund_id: r.mp_refund_id,
      amount: Number(r.amount),
      is_full: !!r.is_full,
      reason: r.reason,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      customer_phone: r.customer_phone,
      customer_cpf: r.customer_cpf,
      payment_method: r.payment_method,
      order_total: r.order_total != null ? Number(r.order_total) : null,
      order_created_at: r.order_created_at,
      items: Array.isArray(r.items) ? r.items : [],
      operator_name: r.operator_name,
      created_at: r.created_at,
    }));
  });
