/**
 * Tradução dos registros de auditoria para linguagem simples (pt-BR).
 * Gera: rótulo da ação, descrição da situação (estado anterior → atual)
 * e o link para a entidade alterada.
 */

export type AuditLogRow = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ENTITY_PT: Record<string, string> = {
  products: "Produto",
  orders: "Pedido",
  order_items: "Item do pedido",
  profiles: "Cliente",
  user_roles: "Cargo da equipe",
  unidades: "Unidade",
  short_links: "Link curto",
  refunds: "Reembolso",
  exchange_vouchers: "Vale-troca",
  cashback_entries: "Cashback",
  site_settings: "Configurações do site",
  fiscal_config: "Configuração fiscal",
  pos_charges: "Cobrança do caixa",
  delivery_upgrades: "Upgrade de entrega",
  product_reviews: "Avaliação",
  admin_notifications: "Notificação",
  cielo_refund_queue: "Fila de reembolso",
  auth: "Acesso",
  tela: "Tela",
  rpc: "Ação do sistema",
};

const FIELD_PT: Record<string, string> = {
  price: "Preço",
  original_price: "Preço original",
  stock: "Estoque",
  name: "Nome",
  description: "Descrição",
  category: "Categoria",
  brand: "Marca",
  size: "Tamanho",
  active: "Ativo",
  sku: "SKU",
  image_url: "Imagem",
  images: "Imagens",
  color_variants: "Variações de cor",
  unidade_id: "Unidade",
  status: "Status",
  fulfillment_status: "Etapa da expedição",
  label_status: "Etiqueta",
  total: "Total",
  delivery_fee: "Frete",
  payment_method: "Forma de pagamento",
  delivery_method: "Forma de entrega",
  customer_name: "Cliente",
  customer_phone: "Telefone",
  customer_email: "E-mail",
  cashback_rate: "Percentual de cashback",
  global_discount_percent: "Desconto geral",
  banner_desktop_url: "Banner desktop",
  banner_mobile_url: "Banner mobile",
  store_address: "Endereço da loja",
  payment_provider: "Meio de pagamento",
  role: "Cargo",
  amount: "Valor",
  reason: "Motivo",
  target_url: "Destino",
  slug: "Atalho",
  rating: "Nota",
  comment: "Comentário",
  quantity: "Quantidade",
  full_name: "Nome",
  phone: "Telefone",
  ativa: "Ativa",
  ordem: "Ordem",
};

const RPC_PT: Record<string, string> = {
  admin_update_product_fields: "Produto editado",
  admin_delete_products: "Produtos excluídos",
  admin_set_products_active: "Produtos ativados/desativados",
  admin_set_products_stock: "Estoque ajustado",
  admin_set_products_category: "Categoria alterada",
  admin_apply_discount_to_products: "Desconto aplicado em produtos",
  admin_replace_in_product_names: "Nomes de produtos alterados",
  apply_global_discount: "Desconto geral aplicado",
  clear_global_discount: "Desconto geral removido",
  apply_category_discount: "Desconto por categoria aplicado",
  clear_category_discount: "Desconto por categoria removido",
  admin_grant_cashback: "Cashback concedido",
  create_manual_order: "Venda manual criada",
  confirm_order_paid: "Pedido confirmado como pago",
  confirm_order_delivery: "Entrega confirmada",
  set_fulfillment_status: "Etapa da expedição alterada",
  revert_fulfillment_to_preparing: "Pedido devolvido para preparação",
  mark_label_event: "Etiqueta registrada",
  create_exchange_voucher: "Vale-troca emitido",
  refund_cashback_for_order: "Cashback devolvido",
  assign_team_role: "Cargo concedido",
  remove_team_role: "Cargo removido",
  delete_email: "Cliente excluído",
  place_order: "Pedido criado",
  apply_cashback_to_order: "Cashback aplicado ao pedido",
  apply_delivery_upgrade: "Entrega contratada",
};

const OP_PT: Record<string, string> = {
  insert: "criado",
  update: "editado",
  upsert: "salvo",
  delete: "excluído",
};

const MONEY_FIELDS = new Set([
  "price",
  "original_price",
  "total",
  "amount",
  "delivery_fee",
  "fee",
  "unit_price",
  "extra_amount",
]);

function money(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fieldLabel(key: string) {
  return FIELD_PT[key] ?? key.replace(/_/g, " ");
}

function valueText(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (MONEY_FIELDS.has(key)) return money(v);
  if (Array.isArray(v)) return `${v.length} item(ns)`;
  if (typeof v === "object") return "atualizado";
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/** Rótulo curto e direto da ação, em português. */
export function actionLabel(row: AuditLogRow): string {
  const a = row.action;
  if (a.startsWith("db.")) {
    const [, op, table] = a.split(".");
    const ent = ENTITY_PT[table ?? ""] ?? (table ?? "Registro");
    return `${ent} ${OP_PT[op ?? ""] ?? op}`;
  }
  if (a.startsWith("rpc.")) {
    const fn = a.slice(4);
    return RPC_PT[fn] ?? `Ação do sistema: ${fn.replace(/_/g, " ")}`;
  }
  if (a === "auth.signed_in") return "Entrou no sistema";
  if (a === "auth.sign_out") return "Saiu do sistema";
  if (a === "auth.user_updated") return "Conta atualizada";
  if (a === "ui.abrir_tela") return "Abriu uma tela";
  return a.replace(/[._]/g, " ");
}

/** Situação: estado anterior e atual, em frases simples. */
export function situationText(row: AuditLogRow): string {
  const d = (row.details ?? {}) as Record<string, unknown>;
  if (d["erro"]) {
    const e = d["erro"] as Record<string, unknown>;
    return `Falhou: ${String(e?.["message"] ?? "erro desconhecido")}`;
  }

  const antes = (d["antes"] ?? null) as Record<string, unknown> | null;
  const depois = (d["depois"] ?? d["payload"] ?? null) as Record<string, unknown> | null;

  if (antes && depois) {
    const parts: string[] = [];
    for (const [k, nv] of Object.entries(depois)) {
      if (k === "updated_at" || k === "search_norm") continue;
      const ov = antes[k];
      if (JSON.stringify(ov) === JSON.stringify(nv)) continue;
      parts.push(`${fieldLabel(k)} alterado de ${valueText(k, ov)} para ${valueText(k, nv)}`);
      if (parts.length >= 5) break;
    }
    if (parts.length) return parts.join(" · ");
  }

  if (row.action.startsWith("db.delete")) {
    return `Registro existia e foi removido${row.entity_id ? ` (${row.entity_id.slice(0, 8)})` : ""}`;
  }

  if (row.action.startsWith("db.insert") && depois) {
    const parts = Object.entries(depois)
      .filter(([k]) => !["id", "created_at", "updated_at", "search_norm"].includes(k))
      .slice(0, 4)
      .map(([k, v]) => `${fieldLabel(k)}: ${valueText(k, v)}`);
    return `Não existia · criado com ${parts.join(", ")}`;
  }

  if (row.action === "ui.abrir_tela") return `Acessou ${row.entity_id ?? "tela"}`;

  if (row.action.startsWith("rpc.")) {
    const args = (d["args"] ?? {}) as Record<string, unknown>;
    const parts = Object.entries(args)
      .slice(0, 4)
      .map(([k, v]) => `${fieldLabel(k.replace(/^_/, ""))}: ${valueText(k.replace(/^_/, ""), v)}`);
    return parts.length ? parts.join(" · ") : "Executada com sucesso";
  }

  if (depois) {
    const parts = Object.entries(depois)
      .slice(0, 4)
      .map(([k, v]) => `${fieldLabel(k)}: ${valueText(k, v)}`);
    if (parts.length) return parts.join(" · ");
  }
  return "—";
}

/** Link para a entidade afetada (ou null quando não há destino). */
export function auditLink(row: AuditLogRow): string | null {
  const id = row.entity_id;
  if (!id) return null;
  if (row.action === "ui.abrir_tela") return id.startsWith("/") ? id : null;
  const table = row.action.startsWith("db.") ? row.action.split(".")[2] : row.entity;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
  if (!isUuid) {
    // RPCs guardam ids de produto/pedido dentro dos argumentos
    const args = ((row.details ?? {}) as Record<string, unknown>)["args"] as
      | Record<string, unknown>
      | undefined;
    const pid = args?.["_product_id"] ?? args?.["p_product_id"] ?? args?.["product_id"];
    if (typeof pid === "string") return `/produto/${pid}`;
    const oid = args?.["_order_id"] ?? args?.["p_order_id"] ?? args?.["order_id"];
    if (typeof oid === "string") return `/pedido/${oid}`;
    return null;
  }
  if (table === "products" || table === "product_reviews") return `/produto/${id}`;
  if (table === "orders" || table === "order_items" || table === "delivery_upgrades")
    return `/pedido/${id}`;
  return null;
}
