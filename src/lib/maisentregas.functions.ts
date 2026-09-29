/**
 * Server functions e helpers reutilizáveis da Mais Entregas.
 *
 * Este arquivo é client-safe (importado pelo checkout/painel), portanto
 * NUNCA importe `@/lib/maisentregas.server` ou `client.server` no escopo
 * de módulo — sempre dentro de um `.handler()` com `await import(...)`.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isMeFinal, isMeDelivered, normalizeMeStatus, meStatusLabel } from "@/lib/maisentregas-status";
import { carFeeFromTable, type DeliveryVehicle } from "@/lib/delivery-vehicle";

const ME_CITY = "pr/curitiba";
const ME_PAYMENT = "FATURADO" as const;
const ME_BILLING = "ENTREGA" as const;
const ME_DELIVERY = "IMEDIATO" as const;

function normalizePhone(v?: string | null) {
  return (v ?? "").replace(/\D/g, "");
}

function buildAddress(input: {
  street: string;
  number: string;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zip: string;
  name?: string | null;
  phone?: string | null;
  comment?: string | null;
}) {
  return {
    street: input.street.trim(),
    number: input.number.trim(),
    complement: (input.complement ?? "").trim(),
    district: (input.district ?? "").trim(),
    city: (input.city ?? "Curitiba").trim(),
    state: (input.state ?? "PR").toUpperCase().trim(),
    cep: input.zip.replace(/\D/g, ""),
    zip: input.zip.replace(/\D/g, ""),
    name: (input.name ?? "").trim(),
    phone: normalizePhone(input.phone),
    comment: (input.comment ?? "").trim(),
  };
}

// =====================================================================
// quoteDeliveryFee — helper server-only (chamado também pelo checkout
// server-side, para nunca confiar no valor vindo do cliente).
// Lança erro quando a TBT não cobre o endereço ou a cotação falha.
//
// vehicle='carro' (produto grande / Fiorino):
//  - com `car_me_city` configurado no painel → cota na API da TBT usando o
//    serviço de carro (e os campos extras `car_me_extra`);
//  - sem ele → usa a tabela de frete por cidade do painel.
// =====================================================================
export type DeliveryQuote = {
  fee: number;
  distanceKm?: number;
  etaMinutes?: number;
  vehicle: DeliveryVehicle;
  source: "api" | "tabela";
};

type QuoteAddress = {
  zip: string; street: string; number: string;
  district?: string; complement?: string; city?: string;
};

async function preconfirmFee(input: QuoteAddress, city: string, extra: Record<string, unknown> | null) {
  const me = await import("@/lib/maisentregas.server");
  const email = process.env.MAISENTREGAS_EMAIL;
  if (!email) throw new Error("Mais Entregas não configurada (falta MAISENTREGAS_EMAIL)");
  const pickup = await me.getPickupAddress();

  const res = await me.preconfirm({
    ...(extra ?? {}),
    client: email,
    city,
    payment: ME_PAYMENT,
    billing: ME_BILLING,
    delivery: ME_DELIVERY,
    address: [
      buildAddress({
        street: pickup.street,
        number: pickup.number,
        complement: pickup.complement,
        district: pickup.district,
        city: pickup.city,
        state: pickup.state,
        zip: pickup.zip,
        name: pickup.recipient_name,
        phone: pickup.recipient_phone,
        comment: "coleta",
      }),
      buildAddress({
        street: input.street,
        number: input.number,
        complement: input.complement,
        district: input.district,
        city: input.city ?? "Curitiba",
        state: "PR",
        zip: input.zip,
        comment: "entrega",
      }),
    ],
  });

  const fee = Number(res?.value ?? res?.billing?.value ?? 0);
  if (!Number.isFinite(fee) || fee <= 0) {
    throw new Error("Não conseguimos calcular o frete para este endereço.");
  }
  return {
    fee: Math.round(fee * 100) / 100,
    distanceKm: res?.estimate?.distancia,
    etaMinutes: res?.estimate?.duracaoEstimadaMinutos,
  };
}

export async function quoteDeliveryFee(
  input: QuoteAddress,
  vehicle: DeliveryVehicle = "moto",
): Promise<DeliveryQuote> {
  if (vehicle === "moto") {
    const q = await preconfirmFee(input, ME_CITY, null);
    return { ...q, vehicle, source: "api" };
  }

  const me = await import("@/lib/maisentregas.server");
  const cfg = await me.getCarDeliveryConfig();
  if (!cfg.enabled) {
    throw new Error("Este pedido tem produto grande que não vai de moto. No momento ele só pode ser retirado na loja.");
  }
  if (cfg.meCity) {
    const q = await preconfirmFee(input, cfg.meCity, cfg.meExtra);
    return { ...q, vehicle, source: "api" };
  }
  const fee = carFeeFromTable(input.city, cfg.feeTable, cfg.feeDefault);
  if (fee == null) {
    throw new Error("Ainda não temos frete de carro (Fiorino) para esta cidade. Escolha retirada na loja ou fale com a gente no WhatsApp.");
  }
  return { fee, vehicle, source: "tabela" };
}

/** Veículo necessário para um conjunto de produtos (server-only). */
export async function vehicleForProducts(productIds: string[]): Promise<DeliveryVehicle> {
  const ids = Array.from(new Set(productIds.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))).slice(0, 100);
  if (ids.length === 0) return "moto";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id")
    .in("id", ids)
    .eq("requires_car", true)
    .limit(1);
  if (error) {
    // Na dúvida, não arrisca mandar produto grande de moto.
    console.error("[maisentregas] vehicleForProducts falhou — assumindo carro", error.message);
    return "carro";
  }
  return (data ?? []).length > 0 ? "carro" : "moto";
}

/** Cotação completa para o checkout: decide o veículo pelos produtos e cota. */
export async function quoteDeliveryForProducts(input: QuoteAddress, productIds: string[]): Promise<DeliveryQuote> {
  const vehicle = await vehicleForProducts(productIds);
  return quoteDeliveryFee(input, vehicle);
}

type QuoteInput = QuoteAddress & { product_ids?: string[] };

function validateQuoteInput(data: QuoteInput) {
  const zip = (data?.zip ?? "").replace(/\D/g, "");
  if (zip.length !== 8) throw new Error("CEP inválido");
  if (!data.street || data.street.length < 2) throw new Error("Rua inválida");
  if (!data.number) throw new Error("Número inválido");
  return {
    zip,
    street: data.street.trim().slice(0, 120),
    number: String(data.number).trim().slice(0, 20),
    district: (data.district ?? "").trim().slice(0, 80),
    complement: (data.complement ?? "").trim().slice(0, 80),
    city: (data.city ?? "Curitiba").trim().slice(0, 60) || "Curitiba",
    product_ids: Array.isArray(data.product_ids)
      ? data.product_ids.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 50)
      : [],
  };
}

// =====================================================================
// quoteDelivery — cota o frete e valida cobertura para um endereço.
// Chamada do checkout. Requer login.
// =====================================================================
export const quoteDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateQuoteInput)
  .handler(async ({ data }) => {
    const { product_ids, ...addr } = data;
    const q = await quoteDeliveryForProducts(addr, product_ids);
    return { ok: true as const, ...q };
  });

// =====================================================================
// quoteDeliveryPublic — a MESMA cotação, sem login, para a página do produto.
// Proteção contra abuso da API (que é paga/limitada):
//  - limite por IP (10 cotações / 10 min) e limite global (300 / 10 min);
//  - cache de 10 min por endereço (CEP+número) — quem repete não gasta chamada.
// Os contadores vivem em memória da instância (suficiente para conter abuso;
// o checkout continua recotando no servidor, então nada aqui define preço).
// =====================================================================
const PUBLIC_QUOTE_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_QUOTE_MAX_PER_IP = 10;
const PUBLIC_QUOTE_MAX_GLOBAL = 300;
const publicQuoteHits = new Map<string, number[]>();
const publicQuoteCache = new Map<string, { at: number; value: DeliveryQuote }>();

function clientIp(): string {
  try {
    const h = getRequest().headers;
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const xri = h.get("x-real-ip");
    if (xri) return xri.trim();
  } catch { /* sem contexto de request */ }
  return "0.0.0.0";
}

function hitAndCheck(key: string, max: number): boolean {
  const now = Date.now();
  const arr = (publicQuoteHits.get(key) ?? []).filter((t) => now - t < PUBLIC_QUOTE_WINDOW_MS);
  if (arr.length >= max) {
    publicQuoteHits.set(key, arr);
    return false;
  }
  arr.push(now);
  publicQuoteHits.set(key, arr);
  // Limpeza oportunista para o Map não crescer sem limite.
  if (publicQuoteHits.size > 5000) {
    for (const [k, v] of publicQuoteHits) {
      if (!v.some((t) => now - t < PUBLIC_QUOTE_WINDOW_MS)) publicQuoteHits.delete(k);
    }
  }
  return true;
}

export const quoteDeliveryPublic = createServerFn({ method: "POST" })
  .inputValidator(validateQuoteInput)
  .handler(async ({ data }) => {
    const { product_ids, ...addr } = data;
    const vehicle = await vehicleForProducts(product_ids);
    const cacheKey = `${vehicle}|${addr.zip}|${addr.number.toLowerCase()}|${addr.city.toLowerCase()}`;
    const cached = publicQuoteCache.get(cacheKey);
    if (cached && Date.now() - cached.at < PUBLIC_QUOTE_WINDOW_MS) {
      return { ok: true as const, ...cached.value, cached: true as const };
    }
    if (!hitAndCheck(`ip:${clientIp()}`, PUBLIC_QUOTE_MAX_PER_IP) || !hitAndCheck("global", PUBLIC_QUOTE_MAX_GLOBAL)) {
      throw new Error("Muitas cotações em pouco tempo. Aguarde alguns minutos ou entre na sua conta para continuar.");
    }
    const q = await quoteDeliveryFee(addr, vehicle);
    publicQuoteCache.set(cacheKey, { at: Date.now(), value: q });
    if (publicQuoteCache.size > 2000) {
      const now = Date.now();
      for (const [k, v] of publicQuoteCache) if (now - v.at >= PUBLIC_QUOTE_WINDOW_MS) publicQuoteCache.delete(k);
    }
    return { ok: true as const, ...q, cached: false as const };
  });


// =====================================================================
// createDeliveryForOrder — chamado internamente após pagamento aprovado.
// Cria a corrida na Mais Entregas e salva o id da OS no pedido.
// Idempotente: se o pedido já tem maisentregas_order_id, retorna sem fazer nada.
// =====================================================================
export async function createDeliveryForOrder(orderId: string): Promise<{
  ok: boolean;
  reason?: string;
  meOrderId?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const me = await import("@/lib/maisentregas.server");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id,status,fulfillment_status,delivery_method,delivery_vehicle,customer_name,customer_phone,customer_email,customer_cpf,shipping_zip,shipping_street,shipping_number,shipping_complement,shipping_district,shipping_city,shipping_state,shipping_recipient_name,shipping_recipient_phone,maisentregas_order_id")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.status !== "paid") return { ok: false, reason: "order_not_paid" };
  if (order.delivery_method !== "delivery") return { ok: false, reason: "pickup_order" };
  if (order.maisentregas_order_id) return { ok: true, meOrderId: order.maisentregas_order_id };
  // Só dispara a TBT Express quando o pedido está separado e pronto na expedição.
  const fs = (order as { fulfillment_status?: string | null }).fulfillment_status ?? "";
  if (fs !== "ready" && fs !== "shipped" && fs !== "completed") {
    return { ok: false, reason: "not_ready" };
  }
  if (!order.shipping_zip || !order.shipping_street || !order.shipping_number) {
    return { ok: false, reason: "missing_shipping_address" };
  }

  const email = process.env.MAISENTREGAS_EMAIL;
  if (!email) return { ok: false, reason: "missing_me_email" };

  // Veículo: o gravado no pedido OU (rede de segurança) o exigido pelos itens
  // — cobre pedidos antigos e conversões retirada → entrega.
  let vehicle: DeliveryVehicle = (order as { delivery_vehicle?: string | null }).delivery_vehicle === "carro" ? "carro" : "moto";
  if (vehicle === "moto") {
    const { data: its } = await supabaseAdmin.from("order_items").select("product_id").eq("order_id", orderId);
    vehicle = await vehicleForProducts((its ?? []).map((i) => String((i as { product_id: string | null }).product_id ?? "")));
    if (vehicle === "carro") {
      await supabaseAdmin.from("orders").update({ delivery_vehicle: "carro" } as never).eq("id", orderId);
    }
  }
  let serviceCity = ME_CITY;
  let serviceExtra: Record<string, unknown> | null = null;
  if (vehicle === "carro") {
    const cfg = await me.getCarDeliveryConfig();
    if (!cfg.meCity) {
      // Sem serviço de carro configurado na API: a expedição abre a corrida
      // de carro no painel da TBT e vincula a OS no pedido.
      return { ok: false, reason: "car_manual" };
    }
    serviceCity = cfg.meCity;
    serviceExtra = cfg.meExtra;
  }

  try {
    const recipientName = order.shipping_recipient_name?.trim() || order.customer_name;
    const recipientPhone = normalizePhone(order.shipping_recipient_phone ?? order.customer_phone);
    const orderCode = order.id.slice(0, 8).toUpperCase();
    const pickup = await me.getPickupAddress();

    const confirmRes = await me.confirm({
      ...(serviceExtra ?? {}),
      client: email,
      city: serviceCity,
      payment: ME_PAYMENT,
      billing: ME_BILLING,
      delivery: ME_DELIVERY,
      document: order.customer_cpf ?? undefined,
      address: [
        buildAddress({
          street: pickup.street,
          number: pickup.number,
          complement: pickup.complement,
          district: pickup.district,
          city: pickup.city,
          state: pickup.state,
          zip: pickup.zip,
          name: pickup.recipient_name,
          phone: pickup.recipient_phone,
          comment: `Coleta do pedido shopbox #${orderCode}${vehicle === "carro" ? " — PRODUTO GRANDE, VEÍCULO: CARRO/FIORINO" : ""}`,
        }),
        {
          ...buildAddress({
            street: order.shipping_street,
            number: order.shipping_number,
            complement: order.shipping_complement,
            district: order.shipping_district,
            city: order.shipping_city ?? "Curitiba",
            state: order.shipping_state ?? "PR",
            zip: order.shipping_zip,
            name: recipientName,
            phone: recipientPhone,
            comment: `Entrega do pedido shopbox #${orderCode}`,
          }),
          // A API exige que o identificador do pedido vá dentro do endereço de
          // entrega correspondente, não no corpo principal da requisição.
          order: `Pedido #${orderCode}`,
          pedido: `Pedido #${orderCode}`,
        },
      ],
    });


    const meOrderId = String(confirmRes.id ?? confirmRes.order ?? "");
    if (!meOrderId) {
      await supabaseAdmin.from("orders").update({
        maisentregas_last_error: "resposta sem id",
        maisentregas_last_check_at: new Date().toISOString(),
      }).eq("id", orderId);
      return { ok: false, reason: "no_id_in_response" };
    }

    const est: NonNullable<typeof confirmRes.estimate> = confirmRes.estimate ?? {};
    await supabaseAdmin.from("orders").update({
      maisentregas_order_id: meOrderId,
      maisentregas_status: "criado",
      maisentregas_created_at: new Date().toISOString(),
      maisentregas_last_check_at: new Date().toISOString(),
      maisentregas_last_error: null,
      // Página própria de acompanhamento (motoboy, ETA, etapas).
      maisentregas_tracking_url: `/rastreio/${orderId}`,
      ...(typeof est.distancia === "number" ? { delivery_quote_distance_km: est.distancia } : {}),
      ...(typeof est.duracaoEstimadaMinutos === "number" ? { delivery_quote_eta_minutes: est.duracaoEstimadaMinutos } : {}),
      ...(est.distancia != null || est.duracaoEstimadaMinutos != null ? { delivery_quote_at: new Date().toISOString() } : {}),
    }).eq("id", orderId);

    console.info("[maisentregas] delivery created", { orderId, meOrderId, vehicle });
    return { ok: true, meOrderId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[maisentregas] createDeliveryForOrder failed", { orderId, msg });
    await supabaseAdmin.from("orders").update({
      maisentregas_last_error: msg.slice(0, 800),
      maisentregas_last_check_at: new Date().toISOString(),
    }).eq("id", orderId);
    return { ok: false, reason: "api_error" };
  }
}



// =====================================================================
// dispatchDelivery — chamada pelo painel de expedição quando o pedido
// for marcado como "Pronto". Cria a corrida na Mais Entregas (TBT Express).
// =====================================================================
export const dispatchDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => {
    if (!data?.orderId) throw new Error("orderId obrigatório");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles ?? []).some((r) =>
      ["admin", "manager", "fulfillment", "owner"].includes(r.role as string),
    );
    if (!allowed) throw new Error("Sem permissão para despachar entregas.");
    return await createDeliveryForOrder(data.orderId);
  });


// =====================================================================
// linkManualDeliveryRun — a expedição criou a corrida DIRETO no painel da
// TBT (ex.: entrega de carro sem serviço configurado na API) e informa o
// número da OS. A partir daí o rastreio e o cron funcionam normalmente.
// =====================================================================
export const linkManualDeliveryRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; meOrderId: string }) => {
    const orderId = String(data?.orderId ?? "").trim();
    const meOrderId = String(data?.meOrderId ?? "").replace(/[^0-9A-Za-z-]/g, "").slice(0, 40);
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Pedido inválido");
    if (!meOrderId) throw new Error("Informe o número da OS da TBT");
    return { orderId, meOrderId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => ["admin", "manager", "fulfillment", "owner"].includes(r.role as string));
    if (!allowed) throw new Error("Sem permissão para vincular entregas.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, delivery_method, maisentregas_order_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    if (order.status !== "paid") throw new Error("Pedido não está pago");
    if (order.delivery_method !== "delivery") throw new Error("Pedido é retirada na loja");
    if (order.maisentregas_order_id && order.maisentregas_order_id !== data.meOrderId) {
      throw new Error(`Este pedido já está vinculado à OS ${order.maisentregas_order_id}`);
    }

    // Confere se a OS existe e pertence à nossa conta antes de gravar.
    let status: string | null = "criado";
    try {
      const me = await import("@/lib/maisentregas.server");
      const res = await me.getOrderStatus(data.meOrderId);
      status = normalizeMeStatus(me.extractStatusDetails(res).rawStatus) ?? "criado";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Não encontrei essa OS na TBT (${msg.slice(0, 160)}). Confira o número.`);
    }

    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("orders").update({
      maisentregas_order_id: data.meOrderId,
      maisentregas_status: status,
      maisentregas_created_at: nowIso,
      maisentregas_last_check_at: nowIso,
      maisentregas_last_error: null,
      maisentregas_tracking_url: `/rastreio/${data.orderId}`,
    } as never).eq("id", data.orderId);
    return { ok: true as const, status };
  });

// =====================================================================
// pollOrderStatus — atualiza status de UMA entrega já criada.
// =====================================================================
export type PollResult = {
  ok: boolean;
  /** Credencial global recusada — o poller deve PARAR o lote (todos falhariam). */
  authFailed?: boolean;
  status?: string | null;
};

export async function pollOrderStatus(orderRowId: string, meOrderId: string): Promise<PollResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const me = await import("@/lib/maisentregas.server");
  try {
    const res = await me.getOrderStatus(meOrderId);
    const det = me.extractStatusDetails(res);
    const status = normalizeMeStatus(det.rawStatus);
    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = {
      maisentregas_last_check_at: nowIso,
      maisentregas_last_error: null,
    };
    if (status) update.maisentregas_status = status;
    if (!isMeFinal(status)) update.maisentregas_tracking_url = `/rastreio/${orderRowId}`;
    const est: NonNullable<typeof res.estimate> = res.estimate ?? {};
    if (typeof est.distancia === "number") update.delivery_quote_distance_km = est.distancia;
    if (typeof est.duracaoEstimadaMinutos === "number") update.delivery_quote_eta_minutes = est.duracaoEstimadaMinutos;

    if (isMeDelivered(status)) {
      // Hora real da entrega (data_conclusao do ponto de entrega); se a API
      // não trouxer, usa o momento em que detectamos.
      update.delivered_at = det.concludedAt ?? nowIso;
      update.fulfillment_status = "completed";
    } else if (status === "cancelado" && det.cancelReason) {
      update.maisentregas_last_error = `Cancelada pela transportadora: ${det.cancelReason}`.slice(0, 800);
    }
    await supabaseAdmin.from("orders").update(update as never).eq("id", orderRowId);
    return { ok: true, status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const authFailed = err instanceof me.MaisEntregasAuthError || /\/auth falhou|\/auth:/.test(msg);
    // "não tem acesso a esta OS": a OS pertence a outra conta (token trocado).
    // Nunca vai resolver sozinho — prefixo faz o poller parar de tentar.
    // Um 401 no /auth (credencial global) NÃO é isso: fica sem prefixo e o
    // pedido volta a ser consultado assim que a credencial normalizar.
    const noAccess = !authFailed && (/n[ãa]o tem acesso/i.test(msg) || /\b(401|403)\b/.test(msg));
    const prefix = noAccess ? "[sem-acesso] " : "";
    if (authFailed) {
      console.error("[maisentregas] credencial recusada no /auth — lote interrompido", { orderRowId, meOrderId, msg });
    } else if (noAccess) {
      console.error("[maisentregas] pollOrderStatus sem acesso — parando de acompanhar", { orderRowId, meOrderId });
    } else {
      console.error("[maisentregas] pollOrderStatus failed", { orderRowId, meOrderId, msg });
    }
    await supabaseAdmin.from("orders").update({
      maisentregas_last_check_at: new Date().toISOString(),
      maisentregas_last_error: (prefix + msg).slice(0, 800),
    }).eq("id", orderRowId);
    return { ok: false, authFailed };
  }
}

// =====================================================================
// getDeliveryTracking — dados da página /rastreio/:id (pública pelo UUID,
// como a página do pedido). Consulta a API ao vivo enquanto a corrida está
// ativa (cache de 20s por pedido); finalizada, responde só com o banco.
// Nunca expõe dados pessoais além da cidade e do primeiro nome do entregador.
// =====================================================================
const trackingCache = new Map<string, { at: number; value: TrackingInfo }>();
const TRACKING_CACHE_MS = 20_000;

export type TrackingInfo = {
  orderId: string;
  shortId: string;
  found: boolean;
  isDelivery: boolean;
  hasRun: boolean;
  status: string | null;
  label: string;
  isFinal: boolean;
  isDelivered: boolean;
  createdAt: string | null;
  runCreatedAt: string | null;
  deliveredAt: string | null;
  arrivedAt: string | null;
  etaMinutes: number | null;
  distanceKm: number | null;
  etaTime: string | null;
  city: string | null;
  courier: { name: string; photo: string | null; lat: number | null; lng: number | null; updatedAt: string | null } | null;
  destination: { lat: number | null; lng: number | null } | null;
  lastCheckAt: string | null;
  live: boolean;
  vehicle: "moto" | "carro";
};

export const getDeliveryTracking = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => {
    const id = String(data?.id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Pedido inválido");
    return { id };
  })
  .handler(async ({ data }): Promise<TrackingInfo> => {
    const cached = trackingCache.get(data.id);
    if (cached && Date.now() - cached.at < TRACKING_CACHE_MS) return cached.value;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, delivery_method, delivery_vehicle, fulfillment_status, created_at, shipping_city, maisentregas_order_id, maisentregas_status, maisentregas_created_at, maisentregas_last_check_at, delivered_at, delivery_quote_distance_km, delivery_quote_eta_minutes")
      .eq("id", data.id)
      .maybeSingle();

    const shortId = data.id.slice(0, 8).toUpperCase();
    const base: TrackingInfo = {
      orderId: data.id, shortId, found: !!order, isDelivery: order?.delivery_method === "delivery",
      hasRun: !!order?.maisentregas_order_id, status: null, label: "Aguardando", isFinal: false, isDelivered: false,
      createdAt: order?.created_at ?? null, runCreatedAt: order?.maisentregas_created_at ?? null,
      deliveredAt: order?.delivered_at ?? null, arrivedAt: null,
      etaMinutes: order?.delivery_quote_eta_minutes ?? null, distanceKm: order?.delivery_quote_distance_km ?? null,
      etaTime: null, city: order?.shipping_city ?? null, courier: null, destination: null,
      lastCheckAt: order?.maisentregas_last_check_at ?? null, live: false,
      vehicle: (order as { delivery_vehicle?: string | null } | null)?.delivery_vehicle === "carro" ? "carro" : "moto",
    };
    if (!order || order.status !== "paid" || !order.maisentregas_order_id) {
      // Pedido pago sem corrida ainda: "preparando".
      if (order && order.status === "paid" && order.delivery_method === "delivery") base.label = "Preparando seu pedido";
      return base;
    }

    const dbStatus = normalizeMeStatus(order.maisentregas_status);
    base.status = dbStatus;
    base.label = meStatusLabel(dbStatus);
    base.isFinal = isMeFinal(dbStatus);
    base.isDelivered = isMeDelivered(dbStatus) || order.fulfillment_status === "completed";
    if (base.isDelivered) { base.label = "Entregue"; base.isFinal = true; }

    if (!base.isFinal) {
      try {
        const me = await import("@/lib/maisentregas.server");
        const res = await me.getOrderStatus(order.maisentregas_order_id);
        const det = me.extractStatusDetails(res);
        const live = normalizeMeStatus(det.rawStatus) ?? dbStatus;
        base.status = live;
        base.label = meStatusLabel(live);
        base.isFinal = isMeFinal(live);
        base.isDelivered = isMeDelivered(live);
        base.arrivedAt = det.arrivedAt;
        if (det.concludedAt) base.deliveredAt = det.concludedAt;
        base.live = true;
        const est: NonNullable<typeof res.estimate> = res.estimate ?? {};
        if (typeof est.duracaoEstimadaMinutos === "number") base.etaMinutes = est.duracaoEstimadaMinutos;
        if (typeof est.distancia === "number") base.distanceKm = est.distancia;
        if (est.horaTermino) base.etaTime = String(est.horaTermino);
        const mb = res.motoboy;
        if (mb && (mb.nome || mb.latitude != null)) {
          base.courier = {
            name: String(mb.nome ?? "Entregador").split(" ")[0] || "Entregador",
            photo: mb.picture ? String(mb.picture) : null,
            lat: typeof mb.latitude === "number" ? mb.latitude : null,
            lng: typeof mb.longitude === "number" ? mb.longitude : null,
            updatedAt: mb.updated ? new Date(Number(mb.updated) > 1e12 ? Number(mb.updated) : Number(mb.updated) * 1000).toISOString() : null,
          };
        }
        const dest = (res.enderecos ?? [])[Math.max(0, (res.enderecos ?? []).length - 1)];
        if (dest && (dest.latitude != null || dest.longitude != null)) {
          base.destination = { lat: dest.latitude ?? null, lng: dest.longitude ?? null };
        }
        // Aproveita a consulta para atualizar o banco (mesmo caminho do cron).
        const upd: Record<string, unknown> = { maisentregas_last_check_at: new Date().toISOString() };
        if (live) upd.maisentregas_status = live;
        if (base.isDelivered) { upd.delivered_at = det.concludedAt ?? new Date().toISOString(); upd.fulfillment_status = "completed"; }
        await supabaseAdmin.from("orders").update(upd as never).eq("id", order.id);
      } catch (err) {
        console.warn("[maisentregas] tracking live fetch failed", { orderId: order.id, err: err instanceof Error ? err.message : err });
      }
    }

    trackingCache.set(data.id, { at: Date.now(), value: base });
    if (trackingCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of trackingCache) if (now - v.at >= TRACKING_CACHE_MS) trackingCache.delete(k);
    }
    return base;
  });

// =====================================================================
// cancelDeliveryForOrder — tenta cancelar uma corrida ativa.
// Chamado no fluxo de reembolso quando o pedido ainda não saiu.
// =====================================================================
export async function cancelDeliveryForOrder(orderId: string, reason?: string): Promise<{ ok: boolean; message?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const me = await import("@/lib/maisentregas.server");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("maisentregas_order_id, maisentregas_status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order?.maisentregas_order_id) return { ok: false, message: "sem corrida" };

  if (isMeFinal(order.maisentregas_status)) return { ok: false, message: "corrida já finalizada" };

  try {
    const res = await me.cancelOrder(order.maisentregas_order_id, reason ?? "Cancelado pelo lojista");
    if (res.success) {
      await supabaseAdmin.from("orders").update({
        maisentregas_status: "cancelado",
        maisentregas_last_check_at: new Date().toISOString(),
      }).eq("id", orderId);
    }
    return { ok: !!res.success, message: res.message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[maisentregas] cancelDeliveryForOrder failed", { orderId, msg });
    return { ok: false, message: msg };
  }
}
