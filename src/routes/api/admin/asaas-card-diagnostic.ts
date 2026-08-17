import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * DIAGNÓSTICO TEMPORÁRIO — SOMENTE LEITURA.
 *
 * Lê as cobranças dos últimos N dias (default 14) direto na Asaas e resume as
 * tentativas de cartão de crédito: tentadas, aprovadas, recusadas/não pagas e
 * o motivo que a Asaas devolve.
 *
 * Não grava no banco, não cria nem cancela cobrança.
 * Autenticação: Bearer token do usuário logado + cargo `admin` (superadmin).
 */
export const Route = createFileRoute("/api/admin/asaas-card-diagnostic")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("config", { status: 500 });
        }

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return new Response("unauthorized", { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length).trim();
        if (!token) return new Response("unauthorized", { status: 401 });

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsErr || !userId) return new Response("unauthorized", { status: 401 });

        const { data: isAdmin } = await supabase.rpc("has_role", {
          _user_id: userId as string,
          _role: "admin",
        });
        if (!isAdmin) return new Response("forbidden", { status: 403 });

        if (!process.env.ASAAS_API_KEY) {
          return Response.json({ error: "ASAAS_API_KEY ausente" }, { status: 500 });
        }

        const url = new URL(request.url);
        const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 14) || 14));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        const { listPaymentsCreatedSince } = await import("@/lib/asaas.server");

        let payments;
        try {
          payments = await listPaymentsCreatedSince(since);
        } catch (err) {
          console.error("[asaas:diagnostic] falha ao listar", err);
          return Response.json({ error: "Falha ao consultar a Asaas" }, { status: 502 });
        }

        const APPROVED = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
        const isCard = (b?: string | null) => (b ?? "").toUpperCase() === "CREDIT_CARD";

        const cardPayments = payments.filter((p) => isCard(p.billingType));
        const cardApproved = cardPayments.filter((p) => APPROVED.has((p.status ?? "").toUpperCase()));
        const cardFailed = cardPayments.filter((p) => !APPROVED.has((p.status ?? "").toUpperCase()));

        // Também cobranças sem billingType definido que ficaram sem pagar
        // (o cliente abriu o link, escolheu cartão e a recusa não gerou tipo).
        const unpaidOther = payments.filter(
          (p) => !isCard(p.billingType) && !APPROVED.has((p.status ?? "").toUpperCase()),
        );

        const detail = (p: (typeof payments)[number]) => ({
          paymentId: p.id,
          status: p.status,
          billingType: p.billingType ?? null,
          valor: p.value ?? null,
          data: p.dateCreated ?? null,
          vencimento: p.dueDate ?? null,
          bandeira: p.creditCard?.creditCardBrand ?? null,
          motivo:
            p.refusalReason ??
            (p.status === "REPROVED_BY_RISK_ANALYSIS"
              ? "Reprovado pela análise de risco da Asaas"
              : p.status === "AWAITING_RISK_ANALYSIS"
                ? "Aguardando análise de risco da Asaas"
                : p.status === "PENDING"
                  ? "Cobrança criada mas nunca paga (cliente não concluiu ou cartão recusado no checkout Asaas)"
                  : p.status === "OVERDUE"
                    ? "Vencida sem pagamento"
                    : null),
          descricao: p.description ?? null,
          externalReference: p.externalReference ?? null,
        });

        const byStatus: Record<string, number> = {};
        for (const p of cardPayments) {
          const s = (p.status ?? "?").toUpperCase();
          byStatus[s] = (byStatus[s] ?? 0) + 1;
        }

        return Response.json({
          periodo: { desde: since, dias: days },
          totalCobrancasNoPeriodo: payments.length,
          cartao: {
            tentados: cardPayments.length,
            aprovados: cardApproved.length,
            recusadosOuNaoPagos: cardFailed.length,
            taxaAprovacao:
              cardPayments.length > 0
                ? `${((cardApproved.length / cardPayments.length) * 100).toFixed(1)}%`
                : "n/a",
            porStatus: byStatus,
            recusados: cardFailed.map(detail),
          },
          outrasCobrancasNaoPagas: unpaidOther.map(detail),
        });
      },
    },
  },
});
