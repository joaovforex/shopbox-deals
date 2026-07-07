// Client-safe server-function wrappers around Focus NFe operations.
// Note: never import "@/lib/focusnfe.server" at module scope here — it must
// stay inside handler bodies so it doesn't leak into the client bundle.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const rpc = (context.supabase as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc;
  const { data, error } = await rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Falha ao validar permissão");
  if (!data) throw new Error("Sem permissão");
}

// ---------- Cliente: baixar nota do próprio pedido ----------
export const getMyOrderNota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => {
    if (!data?.orderId || typeof data.orderId !== "string") throw new Error("Pedido inválido");
    return { orderId: data.orderId };
  })
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select(
        "id, user_id, nfe_status, nfe_modelo, nfe_numero, nfe_serie, nfe_chave, nfe_xml_url, nfe_danfe_url, nfe_rejection_message, nfe_authorized_at",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error("Falha ao ler pedido");
    if (!order) throw new Error("Pedido não encontrado");
    // RLS já garante que o cliente só vê o próprio pedido
    return order;
  });

// ---------- Admin: emitir manualmente / reemitir ----------
export const admin_emitirNotaManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; modelo?: "nfce" | "nfe" }) => {
    if (!data?.orderId || typeof data.orderId !== "string") throw new Error("Pedido inválido");
    if (data.modelo && !["nfce", "nfe"].includes(data.modelo)) throw new Error("Modelo inválido");
    return { orderId: data.orderId, modelo: data.modelo };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.modelo) {
      await supabaseAdmin
        .from("orders")
        .update({ nfe_modelo: data.modelo } as never)
        .eq("id", data.orderId);
    }
    const { emitirNotaParaOrder } = await import("@/lib/focusnfe.server");
    const r = await emitirNotaParaOrder(data.orderId);
    return { ok: r.ok, status: r.status, ref: r.ref, message: r.message ?? null };
  });

// ---------- Admin: cancelar nota autorizada ----------
export const admin_cancelarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string; justificativa: string }) => {
    if (!data?.orderId || typeof data.orderId !== "string") throw new Error("Pedido inválido");
    const j = (data.justificativa ?? "").trim();
    if (j.length < 15 || j.length > 255) throw new Error("Justificativa deve ter entre 15 e 255 caracteres");
    return { orderId: data.orderId, justificativa: j };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { cancelarNotaParaOrder } = await import("@/lib/focusnfe.server");
    const r = await cancelarNotaParaOrder(data.orderId, data.justificativa);
    return { ok: r.ok, message: r.message ?? null };
  });

// ---------- Admin: consultar/atualizar status na Focus (polling manual) ----------
export const admin_consultarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => {
    if (!data?.orderId || typeof data.orderId !== "string") throw new Error("Pedido inválido");
    return { orderId: data.orderId };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, nfe_ref, nfe_modelo")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order?.nfe_ref) throw new Error("Pedido sem nota enviada");
    const modelo = (order.nfe_modelo as "nfce" | "nfe") ?? "nfce";
    const { consultarNotaByRef, applyFocusResult } = await import("@/lib/focusnfe.server");
    const body = (await consultarNotaByRef(order.nfe_ref, modelo)) as Record<string, unknown> | null;
    if (body && typeof body === "object") {
      await applyFocusResult(data.orderId, body);
    }
    return body;
  });

// ---------- Admin: ler configuração fiscal ----------
export const admin_getFiscalConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("fiscal_config" as never)
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Falha ao ler configuração fiscal");
    return data;
  });

// ---------- Admin: atualizar configuração fiscal ----------
export type FiscalConfigInput = {
  ativo?: boolean;
  ambiente?: "homologacao" | "producao";
  cnpj?: string;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  razao_social?: string;
  nome_fantasia?: string | null;
  regime_tributario?: "simples" | "presumido" | "real";
  endereco_logradouro?: string;
  endereco_numero?: string;
  endereco_complemento?: string | null;
  endereco_bairro?: string;
  endereco_municipio?: string;
  endereco_uf?: string;
  endereco_cep?: string;
  endereco_codigo_municipio?: string;
  csc_id?: string | null;
  csc_token?: string | null;
  serie_nfce?: number;
  serie_nfe?: number;
  cfop_padrao_dentro_uf?: string;
  cfop_padrao_fora_uf?: string;
};

export const admin_updateFiscalConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FiscalConfigInput) => {
    if (!data || typeof data !== "object") throw new Error("Payload inválido");
    if (data.ambiente && !["homologacao", "producao"].includes(data.ambiente)) {
      throw new Error("Ambiente inválido");
    }
    if (data.regime_tributario && !["simples", "presumido", "real"].includes(data.regime_tributario)) {
      throw new Error("Regime tributário inválido");
    }
    if (data.cnpj && (data.cnpj.replace(/\D/g, "").length !== 14)) throw new Error("CNPJ inválido");
    if (data.endereco_uf && data.endereco_uf.length !== 2) throw new Error("UF inválida");
    if (data.endereco_codigo_municipio && !/^\d{7}$/.test(data.endereco_codigo_municipio)) {
      throw new Error("Código IBGE do município deve ter 7 dígitos");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = { ...data };
    if (typeof patch.cnpj === "string") patch.cnpj = patch.cnpj.replace(/\D/g, "");
    if (typeof patch.endereco_cep === "string") patch.endereco_cep = patch.endereco_cep.replace(/\D/g, "");
    if (typeof patch.endereco_uf === "string") patch.endereco_uf = patch.endereco_uf.toUpperCase();

    const { data: existing } = await supabaseAdmin
      .from("fiscal_config" as never)
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing && (existing as { id: string }).id) {
      const { error } = await supabaseAdmin
        .from("fiscal_config" as never)
        .update(patch as never)
        .eq("id", (existing as { id: string }).id);
      if (error) throw new Error(`Falha ao salvar configuração: ${error.message}`);
    } else {
      const { error } = await supabaseAdmin
        .from("fiscal_config" as never)
        .insert(patch as never);
      if (error) throw new Error(`Falha ao criar configuração: ${error.message}`);
    }
    return { ok: true };
  });
