import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cria uma preferência Mercado Pago de R$ 0,50 usada exclusivamente para
 * validar credenciais + webhook em produção após troca de conta.
 *
 * Não cria pedido no banco. O webhook detecta o prefixo `TEST-` no
 * external_reference e apenas registra o recebimento.
 */
export const createMpTestPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isSuper } = await context.supabase.rpc(
      "has_role" as never,
      { _user_id: context.userId, _role: "super_admin" } as never,
    );
    if (!isSuper) throw new Error("Acesso restrito");

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("Mercado Pago não configurado");

    const req = getRequest();
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("host") ?? "localhost";
    const origin = `${proto}://${host}`;

    const testId = `TEST-${crypto.randomUUID()}`;

    const body = {
      external_reference: testId,
      items: [{
        id: testId,
        title: "TESTE Mercado Pago - validação de conta",
        quantity: 1,
        unit_price: 0.5,
        currency_id: "BRL",
      }],
      back_urls: {
        success: `${origin}/admin/mp-teste`,
        pending: `${origin}/admin/mp-teste`,
        failure: `${origin}/admin/mp-teste`,
      },
      notification_url: `${origin}/api/public/mp/webhook`,
      statement_descriptor: "SHOPBOX",
      metadata: { test: true, ref: testId },
    };

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[mp:test] preference error", res.status, errText);
      throw new Error(`Falha ao criar preferência (${res.status})`);
    }

    const pref = (await res.json()) as { id: string; init_point: string };
    return { preferenceId: pref.id, initPoint: pref.init_point, externalReference: testId };
  });
