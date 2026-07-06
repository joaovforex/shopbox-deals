import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, Undo2, Printer, Search, X, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { isSuperAdmin } from "@/lib/products";
import { brl } from "@/lib/format";
import { listRefunds, getRefundConsistency, reinstateOrderAsPaid, type RefundHistoryRow } from "@/lib/refunds.functions";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/admin/reembolsos")({
  head: () => ({ meta: [{ title: "Reembolsos · Admin" }] }),
  beforeLoad: async () => {
    const allowed = await isSuperAdmin();
    if (!allowed) throw redirect({ to: "/admin" });
  },
  component: RefundsPage,
});


function RefundsPage() {
  const [search, setSearch] = useState("");
  const fetchRefunds = useServerFn(listRefunds);
  const fetchConsistency = useServerFn(getRefundConsistency);
  const reinstate = useServerFn(reinstateOrderAsPaid);
  const qc = useQueryClient();
  const [reinstatingId, setReinstatingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [feedback, setFeedback] = useState<{ orderId: string; kind: "ok" | "err"; msg: string } | null>(null);

  const handleReinstate = async (o: { id: string; customer_name: string | null }) => {
    if (confirmText.trim() !== "CONFIRMAR PAGAMENTO") {
      setFeedback({ orderId: o.id, kind: "err", msg: 'Digite exatamente CONFIRMAR PAGAMENTO no campo acima.' });
      return;
    }
    const label = o.customer_name ?? o.id.slice(0, 8).toUpperCase();
    setReinstatingId(o.id);
    setFeedback(null);
    try {
      await reinstate({ data: { orderId: o.id, confirmText: confirmText.trim() } });
      await qc.invalidateQueries({ queryKey: ["admin-refunds-consistency"] });
      setFeedback({ orderId: o.id, kind: "ok", msg: `Pedido de ${label} reintegrado. Já aparece em /admin/expedicao.` });
      setResolvingId(null);
      setConfirmText("");
    } catch (e) {
      setFeedback({ orderId: o.id, kind: "err", msg: (e as Error).message });
    } finally {
      setReinstatingId(null);
    }
  };


  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-refunds"],
    queryFn: () => fetchRefunds({}),
  });

  const { data: consistency } = useQuery({
    queryKey: ["admin-refunds-consistency"],
    queryFn: () => fetchConsistency({}),
    refetchInterval: 60_000,
  });

  const verificationByOrder = useMemo(() => {
    const m = new Map<string, NonNullable<typeof consistency>["verifications"][number]>();
    for (const v of consistency?.verifications ?? []) m.set(v.orderId, v);
    return m;
  }, [consistency]);

  const rows = useMemo(() => {
    const list = data ?? [];
    const t = search.trim().toLowerCase();
    if (!t) return list;
    const digits = t.replace(/\D/g, "");
    return list.filter((r) => {
      const name = (r.customer_name ?? "").toLowerCase();
      const cpf = (r.customer_cpf ?? "").replace(/\D/g, "");
      const id = r.order_id.toLowerCase();
      return (
        name.includes(t) ||
        (digits.length > 0 && cpf.includes(digits)) ||
        id.includes(t)
      );
    });
  }, [data, search]);

  const totals = useMemo(() => {
    const list = data ?? [];
    return {
      count: list.length,
      sum: list.reduce((s, r) => s + Number(r.amount), 0),
    };
  }, [data]);


  const reprint = async (r: RefundHistoryRow) => {
    const { printRefundReceipt } = await import("@/lib/refundReceipt");
    printRefundReceipt({
      orderId: r.order_id,
      customerName: r.customer_name ?? "—",
      customerPhone: r.customer_phone,
      customerEmail: r.customer_email,
      paymentMethod: r.payment_method,
      orderTotal: r.order_total ?? r.amount,
      refundedAmount: r.amount,
      isFull: r.is_full,
      reason: r.reason,
      operatorName: r.operator_name ?? "—",
      refundedAt: r.created_at,
      mpRefundId: r.mp_refund_id ?? "",
      items: r.items ?? [],
    });
  };

  return (
    <Shell>
      <section className="bg-card border-b-4 border-amber-500">
        <div className="container mx-auto px-4 py-6">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao admin
          </Link>
          <div className="text-xs uppercase tracking-widest text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1.5">
            <Undo2 className="h-3.5 w-3.5" /> Histórico
          </div>
          <h1 className="display text-3xl md:text-4xl">Reembolsos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lista completa de estornos emitidos via Mercado Pago. Reimprima o comprovante a qualquer momento.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Reembolsos" value={String(totals.count)} />
          <Kpi label="Valor total estornado" value={brl(totals.sum)} accent />
        </div>

        {consistency && consistency.inconsistent.length > 0 && (
          <div className="border-2 border-destructive bg-destructive/10 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-destructive">
              <ShieldAlert className="h-5 w-5" />
              {consistency.inconsistent.length} pedido(s) inconsistente(s)
            </div>
            <p className="text-xs text-muted-foreground">
              Pedidos marcados como <strong>cancelled</strong> com pagamento <strong>approved</strong> no
              Mercado Pago mas <strong>sem registro em refunds</strong>. Se o cliente foi de fato debitado,
              use <strong>"Confirmar pagamento e enviar p/ expedição"</strong>. Se não, emita o estorno.
            </p>
            <ul className="text-xs divide-y divide-destructive/20">
              {consistency.inconsistent.map((o) => (
                <li key={o.id} className="py-2 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-mono text-[11px]">#{o.id.slice(0, 8).toUpperCase()}</div>
                      <div className="font-bold">{o.customer_name ?? "—"}</div>
                      <div className="text-muted-foreground">
                        {brl(o.total)} · MP {o.mp_payment_id ?? "—"} ·{" "}
                        {new Date(o.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <button
                      onClick={() => setResolvingId((cur) => (cur === o.id ? null : o.id))}
                      className="text-[11px] font-bold uppercase tracking-wider bg-destructive text-destructive-foreground px-3 py-1.5 rounded hover:opacity-90"
                    >
                      {resolvingId === o.id ? "Fechar" : "Resolver"}
                    </button>
                  </div>
                  {resolvingId === o.id && (
                    <div className="bg-background border border-border rounded p-3 space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Como este pedido deve ser resolvido?
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          onClick={() => handleReinstate(o)}
                          disabled={reinstatingId === o.id}
                          className="text-left text-[11px] bg-emerald-600 text-white px-3 py-2 rounded hover:opacity-90 disabled:opacity-50"
                        >
                          <div className="font-bold uppercase tracking-wider">
                            {reinstatingId === o.id ? "Confirmando..." : "✓ Passar para expedição"}
                          </div>
                          <div className="opacity-90 mt-0.5 normal-case font-normal">
                            Cliente foi debitado. Volta o pedido para pago e envia à expedição.
                          </div>
                        </button>
                        <Link
                          to="/admin/pedidos"
                          className="text-left text-[11px] bg-amber-600 text-white px-3 py-2 rounded hover:opacity-90 block"
                        >
                          <div className="font-bold uppercase tracking-wider">↩ Emitir reembolso</div>
                          <div className="opacity-90 mt-0.5 normal-case font-normal">
                            Estorna o valor no Mercado Pago e devolve para o cliente.
                          </div>
                        </Link>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {consistency && consistency.inconsistent.length === 0 && (
          <div className="border border-emerald-500/40 bg-emerald-500/10 rounded-lg p-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Nenhuma inconsistência detectada. Todos os pedidos cancelados com pagamento aprovado têm reembolso registrado.
          </div>
        )}


        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, CPF ou ID do pedido..."
                className="w-full pl-9 pr-8 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando reembolsos...</div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {(error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {search ? "Nenhum reembolso encontrado para esta busca." : "Nenhum reembolso registrado ainda."}
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.id} className="p-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] text-muted-foreground">
                          #{r.order_id.slice(0, 8).toUpperCase()}
                          {r.mp_refund_id && (
                            <span className="ml-2">MP: {r.mp_refund_id}</span>
                          )}
                        </div>
                        <div className="font-bold text-base break-words">{r.customer_name ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground space-y-0.5">
                          {r.customer_cpf && <div>CPF: {formatCpf(r.customer_cpf)}</div>}
                          {r.customer_phone && <div>📱 {r.customer_phone}</div>}
                          {r.customer_email && <div className="break-all">✉️ {r.customer_email}</div>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="display text-xl text-amber-700 dark:text-amber-400">
                          {brl(Number(r.amount))}
                        </div>
                        <span
                          className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mt-1 ${
                            r.is_full
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {r.is_full ? "Total" : "Parcial"}
                        </span>
                      </div>
                    </div>

                    {r.items && r.items.length > 0 && (
                      <ul className="text-xs text-muted-foreground pl-3 border-l-2 border-border space-y-0.5">
                        {r.items.map((it, i) => (
                          <li key={i}>
                            {it.quantity}x {it.name}
                            {it.color && <span className="text-foreground/70"> · {it.color}</span>}
                            <span className="text-foreground/70"> · {brl(it.unitPrice)}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="text-xs bg-secondary/40 rounded px-3 py-2 space-y-1">
                      <div>
                        <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Motivo: </span>
                        {r.reason}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>🕒 {new Date(r.created_at).toLocaleString("pt-BR")}</span>
                        {r.operator_name && <span>👤 {r.operator_name}</span>}
                        {r.payment_method && (
                          <span className="uppercase">💳 {r.payment_method}</span>
                        )}
                      </div>
                    </div>

                    <VerificationBadge v={verificationByOrder.get(r.order_id)} />



                    <div className="flex justify-end">
                      <button
                        onClick={() => reprint(r)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground hover:opacity-90 px-3 py-2 rounded"
                      >
                        <Printer className="h-3.5 w-3.5" /> Reimprimir comprovante
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg p-4 border ${
        accent ? "bg-amber-500/10 border-amber-500/40" : "bg-card border-border"
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`display text-2xl mt-1 ${accent ? "text-amber-700 dark:text-amber-400" : ""}`}>{value}</div>
    </div>
  );
}

function VerificationBadge({
  v,
}: {
  v: { ok: boolean; issue: string | null; orderExists: boolean; orderStatus: string | null; mpPaymentStatus: string | null } | undefined;
}) {
  if (!v) {
    return (
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" /> Verificando...
      </div>
    );
  }
  if (v.ok) {
    return (
      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Verificado:{" "}
        {v.orderExists
          ? `pedido em ${v.orderStatus ?? "—"} · registro em refunds OK`
          : "pedido removido · registro em refunds OK"}
      </div>
    );
  }
  return (
    <div className="text-[11px] text-destructive flex items-start gap-1.5 bg-destructive/10 border border-destructive/40 rounded px-2 py-1">
      <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>
        <strong>Inconsistência:</strong> {v.issue} (status={v.orderStatus ?? "—"}, mp=
        {v.mpPaymentStatus ?? "—"})
      </span>
    </div>
  );
}



function formatCpf(c: string) {
  const d = c.replace(/\D/g, "").padStart(11, "0").slice(0, 11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
