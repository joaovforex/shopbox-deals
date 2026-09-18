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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: oerr } = await supabaseAdmin
      .from("orders")
      .select("id,status,total,mp_payment_id,cielo_payment_id,asaas_payment_id,payment_provider,refund_status,customer_name,customer_phone,customer_email,customer_cpf,payment_method,created_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oerr) throw new Error("Falha ao buscar pedido");
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "paid") throw new Error("Apenas pedidos pagos podem ser reembolsados");
    if (order.refund_status === "refunded" || order.refund_status === "partially_refunded") {
      throw new Error("Pedido já reembolsado");
    }

    const provider = (order as { payment_provider?: string }).payment_provider ?? "asaas";
    const asaasPaymentId = (order as { asaas_payment_id?: string | null }).asaas_payment_id;
    const cieloPaymentId = (order as { cielo_payment_id?: string | null }).cielo_payment_id;
    const mpPaymentId = (order as { mp_payment_id?: string | null }).mp_payment_id;

    // Mercado Pago é o gateway ativo: estorno REAL via API (devolução), síncrono.
    // Cielo (pedidos anteriores) usa void com fila de retentativa.
    // Asaas (pedidos antigos) usa a API da Asaas.
    // Sem nenhum ID de gateway → reembolso manual (histórico apenas).
    const useCieloApi = !!cieloPaymentId;
    const useAsaasApi = !useCieloApi && !!asaasPaymentId;
    const useMpApi = !useCieloApi && !useAsaasApi && provider === "mercadopago" && !!mpPaymentId;
    const isManualLegacy = !useCieloApi && !useAsaasApi && !useMpApi;

    if (useAsaasApi && !process.env.ASAAS_API_KEY) {
      throw new Error("Asaas não configurado");
    }
    if (useMpApi && !process.env.MP_ACCESS_TOKEN) {
      throw new Error("Mercado Pago não configurado");
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

    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const operatorName = prof?.full_name || "—";

    const itemsSnapshot = (items ?? []).map((it: any) => ({
      name: it.product_name,
      color: it.variant_color,
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
    }));

    let providerRefundId = "";
    // A devolução Pix na Asaas é ASSÍNCRONA: ela nasce PENDING/AWAITING_* e
    // pode ser CANCELADA depois pelo banco do cliente. Só "DONE" é dinheiro
    // devolvido. Guardamos o status real para nunca mais dar um estorno
    // cancelado como concluído.
    let refundStatus: "pending" | "confirmed" | "cancelled" | "manual" = "manual";
    let providerStatus: string | null = null;
    if (useCieloApi) {
      const { attemptCieloRefund } = await import("@/lib/cielo-refund.server");
      const outcome = await attemptCieloRefund({
        orderId: order.id,
        cieloPaymentId: cieloPaymentId as string,
        amount: data.amount,
        isFull,
        reason: data.reason,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        customerPhone: order.customer_phone,
        customerCpf: order.customer_cpf,
        paymentMethod: order.payment_method,
        orderTotal: total,
        orderCreatedAt: order.created_at,
        items: itemsSnapshot,
        operatorId: userId,
        operatorName,
      });
      if (!outcome.ok) {
        if (outcome.queued) {
          // Fila criada: o cron vai retentar sozinho (Cielo libera saldo em D+1).
          return {
            ok: true,
            queued: true as const,
            refundId: null,
            amount: data.amount,
            full: isFull,
            removed: false,
            receipt: null,

            message:
              "A Cielo ainda não pôde processar o estorno agora" +
              (outcome.insufficientBalance ? " (saldo insuficiente — normal em D+0)" : "") +
              `. O sistema vai retentar automaticamente até concluir. Motivo: ${outcome.error}`,
          };
        }
        throw new Error(`Falha no estorno Cielo: ${outcome.error}`);
      }
      providerRefundId = outcome.refundId;
      providerStatus = "Voided";
      refundStatus = "confirmed";
    } else if (useAsaasApi) {

      try {
        const { refundPayment, mapRefundStatus } = await import("@/lib/asaas.server");
        const refund = await refundPayment(
          asaasPaymentId as string,
          isFull ? undefined : data.amount,
          data.reason,
        );
        providerRefundId = refund.id;
        providerStatus = refund.status;
        refundStatus = mapRefundStatus(refund.status);
        if (refundStatus === "cancelled") {
          throw new Error(
            "A Asaas recusou/cancelou a devolução imediatamente. Faça o Pix manual para o cliente.",
          );
        }
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : "Falha no estorno";
        console.error("[refund] Asaas API error", {
          orderId: order.id, asaasPaymentId, rawMsg,
        });
        if (/not.?found|não encontrad/i.test(rawMsg)) {
          throw new Error(
            `A cobrança ${asaasPaymentId} não foi encontrada na sua conta Asaas. ` +
            `Faça o estorno manualmente via Pix e depois use "Reembolso manual" no admin.`,
          );
        }
        throw new Error(`Falha no estorno: ${rawMsg}`);
      }
    } else if (useMpApi) {
      // Mercado Pago: devolução REAL via API (síncrona). Pix e cartão voltam
      // pro cliente; MP costuma responder status "approved" na hora.
      try {
        const { refundPayment: mpRefund } = await import("@/lib/mercadopago.server");
        const refund = await mpRefund(mpPaymentId as string, isFull ? undefined : data.amount);
        providerRefundId = refund.id || `mp-refund-${Date.now()}`;
        providerStatus = refund.status;
        refundStatus = refund.status === "approved" ? "confirmed" : "pending";
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : "Falha no estorno";
        console.error("[refund] Mercado Pago API error", {
          orderId: order.id, mpPaymentId, rawMsg,
        });
        throw new Error(
          `Falha no estorno pelo Mercado Pago: ${rawMsg}. ` +
          `Verifique o pagamento no painel do MP; se precisar, faça o Pix manual ao cliente e registre como reembolso manual.`,
        );
      }
    } else if (isManualLegacy) {
      // Sem ID de gateway (pedido muito antigo): registra reembolso manual.
      // O operador devolve o dinheiro por fora (Pix/transferência).
      providerRefundId = `manual-${provider}-${Date.now()}`;
      refundStatus = "manual";
      console.log("[refund] manual legacy refund", {
        orderId: order.id, provider, amount: data.amount, operator: operatorName,
      });
    }


    const mpRefundId = providerRefundId;


    // Grava o histórico de reembolso ANTES de remover o pedido.
    const { error: insErr } = await supabaseAdmin.from("refunds").insert({
      order_id: order.id,
      mp_payment_id: order.mp_payment_id,
      mp_refund_id: mpRefundId,
      provider,
      provider_payment_id: cieloPaymentId ?? asaasPaymentId ?? order.mp_payment_id ?? null,
      provider_status: providerStatus,
      status: refundStatus,
      confirmed_at: refundStatus === "confirmed" || refundStatus === "manual" ? new Date().toISOString() : null,
      last_checked_at: new Date().toISOString(),
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
      queued: false as const,
      message: null,
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
  status: string;
  provider_status: string | null;
  provider_payment_id: string | null;
  failure_reason: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
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
      status: r.status ?? "confirmed",
      provider_status: r.provider_status ?? null,
      provider_payment_id: r.provider_payment_id ?? null,
      failure_reason: r.failure_reason ?? null,
      confirmed_at: r.confirmed_at ?? null,
      cancelled_at: r.cancelled_at ?? null,
    }));
  });

// ============================================================
// Acompanhamento do estado real do estorno na Asaas
// ============================================================

/** Reconsulta a Asaas e atualiza o status dos reembolsos ainda pendentes. */
export const syncRefundStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode sincronizar reembolsos");
    const { syncPendingRefunds } = await import("@/lib/refund-sync.server");
    return await syncPendingRefunds();
  });

/** Reenvia um estorno que a Asaas cancelou (dinheiro voltou para o saldo). */
export const resendRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { refundId: string }) => {
    if (!data?.refundId || typeof data.refundId !== "string") throw new Error("ID inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode reenviar estorno");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("refunds")
      .select("id,amount,is_full,reason,status,provider_payment_id")
      .eq("id", data.refundId)
      .maybeSingle();
    const r = row as {
      id: string; amount: number; is_full: boolean; reason: string;
      status: string; provider_payment_id: string | null;
    } | null;
    if (!r) throw new Error("Reembolso não encontrado");
    if (r.status === "confirmed") throw new Error("Este estorno já foi concluído");
    if (!r.provider_payment_id) throw new Error("Estorno sem cobrança na Asaas — faça o Pix manual");

    const { refundPayment, mapRefundStatus } = await import("@/lib/asaas.server");
    const refund = await refundPayment(
      r.provider_payment_id,
      r.is_full ? undefined : Number(r.amount),
      `Reenvio de estorno: ${r.reason}`.slice(0, 255),
    );
    const status = mapRefundStatus(refund.status);
    await supabaseAdmin
      .from("refunds")
      .update({
        mp_refund_id: refund.id,
        provider_status: refund.status,
        status,
        failure_reason: null,
        cancelled_at: null,
        confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
        last_checked_at: new Date().toISOString(),
      } as never)
      .eq("id", r.id);
    return { ok: true, status, providerStatus: refund.status };
  });

// ============================================================
// Verificação pós-estorno
// ============================================================

export type CieloRefundQueueRow = {
  id: string;
  order_id: string;
  cielo_payment_id: string;
  amount: number;
  is_full: boolean;
  reason: string;
  customer_name: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_error: string | null;
  last_error_code: string | null;
  completed_at: string | null;
  created_at: string;
};

export const listCieloRefundQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CieloRefundQueueRow[]> => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode ver a fila de reembolsos");

    const { data, error } = await supabase
      .from("cielo_refund_queue")
      .select("id,order_id,cielo_payment_id,amount,is_full,reason,customer_name,status,attempts,max_attempts,next_attempt_at,last_attempt_at,last_error,last_error_code,completed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Falha ao listar fila: " + error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      cielo_payment_id: r.cielo_payment_id,
      amount: Number(r.amount),
      is_full: !!r.is_full,
      reason: r.reason,
      customer_name: r.customer_name,
      status: r.status,
      attempts: r.attempts,
      max_attempts: r.max_attempts,
      next_attempt_at: r.next_attempt_at,
      last_attempt_at: r.last_attempt_at,
      last_error: r.last_error,
      last_error_code: r.last_error_code,
      completed_at: r.completed_at,
      created_at: r.created_at,
    }));
  });

// Força uma tentativa imediata (admin clica "Tentar agora")
export const retryCieloRefundNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { queueId: string }) => {
    if (!data?.queueId || typeof data.queueId !== "string") throw new Error("ID inválido");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode retentar reembolso");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Agenda para agora e deixa o processador rodar
    const { error: upErr } = await supabaseAdmin
      .from("cielo_refund_queue")
      .update({ next_attempt_at: new Date().toISOString(), status: "pending" })
      .eq("id", data.queueId)
      .in("status", ["pending", "failed"]);
    if (upErr) throw new Error("Falha ao agendar: " + upErr.message);

    const { processCieloRefundQueue } = await import("@/lib/cielo-refund-queue.server");
    const result = await processCieloRefundQueue();
    return { ok: true, ...result };
  });

// ============================================================
// Verificação pós-estorno (original)

// Para cada refund, confirma:
//  - o pedido foi removido (fluxo padrão) OU não está mais em "cancelled"
//  - existe o registro em refunds (por definição, sim)
// Também retorna pedidos INCONSISTENTES: status='cancelled' + mp_payment_status='approved' + sem refund.
// ============================================================

export type RefundVerification = {
  orderId: string;
  refundId: string;
  orderExists: boolean;
  orderStatus: string | null;
  mpPaymentStatus: string | null;
  ok: boolean;
  issue: string | null;
};

export type InconsistentOrder = {
  id: string;
  customer_name: string | null;
  total: number;
  status: string;
  mp_payment_status: string | null;
  mp_payment_id: string | null;
  created_at: string;
};

export const getRefundConsistency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    verifications: RefundVerification[];
    inconsistent: InconsistentOrder[];
  }> => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode ver verificações");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Últimos 200 reembolsos
    const { data: refunds, error: rErr } = await supabaseAdmin
      .from("refunds")
      .select("id,order_id,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (rErr) throw new Error("Falha ao buscar reembolsos: " + rErr.message);

    const orderIds = Array.from(new Set((refunds ?? []).map((r: any) => r.order_id)));
    let ordersMap = new Map<string, { status: string | null; mp_payment_status: string | null }>();
    if (orderIds.length > 0) {
      const { data: os } = await supabaseAdmin
        .from("orders")
        .select("id,status,mp_payment_status")
        .in("id", orderIds);
      for (const o of os ?? []) {
        ordersMap.set(o.id, { status: o.status, mp_payment_status: o.mp_payment_status });
      }
    }

    const verifications: RefundVerification[] = (refunds ?? []).map((r: any) => {
      const o = ordersMap.get(r.order_id);
      const orderExists = !!o;
      const orderStatus = o?.status ?? null;
      const mpPaymentStatus = o?.mp_payment_status ?? null;
      let ok = true;
      let issue: string | null = null;
      if (orderExists && orderStatus === "cancelled" && mpPaymentStatus === "approved") {
        ok = false;
        issue = "Pedido continua como 'cancelled' mesmo com pagamento aprovado.";
      } else if (orderExists && orderStatus === "paid" && mpPaymentStatus === "approved") {
        ok = false;
        issue = "Pedido continua como 'paid' após estorno — investigue.";
      }
      return {
        orderId: r.order_id,
        refundId: r.id,
        orderExists,
        orderStatus,
        mpPaymentStatus,
        ok,
        issue,
      };
    });

    // Pedidos inconsistentes: cancelled + approved + sem refund
    const { data: cancelled } = await supabaseAdmin
      .from("orders")
      .select("id,customer_name,total,status,mp_payment_status,mp_payment_id,created_at")
      .eq("status", "cancelled")
      .eq("mp_payment_status", "approved")
      .order("created_at", { ascending: false })
      .limit(200);

    const inconsistent: InconsistentOrder[] = [];
    for (const o of cancelled ?? []) {
      const { count } = await supabaseAdmin
        .from("refunds")
        .select("id", { count: "exact", head: true })
        .eq("order_id", o.id);
      if (!count || count === 0) {
        inconsistent.push({
          id: o.id,
          customer_name: o.customer_name,
          total: Number(o.total),
          status: o.status,
          mp_payment_status: o.mp_payment_status,
          mp_payment_id: o.mp_payment_id,
          created_at: o.created_at,
        });
      }
    }

    return { verifications, inconsistent };
  });

// ============================================================
// Reintegrar pedido cancelado como pago (quando o cliente foi
// de fato debitado e o pedido precisa ir para expedição em vez
// de reembolso). Como o cancelamento anterior já devolveu o
// estoque via trigger restore_stock_on_cancel, precisamos
// re-decrementar aqui para não vender duas vezes o mesmo item.
// ============================================================
export const reinstateOrderAsPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; confirmText: string }) => {
    if (!data?.orderId || typeof data.orderId !== "string" || data.orderId.length < 10) {
      throw new Error("Pedido inválido");
    }
    if (data.confirmText !== "CONFIRMAR PAGAMENTO") {
      throw new Error('Digite "CONFIRMAR PAGAMENTO" para prosseguir');
    }
    return { orderId: data.orderId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode reintegrar pedidos");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: oerr } = await supabaseAdmin
      .from("orders")
      .select("id,status,stock_restored_at,mp_payment_status,mp_payment_id,customer_name,total")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oerr) throw new Error("Falha ao buscar pedido");
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "cancelled") {
      throw new Error(`Pedido não está cancelado (status atual: ${order.status})`);
    }
    if (order.mp_payment_status !== "approved") {
      throw new Error("Pedido não tem pagamento aprovado no Mercado Pago");
    }

    const { count: refundCount } = await supabaseAdmin
      .from("refunds")
      .select("id", { count: "exact", head: true })
      .eq("order_id", order.id);
    if (refundCount && refundCount > 0) {
      throw new Error("Este pedido já tem reembolso registrado — não pode ser reintegrado como pago");
    }

    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const operatorName = prof?.full_name || "—";

    // Se o cancelamento já devolveu o estoque, precisamos removê-lo novamente
    // para refletir o compromisso do pedido reintegrado. Sem isso, o produto
    // aparece disponível na loja e pode ser vendido em dobro.
    const stockDecrements: { productId: string; qty: number }[] = [];
    if (order.stock_restored_at) {
      const { data: items, error: itErr } = await supabaseAdmin
        .from("order_items")
        .select("product_id,quantity")
        .eq("order_id", order.id);
      if (itErr) throw new Error("Falha ao ler itens do pedido: " + itErr.message);
      for (const it of items ?? []) {
        const pid = it.product_id as string | null;
        const qty = Number(it.quantity ?? 0);
        if (!pid || qty <= 0) continue;
        const { data: prod, error: pErr } = await supabaseAdmin
          .from("products")
          .select("stock")
          .eq("id", pid)
          .maybeSingle();
        if (pErr) throw new Error("Falha ao ler estoque: " + pErr.message);
        const current = Number(prod?.stock ?? 0);
        const next = Math.max(0, current - qty);
        const { error: uErr } = await supabaseAdmin
          .from("products")
          .update({ stock: next })
          .eq("id", pid);
        if (uErr) throw new Error("Falha ao ajustar estoque: " + uErr.message);
        stockDecrements.push({ productId: pid, qty });
      }
    }

    const { error: upErr } = await supabaseAdmin
      .from("orders")
      .update({
        status: "paid",
        fulfillment_status: "pending",
        stock_restored_at: null,
      })
      .eq("id", order.id);
    if (upErr) throw new Error("Falha ao reintegrar pedido: " + upErr.message);

    console.log("[reinstate] order moved back to paid", {
      orderId: order.id,
      customer: order.customer_name,
      total: order.total,
      mpPaymentId: order.mp_payment_id,
      operator: operatorName,
      stockDecrements,
    });

    return { ok: true, orderId: order.id, stockDecrements };
  });


// ============================================================
// Estorno automático da Cielo ao CANCELAR/EXCLUIR um pedido pago
// ============================================================

/**
 * Chamado antes de cancelar/excluir um pedido no admin.
 * Se o pedido está pago na Cielo e ainda não foi estornado, dispara o void
 * real (dinheiro volta ao cliente). Se a Cielo recusar (ex.: saldo
 * insuficiente em D+0), enfileira a retentativa automática e BLOQUEIA a
 * exclusão até o estorno concluir.
 */
export const refundCieloOnCancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; reason?: string }) => {
    if (!data?.orderId || typeof data.orderId !== "string") throw new Error("Pedido inválido");
    return { orderId: data.orderId, reason: (data.reason ?? "Pedido cancelado pelo lojista").slice(0, 500) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode cancelar com estorno");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,status,total,cielo_payment_id,mp_payment_id,payment_provider,payment_method,refund_status,customer_name,customer_email,customer_phone,customer_cpf,created_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");

    const o = order as any;
    const cieloPaymentId: string | null = o.cielo_payment_id ?? null;
    const mpPaymentId: string | null = o.mp_payment_id ?? null;
    const provider: string = o.payment_provider ?? "cielo";
    const alreadyRefunded = o.refund_status === "refunded" || o.refund_status === "partially_refunded";

    const canCielo = o.status === "paid" && !!cieloPaymentId && !alreadyRefunded;
    const canMp =
      o.status === "paid" && !cieloPaymentId && provider === "mercadopago" && !!mpPaymentId && !alreadyRefunded;

    if (!canCielo && !canMp) {
      return { skipped: true as const, refunded: false, queued: false, message: null as string | null };
    }

    const total = Number(o.total);
    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_name,variant_color,quantity,unit_price")
      .eq("order_id", o.id);
    const itemsSnapshot = (items ?? []).map((it: any) => ({
      name: it.product_name,
      color: it.variant_color,
      quantity: it.quantity,
      unitPrice: Number(it.unit_price),
    }));
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
    const operatorName = prof?.full_name || "—";

    // ---- Mercado Pago (gateway ativo): devolução total síncrona ----
    if (canMp) {
      if (!process.env.MP_ACCESS_TOKEN) throw new Error("Mercado Pago não configurado");
      let mpRefundId = "";
      let mpStatus = "approved";
      try {
        const { refundPayment: mpRefund } = await import("@/lib/mercadopago.server");
        const refund = await mpRefund(mpPaymentId as string); // total
        mpRefundId = refund.id || `mp-refund-${Date.now()}`;
        mpStatus = refund.status;
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : "Falha no estorno";
        console.error("[refund] MP cancel refund error", { orderId: o.id, mpPaymentId, rawMsg });
        throw new Error(
          `Falha ao estornar no Mercado Pago: ${rawMsg}. O pedido NÃO foi excluído. ` +
          `Verifique no painel do MP; se necessário, faça o Pix manual.`,
        );
      }

      await supabaseAdmin.from("refunds").insert({
        order_id: o.id,
        mp_payment_id: mpPaymentId,
        mp_refund_id: mpRefundId,
        provider: "mercadopago",
        provider_payment_id: mpPaymentId,
        provider_status: mpStatus,
        status: mpStatus === "approved" ? "confirmed" : "pending",
        confirmed_at: mpStatus === "approved" ? new Date().toISOString() : null,
        last_checked_at: new Date().toISOString(),
        amount: total,
        is_full: true,
        reason: data.reason,
        customer_name: o.customer_name,
        customer_email: o.customer_email,
        customer_phone: o.customer_phone,
        customer_cpf: o.customer_cpf,
        payment_method: o.payment_method,
        order_total: total,
        order_created_at: o.created_at,
        items: itemsSnapshot,
        operator_id: userId,
        operator_name: operatorName,
      } as never);

      await supabaseAdmin
        .from("orders")
        .update({
          refund_status: "refunded",
          refunded_at: new Date().toISOString(),
          refunded_amount: total,
          refund_reason: data.reason,
          refunded_by: userId,
          refunded_by_name: operatorName,
        } as never)
        .eq("id", o.id);

      return {
        skipped: false as const,
        refunded: true,
        queued: false,
        message: `Estorno de R$ ${total.toFixed(2)} enviado ao Mercado Pago — o dinheiro volta ao cliente.`,
      };
    }

    const { attemptCieloRefund } = await import("@/lib/cielo-refund.server");
    const outcome = await attemptCieloRefund({
      orderId: o.id,
      cieloPaymentId: cieloPaymentId as string,
      amount: total,
      isFull: true,
      reason: data.reason,
      customerName: o.customer_name,
      customerEmail: o.customer_email,
      customerPhone: o.customer_phone,
      customerCpf: o.customer_cpf,
      paymentMethod: o.payment_method,
      orderTotal: total,
      orderCreatedAt: o.created_at,
      items: itemsSnapshot,
      operatorId: userId,
      operatorName,
    });

    if (!outcome.ok) {
      if (outcome.queued) {
        return {
          skipped: false as const,
          refunded: false,
          queued: true,
          message:
            "Estorno na Cielo enfileirado — o sistema vai retentar automaticamente até o dinheiro voltar ao cliente. " +
            "O pedido NÃO foi excluído para não perder o vínculo do estorno.",
        };
      }
      throw new Error(`Falha ao estornar na Cielo: ${outcome.error}`);
    }

    await supabaseAdmin.from("refunds").insert({
      order_id: o.id,
      mp_payment_id: o.mp_payment_id,
      mp_refund_id: outcome.refundId,
      provider: o.payment_provider ?? "cielo",
      provider_payment_id: cieloPaymentId,
      provider_status: "Voided",
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
      amount: total,
      is_full: true,
      reason: data.reason,
      customer_name: o.customer_name,
      customer_email: o.customer_email,
      customer_phone: o.customer_phone,
      customer_cpf: o.customer_cpf,
      payment_method: o.payment_method,
      order_total: total,
      order_created_at: o.created_at,
      items: itemsSnapshot,
      operator_id: userId,
      operator_name: operatorName,
    } as never);

    await supabaseAdmin
      .from("orders")
      .update({
        refund_status: "refunded",
        refunded_at: new Date().toISOString(),
        refunded_amount: total,
        refund_reason: data.reason,
        refunded_by: userId,
        refunded_by_name: operatorName,
      } as never)
      .eq("id", o.id);

    return {
      skipped: false as const,
      refunded: true,
      queued: false,
      message: `Estorno de R$ ${total.toFixed(2)} enviado à Cielo — o dinheiro volta ao cliente.`,
    };
  });
