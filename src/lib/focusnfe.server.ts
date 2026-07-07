// Server-only helpers for Focus NFe integration.
// Do NOT import this file from client code — the .server.ts suffix keeps it
// out of the client bundle. Callable from server functions / server routes.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_PRODUCAO = "https://api.focusnfe.com.br";
const BASE_HOMOLOGACAO = "https://homologacao.focusnfe.com.br";

export type FocusAmbiente = "homologacao" | "producao";

export type FiscalConfig = {
  id: string;
  ativo: boolean;
  ambiente: FocusAmbiente;
  cnpj: string;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  regime_tributario: string; // 'simples' | 'presumido' | 'real'
  endereco_logradouro: string;
  endereco_numero: string;
  endereco_complemento: string | null;
  endereco_bairro: string;
  endereco_municipio: string;
  endereco_uf: string;
  endereco_cep: string;
  endereco_codigo_municipio: string;
  csc_id: string | null;
  csc_token: string | null;
  serie_nfce: number;
  serie_nfe: number;
  cfop_padrao_dentro_uf: string;
  cfop_padrao_fora_uf: string;
};

export type OrderRow = Record<string, unknown> & {
  id: string;
  total: number | string;
  customer_name: string;
  customer_cpf: string | null;
  customer_email: string | null;
  delivery_method: string;
  shipping_street: string | null;
  shipping_number: string | null;
  shipping_complement: string | null;
  shipping_district: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  destinatario_cpf_cnpj: string | null;
  destinatario_nome: string | null;
  nfe_modelo: "nfce" | "nfe" | null;
};

export type OrderItemRow = {
  product_id: string;
  product_name: string;
  unit_price: number | string;
  quantity: number;
};

export type ProductFiscalRow = {
  id: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  origem: number | null;
  cst_csosn: string | null;
  unidade_comercial: string;
};

function getToken(ambiente: FocusAmbiente): string {
  const token =
    ambiente === "producao"
      ? process.env.FOCUSNFE_TOKEN
      : process.env.FOCUSNFE_TOKEN_HOMOLOG;
  if (!token) throw new Error(`Focus NFe token ausente para ambiente ${ambiente}`);
  return token;
}

function baseUrl(ambiente: FocusAmbiente): string {
  return ambiente === "producao" ? BASE_PRODUCAO : BASE_HOMOLOGACAO;
}

function authHeader(ambiente: FocusAmbiente): string {
  const token = getToken(ambiente);
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

async function focusFetch(
  ambiente: FocusAmbiente,
  path: string,
  init: RequestInit & { rawBody?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const url = `${baseUrl(ambiente)}${path}`;
  const headers: Record<string, string> = {
    Authorization: authHeader(ambiente),
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const body =
    init.rawBody !== undefined ? JSON.stringify(init.rawBody) : (init.body as BodyInit | undefined);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, headers, body, signal: controller.signal });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getFiscalConfig(): Promise<FiscalConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("fiscal_config" as never)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler fiscal_config: ${error.message}`);
  return (data as FiscalConfig | null) ?? null;
}

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function money(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return (Math.round(v * 100) / 100).toFixed(2);
}

// Monta payload conforme layout Focus NFe (campos "brasileiros" da API).
// Docs: https://focusnfe.com.br/doc/#nfce e /doc/#nfe
export function mapOrderToNotaPayload(params: {
  order: OrderRow;
  items: (OrderItemRow & { fiscal: ProductFiscalRow | null })[];
  config: FiscalConfig;
  modelo: "nfce" | "nfe";
}): Record<string, unknown> {
  const { order, items, config, modelo } = params;
  const isNFCe = modelo === "nfce";
  const isDelivery = order.delivery_method === "delivery";
  const destUf = (order.shipping_state ?? config.endereco_uf ?? "").toUpperCase();
  const foraUF = isDelivery && destUf && destUf !== config.endereco_uf.toUpperCase();
  const cfopPadrao = foraUF ? config.cfop_padrao_fora_uf : config.cfop_padrao_dentro_uf;

  const destinatarioDoc = digits(order.destinatario_cpf_cnpj ?? order.customer_cpf);
  const destinatarioNome = (order.destinatario_nome ?? order.customer_name ?? "").trim();

  const itensPayload = items.map((it, idx) => {
    const f = it.fiscal;
    const qty = Number(it.quantity);
    const unit = Number(it.unit_price);
    return {
      numero_item: idx + 1,
      codigo_produto: it.product_id.slice(0, 60),
      descricao: String(it.product_name).slice(0, 120),
      cfop: f?.cfop || cfopPadrao,
      unidade_comercial: f?.unidade_comercial || "UN",
      quantidade_comercial: qty,
      valor_unitario_comercial: money(unit),
      valor_bruto: money(unit * qty),
      unidade_tributavel: f?.unidade_comercial || "UN",
      quantidade_tributavel: qty,
      valor_unitario_tributavel: money(unit),
      ncm: (f?.ncm || "").replace(/\D/g, "").padStart(8, "0"),
      cest: f?.cest ? f.cest.replace(/\D/g, "") : undefined,
      icms_origem: f?.origem ?? 0,
      // Simples Nacional usa CSOSN; demais regimes usam CST
      ...(config.regime_tributario === "simples"
        ? { icms_situacao_tributaria: f?.cst_csosn || "102" }
        : { icms_situacao_tributaria: f?.cst_csosn || "00" }),
      inclui_no_total: 1,
    };
  });

  const valorTotal = items.reduce(
    (sum, it) => sum + Number(it.unit_price) * Number(it.quantity),
    0,
  );

  const base: Record<string, unknown> = {
    natureza_operacao: "Venda de mercadoria",
    data_emissao: new Date().toISOString(),
    tipo_documento: 1, // saída
    local_destino: foraUF ? 2 : 1,
    finalidade_emissao: 1, // normal
    consumidor_final: 1,
    presenca_comprador: isNFCe ? 1 : 2, // 1=presencial, 2=internet

    cnpj_emitente: digits(config.cnpj),
    nome_emitente: config.razao_social,
    nome_fantasia_emitente: config.nome_fantasia ?? undefined,
    logradouro_emitente: config.endereco_logradouro,
    numero_emitente: config.endereco_numero,
    complemento_emitente: config.endereco_complemento ?? undefined,
    bairro_emitente: config.endereco_bairro,
    municipio_emitente: config.endereco_municipio,
    codigo_municipio_emitente: config.endereco_codigo_municipio,
    uf_emitente: config.endereco_uf,
    cep_emitente: digits(config.endereco_cep),
    inscricao_estadual_emitente: config.inscricao_estadual ?? undefined,
    regime_tributario_emitente:
      config.regime_tributario === "simples" ? 1 : config.regime_tributario === "presumido" ? 3 : 3,

    items: itensPayload,
    valor_produtos: money(valorTotal),
    valor_total: money(valorTotal),
  };

  // Destinatário
  if (destinatarioDoc) {
    const isCNPJ = destinatarioDoc.length === 14;
    Object.assign(base, {
      [isCNPJ ? "cnpj_destinatario" : "cpf_destinatario"]: destinatarioDoc,
      nome_destinatario: destinatarioNome || undefined,
      email_destinatario: order.customer_email ?? undefined,
    });
    if (isDelivery && order.shipping_street) {
      Object.assign(base, {
        logradouro_destinatario: order.shipping_street,
        numero_destinatario: order.shipping_number ?? "S/N",
        complemento_destinatario: order.shipping_complement ?? undefined,
        bairro_destinatario: order.shipping_district ?? undefined,
        municipio_destinatario: order.shipping_city ?? undefined,
        uf_destinatario: destUf,
        cep_destinatario: digits(order.shipping_zip),
        pais_destinatario: "Brasil",
      });
    }
  }

  return base;
}

async function loadOrderWithItems(orderId: string) {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (orderErr || !order) throw new Error("Pedido não encontrado");

  const { data: items, error: itemsErr } = await supabaseAdmin
    .from("order_items")
    .select("product_id, product_name, unit_price, quantity")
    .eq("order_id", orderId);
  if (itemsErr) throw new Error("Falha ao ler itens do pedido");

  const productIds = Array.from(new Set((items ?? []).map((i) => i.product_id).filter(Boolean))) as string[];
  const fiscalMap = new Map<string, ProductFiscalRow>();
  if (productIds.length > 0) {
    const { data: prods, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, ncm, cest, cfop, origem, cst_csosn, unidade_comercial")
      .in("id", productIds);
    if (prodErr) throw new Error("Falha ao ler dados fiscais dos produtos");
    for (const p of prods ?? []) fiscalMap.set(p.id, p as ProductFiscalRow);
  }

  const enriched = (items ?? []).map((it) => ({
    ...(it as OrderItemRow),
    fiscal: it.product_id ? fiscalMap.get(it.product_id) ?? null : null,
  }));

  return { order: order as OrderRow, items: enriched };
}

export type EmitResult = {
  ok: boolean;
  status: string; // 'processing' | 'authorized' | 'rejected' | 'error'
  ref: string;
  message?: string;
  body?: unknown;
};

// Emite (ou reemite) a nota do pedido. Idempotente por `ref = order_<id>`.
export async function emitirNotaParaOrder(orderId: string): Promise<EmitResult> {
  const config = await getFiscalConfig();
  if (!config) throw new Error("fiscal_config não configurado");
  if (!config.ativo) return { ok: false, status: "disabled", ref: "" };

  const { order, items } = await loadOrderWithItems(orderId);
  if (!items.length) throw new Error("Pedido sem itens");

  const modelo: "nfce" | "nfe" =
    (order.nfe_modelo as "nfce" | "nfe" | null) ??
    (order.destinatario_cpf_cnpj ? "nfe" : "nfce");
  const ref = `order_${orderId}`;
  const payload = mapOrderToNotaPayload({ order, items, config, modelo });
  const path = modelo === "nfce" ? `/v2/nfce?ref=${ref}` : `/v2/nfe?ref=${ref}`;

  await supabaseAdmin
    .from("orders")
    .update({
      nfe_modelo: modelo,
      nfe_status: "processing",
      nfe_ref: ref,
      nfe_last_check_at: new Date().toISOString(),
      nfe_rejection_message: null,
    } as never)
    .eq("id", orderId);

  const res = await focusFetch(config.ambiente, path, {
    method: "POST",
    rawBody: payload,
  });

  const body = res.body as Record<string, unknown> | null;
  const focusStatus = (body?.status as string | undefined) ?? "";

  if (res.status >= 200 && res.status < 300 && focusStatus === "processando_autorizacao") {
    return { ok: true, status: "processing", ref, body };
  }
  if (res.status >= 200 && res.status < 300 && focusStatus === "autorizado") {
    await applyFocusResult(orderId, body ?? {});
    return { ok: true, status: "authorized", ref, body };
  }

  const mensagem =
    (body?.mensagem as string | undefined) ||
    (body?.mensagem_sefaz as string | undefined) ||
    `HTTP ${res.status}`;
  await supabaseAdmin
    .from("orders")
    .update({
      nfe_status: "rejected",
      nfe_rejection_message: mensagem.slice(0, 500),
      nfe_last_check_at: new Date().toISOString(),
    } as never)
    .eq("id", orderId);

  return { ok: false, status: "rejected", ref, message: mensagem, body };
}

export async function consultarNotaByRef(ref: string, modelo: "nfce" | "nfe"): Promise<unknown> {
  const config = await getFiscalConfig();
  if (!config) throw new Error("fiscal_config não configurado");
  const path = modelo === "nfce" ? `/v2/nfce/${ref}` : `/v2/nfe/${ref}`;
  const res = await focusFetch(config.ambiente, path, { method: "GET" });
  return res.body;
}

// Aplica no orders o resultado retornado pela Focus (após autorização).
export async function applyFocusResult(orderId: string, body: Record<string, unknown>): Promise<void> {
  const status = (body?.status as string | undefined) ?? "";
  const update: Record<string, unknown> = {
    nfe_last_check_at: new Date().toISOString(),
  };
  if (status === "autorizado") {
    update.nfe_status = "authorized";
    update.nfe_chave = body.chave_nfe ?? body.chave_nfce ?? null;
    update.nfe_numero = body.numero ?? null;
    update.nfe_serie = body.serie != null ? String(body.serie) : null;
    update.nfe_protocolo = body.protocolo ?? null;
    update.nfe_authorized_at = new Date().toISOString();
    update.nfe_xml_url = body.caminho_xml_nota_fiscal
      ? `https://api.focusnfe.com.br${body.caminho_xml_nota_fiscal}`
      : null;
    update.nfe_danfe_url = body.caminho_danfe
      ? `https://api.focusnfe.com.br${body.caminho_danfe}`
      : null;
    update.nfe_rejection_message = null;
  } else if (status === "cancelado") {
    update.nfe_status = "cancelled";
  } else if (status === "denegado" || status === "erro_autorizacao") {
    update.nfe_status = "rejected";
    update.nfe_rejection_message =
      (body?.mensagem_sefaz as string | undefined)?.slice(0, 500) ??
      (body?.mensagem as string | undefined)?.slice(0, 500) ??
      null;
  } else if (status === "processando_autorizacao") {
    update.nfe_status = "processing";
  }
  await supabaseAdmin.from("orders").update(update as never).eq("id", orderId);
}

export async function cancelarNotaParaOrder(
  orderId: string,
  justificativa: string,
): Promise<{ ok: boolean; message?: string; body?: unknown }> {
  if (!justificativa || justificativa.trim().length < 15) {
    throw new Error("Justificativa deve ter no mínimo 15 caracteres");
  }
  const config = await getFiscalConfig();
  if (!config) throw new Error("fiscal_config não configurado");

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, nfe_ref, nfe_modelo, nfe_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.nfe_ref) throw new Error("Nota fiscal não encontrada para o pedido");
  if (order.nfe_status !== "authorized") throw new Error("Só notas autorizadas podem ser canceladas");

  const modelo = (order.nfe_modelo as "nfce" | "nfe") ?? "nfce";
  const path = modelo === "nfce" ? `/v2/nfce/${order.nfe_ref}` : `/v2/nfe/${order.nfe_ref}`;
  const res = await focusFetch(config.ambiente, path, {
    method: "DELETE",
    rawBody: { justificativa: justificativa.trim() },
  });
  const body = res.body as Record<string, unknown> | null;
  const focusStatus = (body?.status as string | undefined) ?? "";
  if (res.status >= 200 && res.status < 300 && focusStatus === "cancelado") {
    await supabaseAdmin
      .from("orders")
      .update({ nfe_status: "cancelled", nfe_last_check_at: new Date().toISOString() } as never)
      .eq("id", orderId);
    return { ok: true, body };
  }
  return {
    ok: false,
    message:
      (body?.mensagem_sefaz as string | undefined) ??
      (body?.mensagem as string | undefined) ??
      `HTTP ${res.status}`,
    body,
  };
}
