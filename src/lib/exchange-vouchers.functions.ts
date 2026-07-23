import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ExchangeItem = {
  itemId: string;
  quantity: number;
};

type CreateInput = {
  orderId: string;
  items: ExchangeItem[];
  reason: string;
  confirmText: string;
  customerConfirm: string;
  customerVerify: string;
  expectedCustomerName: string;
  expectedTotal: number;
  extraAmount?: number;
};

function digitsOnly(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

export const createExchangeVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateInput) => {
    if (!data || typeof data !== "object") throw new Error("Payload inválido");
    if (typeof data.orderId !== "string" || data.orderId.length < 10) throw new Error("Pedido inválido");
    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Selecione ao menos um item devolvido");
    for (const it of data.items) {
      if (!it || typeof it.itemId !== "string" || !Number.isFinite(it.quantity) || it.quantity <= 0) {
        throw new Error("Item inválido");
      }
    }
    if (typeof data.reason !== "string" || data.reason.trim().length < 5 || data.reason.length > 500) {
      throw new Error("Informe o motivo (mín. 5, máx. 500 caracteres)");
    }
    if (data.confirmText !== "VALE TROCA") throw new Error('Digite "VALE TROCA" para confirmar');
    if (typeof data.customerConfirm !== "string" || data.customerConfirm.trim().length < 2) {
      throw new Error("Confirme o nome do cliente");
    }
    if (typeof data.customerVerify !== "string" || !/^\d{4}$/.test(data.customerVerify)) {
      throw new Error("Confirme os 4 últimos dígitos do telefone ou CPF do cliente");
    }
    if (typeof data.expectedCustomerName !== "string" || data.expectedCustomerName.trim().length < 2) {
      throw new Error("Faltam dados de verificação");
    }
    if (typeof data.expectedTotal !== "number" || !Number.isFinite(data.expectedTotal) || data.expectedTotal <= 0) {
      throw new Error("Faltam dados de verificação");
    }
    return {
      orderId: data.orderId,
      items: data.items.map((i) => ({ itemId: i.itemId, quantity: Math.floor(i.quantity) })),
      reason: data.reason.trim(),
      customerConfirm: data.customerConfirm.trim().toLowerCase(),
      customerVerify: data.customerVerify,
      expectedCustomerName: data.expectedCustomerName.trim(),
      expectedTotal: Math.round(data.expectedTotal * 100) / 100,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isSuper, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error("Falha ao validar permissão");
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode emitir vale-troca");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: oerr } = await supabaseAdmin
      .from("orders")
      .select("id,status,total,user_id,customer_name,customer_phone,customer_cpf,customer_email,created_at")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oerr) throw new Error("Falha ao buscar pedido");
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "paid") throw new Error("Apenas pedidos pagos podem gerar vale-troca");
    if (!order.user_id) {
      throw new Error("Este pedido não tem cliente cadastrado. Vale-troca só é possível para clientes com conta.");
    }

    // Blindagem anti-mismatch
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const realName = normalize(order.customer_name ?? "");
    const expectedName = normalize(data.expectedCustomerName);
    if (realName !== expectedName) {
      throw new Error(
        `Inconsistência: tela mostrava "${data.expectedCustomerName}" mas pedido é de "${order.customer_name}". ABORTADO.`,
      );
    }
    const realTotal = Math.round(Number(order.total) * 100) / 100;
    if (Math.abs(realTotal - data.expectedTotal) > 0.01) {
      throw new Error(
        `Inconsistência: tela mostrava total ${data.expectedTotal} mas pedido é ${realTotal}. ABORTADO.`,
      );
    }

    const normConf = data.customerConfirm.replace(/\s+/g, " ");
    const namesMatch =
      realName === normConf ||
      realName.startsWith(normConf) ||
      realName.split(" ")[0] === normConf.split(" ")[0];
    if (!namesMatch) {
      throw new Error(`Nome confirmado ("${data.customerConfirm}") não corresponde ao cliente. ABORTADO.`);
    }

    const phoneDigits = digitsOnly(order.customer_phone);
    const cpfDigits = digitsOnly(order.customer_cpf);
    const verifyMatches =
      (phoneDigits.length >= 4 && phoneDigits.slice(-4) === data.customerVerify) ||
      (cpfDigits.length >= 4 && cpfDigits.slice(-4) === data.customerVerify);
    if (!verifyMatches) {
      throw new Error("Os 4 dígitos não conferem com o telefone nem CPF deste pedido. ABORTADO.");
    }

    // Puxa itens e calcula valor
    const itemIds = data.items.map((i) => i.itemId);
    const { data: itemsRows, error: ierr } = await supabaseAdmin
      .from("order_items")
      .select("id,product_name,variant_color,quantity,unit_price")
      .eq("order_id", order.id)
      .in("id", itemIds);
    if (ierr) throw new Error("Falha ao buscar itens do pedido");
    if (!itemsRows || itemsRows.length !== data.items.length) {
      throw new Error("Algum item selecionado não pertence a este pedido");
    }

    let amount = 0;
    const itemsSnapshot: {
      name: string;
      color: string | null;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];
    for (const sel of data.items) {
      const row = itemsRows.find((r: any) => r.id === sel.itemId)!;
      if (sel.quantity > Number(row.quantity)) {
        throw new Error(`Quantidade devolvida (${sel.quantity}) maior que a comprada (${row.quantity}) em "${row.product_name}"`);
      }
      const sub = Math.round(Number(row.unit_price) * sel.quantity * 100) / 100;
      amount += sub;
      itemsSnapshot.push({
        name: row.product_name,
        color: row.variant_color,
        quantity: sel.quantity,
        unitPrice: Number(row.unit_price),
        subtotal: sub,
      });
    }
    amount = Math.round(amount * 100) / 100;
    if (amount <= 0) throw new Error("Valor total inválido");
    if (amount > realTotal + 0.01) throw new Error("Valor maior que o total do pedido");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const operatorName = prof?.full_name || "—";

    const { data: voucherId, error: rpcErr } = await supabaseAdmin.rpc("create_exchange_voucher" as never, {
      p_order_id: order.id,
      p_amount: amount,
      p_reason: data.reason,
      p_items: itemsSnapshot as never,
      p_operator_id: userId,
      p_operator_name: operatorName,
    } as never);
    if (rpcErr) throw new Error("Falha ao registrar vale-troca: " + rpcErr.message);

    console.log("[exchange-voucher] created", {
      voucherId,
      orderId: order.id,
      customer: order.customer_name,
      amount,
      operator: operatorName,
    });

    return {
      ok: true,
      voucherId: String(voucherId),
      amount,
      receipt: {
        voucherId: String(voucherId),
        orderId: order.id,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        customerEmail: order.customer_email,
        orderTotal: realTotal,
        amount,
        reason: data.reason,
        operatorName,
        createdAt: new Date().toISOString(),
        items: itemsSnapshot,
      },
    };
  });

export type ExchangeVoucherRow = {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  reason: string;
  items: { name: string; color: string | null; quantity: number; unitPrice: number; subtotal: number }[];
  customer_name: string | null;
  customer_phone: string | null;
  customer_cpf: string | null;
  customer_email: string | null;
  order_total: number | null;
  order_created_at: string | null;
  operator_name: string | null;
  created_at: string;
};

export const listExchangeVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExchangeVoucherRow[]> => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isSuper) throw new Error("Apenas SUPERADMIN pode ver vale-trocas");

    const { data, error } = await supabase
      .from("exchange_vouchers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Falha ao listar vale-trocas: " + error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      order_id: r.order_id,
      user_id: r.user_id,
      amount: Number(r.amount),
      reason: r.reason,
      items: Array.isArray(r.items) ? r.items : [],
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      customer_cpf: r.customer_cpf,
      customer_email: r.customer_email,
      order_total: r.order_total != null ? Number(r.order_total) : null,
      order_created_at: r.order_created_at,
      operator_name: r.operator_name,
      created_at: r.created_at,
    }));
  });
