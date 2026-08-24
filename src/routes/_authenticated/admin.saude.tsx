import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  CreditCard,
  Undo2,
  FileText,
  Coins,
  ShieldAlert,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getRoleSummary, type RoleSummary } from "@/lib/products";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { brl } from "@/lib/format";
import { fetchCashbackOutstanding } from "@/lib/admin-metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/saude")({
  head: () => ({
    meta: [
      { title: "Saúde do sistema · Admin · shopbox" },
      { name: "description", content: "Painel somente leitura com o status operacional da loja." },
    ],
  }),
  component: HealthPage,
});

function ago(ts: string | null | undefined): string {
  if (!ts) return "sem registro";
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dia(s)`;
}

/** Painel SOMENTE LEITURA — nenhuma ação altera pagamento, fiscal ou pedidos. */
async function loadHealth() {
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [
    lastWebhook,
    lastMpOrder,
    refundQueue,
    nfeErrors,
    lastReconcile,
    cashback,
    unauthorized,
    pendingOrders,
    webhooks24h,
    webhookFailures,
  ] = await Promise.all([
    supabase.from("cielo_webhook_events").select("processed_at").order("processed_at", { ascending: false }).limit(1),
    supabase.from("orders").select("mp_last_attempt_at").not("mp_last_attempt_at", "is", null).order("mp_last_attempt_at", { ascending: false }).limit(1),
    supabase.from("cielo_refund_queue").select("id,status,last_error,updated_at", { count: "exact" }).in("status", ["pending", "retrying", "failed"]).order("updated_at", { ascending: false }).limit(5),
    supabase.from("orders").select("id,nfe_status,nfe_rejection_message,created_at", { count: "exact" }).in("nfe_status", ["erro", "rejeitado", "error"]).order("created_at", { ascending: false }).limit(5),
    supabase.from("orders").select("cielo_last_check_at").not("cielo_last_check_at", "is", null).order("cielo_last_check_at", { ascending: false }).limit(1),
    fetchCashbackOutstanding(),
    supabase.from("admin_audit_log").select("id,created_at", { count: "exact" }).ilike("action", "%unauthorized%").gte("created_at", since24h),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending").gte("created_at", since24h),
    supabase.from("cielo_webhook_events").select("id", { count: "exact", head: true }).gte("processed_at", since24h),
    supabase
      .from("cielo_webhook_events")
      .select("id,processed_at,payment_id,raw_payload", { count: "exact" })
      .eq("raw_payload->_log->>status", "error")
      .gte("processed_at", since24h)
      .order("processed_at", { ascending: false })
      .limit(5),
  ]);


  // Agregado no banco (RPC) — a leitura anterior parava no teto de 1000 linhas.
  const cashbackBalance = cashback.balance;
  const cashbackEntries = cashback.entries;

  return {
    lastWebhookAt: (lastWebhook.data?.[0] as { processed_at?: string } | undefined)?.processed_at ?? null,
    lastMpAttemptAt: (lastMpOrder.data?.[0] as { mp_last_attempt_at?: string } | undefined)?.mp_last_attempt_at ?? null,
    refundPending: refundQueue.count ?? 0,
    refundSamples: (refundQueue.data ?? []) as Array<{ id: string; status: string; last_error: string | null }>,
    nfeErrorCount: nfeErrors.count ?? 0,
    nfeSamples: (nfeErrors.data ?? []) as Array<{ id: string; nfe_status: string | null; nfe_rejection_message: string | null }>,
    lastReconcileAt: (lastReconcile.data?.[0] as { cielo_last_check_at?: string } | undefined)?.cielo_last_check_at ?? null,
    cashbackBalance,
    cashbackEntries,
    unauthorized24h: unauthorized.count ?? 0,
    pendingOrders24h: pendingOrders.count ?? 0,
  };
}

type Tone = "ok" | "warn" | "bad";

function Card({
  icon: Icon,
  title,
  value,
  hint,
  tone = "ok",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{title}</span>
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-black leading-tight break-words",
          tone === "bad" ? "text-destructive" : tone === "warn" ? "text-accent" : "text-foreground",
        )}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function HealthPage() {
  const [roles, setRoles] = useState<RoleSummary | null>(null);
  useEffect(() => { getRoleSummary().then(setRoles); }, []);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: loadHealth,
    enabled: !!roles?.isSuperAdmin,
    staleTime: 60_000,
  });

  if (roles && !roles.isSuperAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Acesso restrito ao Super Admin.</p>
      </div>
    );
  }

  const webhookStale = data ? !data.lastWebhookAt || Date.now() - new Date(data.lastWebhookAt).getTime() > 48 * 3600_000 : false;

  return (
    <div className="flex-1 flex flex-col">
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-accent font-bold flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 shrink-0" /> Somente leitura
            </div>
            <h1 className="display text-3xl truncate">Saúde do sistema</h1>
            <p className="text-sm text-muted-foreground">Panorama operacional com dados já existentes.</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 min-h-11 px-4 rounded-md border border-border bg-card text-xs font-bold uppercase tracking-wider hover:bg-secondary shrink-0"
          >
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Atualizar
          </button>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1">
        {!data ? (
          <AdminSkeleton variant="cards" rows={6} />
        ) : (
          <>
            {data.unauthorized24h >= 5 && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
                <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0 text-sm">
                  <p className="font-bold text-destructive">Muitas rejeições 401 nos webhooks</p>
                  <p className="text-muted-foreground">
                    {data.unauthorized24h} tentativas não autorizadas nas últimas 24h. Verifique o segredo de cron e a
                    lista de IPs permitidos.
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card
                icon={CreditCard}
                title="Último webhook de pagamento"
                value={ago(data.lastWebhookAt)}
                hint={data.lastWebhookAt ? new Date(data.lastWebhookAt).toLocaleString("pt-BR") : "Nenhum evento registrado"}
                tone={webhookStale ? "warn" : "ok"}
              />
              <Card
                icon={RefreshCw}
                title="Última reconciliação"
                value={ago(data.lastReconcileAt)}
                hint={`Última tentativa de pagamento: ${ago(data.lastMpAttemptAt)}`}
                tone={data.lastReconcileAt ? "ok" : "warn"}
              />
              <Card
                icon={Undo2}
                title="Estornos pendentes"
                value={String(data.refundPending)}
                hint={data.refundSamples[0]?.last_error ?? "Fila de estornos sem erros recentes"}
                tone={data.refundPending > 0 ? "warn" : "ok"}
              />
              <Card
                icon={FileText}
                title="NF-e com erro"
                value={String(data.nfeErrorCount)}
                hint={data.nfeSamples[0]?.nfe_rejection_message ?? "Nenhuma rejeição registrada"}
                tone={data.nfeErrorCount > 0 ? "bad" : "ok"}
              />
              <Card
                icon={Coins}
                title="Cashback em circulação"
                value={brl(data.cashbackBalance)}
                hint={`${data.cashbackEntries} lançamento(s) ativos`}
              />
              <Card
                icon={AlertTriangle}
                title="Pedidos pendentes (24h)"
                value={String(data.pendingOrders24h)}
                hint="Pedidos criados e ainda não confirmados"
                tone={data.pendingOrders24h > 10 ? "warn" : "ok"}
              />
            </div>

            {data.refundSamples.length > 0 && (
              <div className="mt-6 bg-card border border-border rounded-lg p-4">
                <h2 className="text-sm font-black uppercase tracking-wider mb-2">Fila de estornos</h2>
                <ul className="space-y-1 text-xs">
                  {data.refundSamples.map((r) => (
                    <li key={r.id} className="flex flex-wrap gap-2">
                      <span className="font-mono text-muted-foreground">{r.id.slice(0, 8)}</span>
                      <span className="font-bold uppercase">{r.status}</span>
                      {r.last_error && <span className="text-destructive break-all">{r.last_error}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.nfeErrorCount === 0 && data.refundPending === 0 && !webhookStale && (
              <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" /> Nenhum problema detectado.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
