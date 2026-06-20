// TEMP debug endpoint — chama o /preconfirm da Mais Entregas para validar credenciais.
// Protegido por header X-Debug-Token (deve bater com MERCADO_PAGO_WEBHOOK_SECRET para reuso de secret existente).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/me-debug")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-debug-token");
        if (!token || token !== process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
          return new Response("forbidden", { status: 403 });
        }
        try {
          const body = await request.json().catch(() => ({}));
          const action = body.action ?? "preconfirm";
          const me = await import("@/lib/maisentregas.server");
          const email = process.env.MAISENTREGAS_EMAIL!;
          const address = [
            {
              street: me.PICKUP_ADDRESS.street,
              number: me.PICKUP_ADDRESS.number,
              complement: me.PICKUP_ADDRESS.complement ?? "",
              district: me.PICKUP_ADDRESS.district,
              city: me.PICKUP_ADDRESS.city,
              state: me.PICKUP_ADDRESS.state,
              cep: me.PICKUP_ADDRESS.zip,
              zip: me.PICKUP_ADDRESS.zip,
              name: me.PICKUP_ADDRESS.recipient_name,
              phone: me.PICKUP_ADDRESS.recipient_phone,
              comment: "coleta",
            },
            {
              street: body.street ?? "Rua XV de Novembro",
              number: body.number ?? "100",
              complement: "",
              district: body.district ?? "Centro",
              city: "Curitiba",
              state: "PR",
              cep: (body.zip ?? "80020310").replace(/\D/g, ""),
              zip: (body.zip ?? "80020310").replace(/\D/g, ""),
              name: body.name ?? "Cliente Teste",
              phone: (body.phone ?? "41999999999").replace(/\D/g, ""),
              comment: "entrega teste",
            },
          ];
          const payload = {
            client: email,
            city: "pr/curitiba",
            payment: "FATURADO" as const,
            billing: "ENTREGA" as const,
            delivery: "IMEDIATO" as const,
            address,
          };
          if (action === "confirm") {
            const res = await me.confirm({ ...payload, order: body.order ?? `TEST-${Date.now()}` });
            return Response.json({ ok: true, action, res });
          }
          const res = await me.preconfirm(payload);
          return Response.json({ ok: true, action, res });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
