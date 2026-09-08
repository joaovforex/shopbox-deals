import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Wallet, AlertTriangle, RefreshCw } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { getMyCashback } from "@/lib/cashback.functions";
import { fetchMyCashbackLedger, fetchCashbackRate, currentUserId } from "@/lib/account-queries";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cashback")({
  head: () => ({
    meta: [
      { title: "Meu cashback · shopbox" },
      { name: "description", content: "Saldo, validade e histórico do seu cashback shopbox." },
    ],
  }),
  component: CashbackPage,
});

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function entryLabel(kind: string): string {
  const map: Record<string, string> = {
    earn: "Cashback da compra",
    earned: "Cashback da compra",
    grant: "Crédito concedido pela loja",
    manual: "Crédito concedido pela loja",
    refund: "Devolução de cashback",
    voucher: "Vale-troca",
    bonus: "Bônus",
  };
  return map[kind.toLowerCase()] ?? "Crédito";
}

function CashbackPage() {
  const fetchBalance = useServerFn(getMyCashback);

  // Sessão primeiro: as chaves de cache carregam o id do usuário, então
  // trocar de conta (ou sair) nunca reaproveita dados de outra pessoa.
  const userQ = useQuery({ queryKey: ["session-user-id"], queryFn: currentUserId, staleTime: 0 });
  const uid = userQ.data ?? null;

  const balanceQ = useQuery({
    queryKey: ["cashback-balance", uid],
    queryFn: () => fetchBalance(),
    enabled: !!uid,
  });
  const ledgerQ = useQuery({
    queryKey: ["cashback-ledger", uid],
    queryFn: () => fetchMyCashbackLedger(uid!),
    enabled: !!uid,
  });
  const rateQ = useQuery({ queryKey: ["cashback-rate"], queryFn: fetchCashbackRate, staleTime: 300_000 });

  const balanceFailed = balanceQ.isError;
  const balance = Number(balanceQ.data?.balance ?? 0);
  const nextExpiry = balanceQ.data?.nextExpiry ?? null;
  const entries = ledgerQ.data ?? [];
  const rate = rateQ.data ?? null;


  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/minha-conta" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Minha conta
          </Link>
          <h1 className="display text-3xl md:text-4xl">Meu cashback</h1>
          <p className="text-sm text-muted-foreground">Saldo, validade e histórico de tudo que você ganhou e usou.</p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 max-w-3xl space-y-5 pb-24 md:pb-6">
        <div className="rounded-xl border-2 border-[#25D366]/40 bg-gradient-to-br from-[#25D366]/15 to-[#25D366]/5 p-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-[#25D366]/20 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-[#25D366]" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest font-bold text-[#25D366]">Saldo disponível</div>
              {balanceQ.isLoading ? (
                <div className="mt-1 h-8 w-32 rounded bg-muted animate-pulse" />
              ) : (
                <div className="display text-3xl text-[#25D366]">{brl(balance)}</div>
              )}
            </div>
          </div>
          {nextExpiry && nextExpiry.amount > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              <strong className="text-foreground">{brl(nextExpiry.amount)}</strong> expira em {daysUntil(nextExpiry.expiresAt)} dia(s).
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            O cashback entra como desconto direto no checkout da próxima compra.
          </p>
          {balance > 0 && (
            <Link
              to="/loja"
              className="mt-4 inline-flex items-center justify-center rounded-md bg-[#25D366] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white"
            >
              Usar agora na loja
            </Link>
          )}
        </div>

        <div>
          <h2 className="display text-xl mb-3">Histórico</h2>

          {ledgerQ.isLoading ? (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
              ))}
            </ul>
          ) : ledgerQ.isError ? (
            <ErrorBox onRetry={() => void ledgerQ.refetch()} />
          ) : entries.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="font-bold mb-1">Você ainda não tem cashback</p>
              <p className="text-sm text-muted-foreground">
                A cada compra concluída, uma parte do valor volta para você aqui.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => {
                const remaining = Math.max(0, Number(e.amount) - Number(e.consumed));
                const expired = !!e.expired_at || (!!e.expires_at && new Date(e.expires_at).getTime() < Date.now());
                const state = expired
                  ? { label: "Expirado", cls: "bg-muted text-muted-foreground" }
                  : remaining <= 0
                    ? { label: "Usado", cls: "bg-secondary text-muted-foreground" }
                    : { label: "Disponível", cls: "bg-[#25D366]/15 text-[#25D366]" };
                return (
                  <li key={e.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm">{entryLabel(e.kind)}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(e.created_at).toLocaleDateString("pt-BR")}
                          {e.order_id ? (
                            <>
                              {" · "}
                              <Link to="/pedido/$id" params={{ id: e.order_id }} className="text-primary hover:underline font-mono">
                                #{e.order_id.slice(0, 8).toUpperCase()}
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="display text-lg text-[#25D366]">{brl(Number(e.amount))}</div>
                        <span className={`inline-block text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${state.cls}`}>
                          {state.label}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {Number(e.consumed) > 0 && <>Usado: {brl(Number(e.consumed))} · </>}
                      Saldo desta entrada: {brl(remaining)}
                      {!expired && e.expires_at && <> · vence em {daysUntil(e.expires_at)} dia(s)</>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
      <div className="flex items-center gap-2 font-bold text-destructive">
        <AlertTriangle className="h-4 w-4" /> Não conseguimos carregar agora
      </div>
      <p className="text-muted-foreground mt-1">Verifique sua conexão e tente de novo.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-muted"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
      </button>
    </div>
  );
}
