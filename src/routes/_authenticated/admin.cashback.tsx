import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Coins, Search, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { isSuperAdmin } from "@/lib/products";
import { brl } from "@/lib/format";
import {
  searchCashbackCustomers,
  grantCashback,
  listManualCashbackGrants,
  type CashbackCustomer,
} from "@/lib/cashback-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/cashback")({
  head: () => ({
    meta: [
      { title: "Cashback manual · Admin" },
      { name: "description", content: "Conceda cashback manualmente para clientes específicos." },
      { property: "og:title", content: "Cashback manual · Admin" },
      { property: "og:description", content: "Conceda cashback manualmente para clientes específicos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const allowed = await isSuperAdmin();
    if (!allowed) throw redirect({ to: "/admin" });
  },
  component: CashbackAdminPage,
});

function CashbackAdminPage() {
  const qc = useQueryClient();
  const doSearch = useServerFn(searchCashbackCustomers);
  const doGrant = useServerFn(grantCashback);
  const fetchGrants = useServerFn(listManualCashbackGrants);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CashbackCustomer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CashbackCustomer | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const grants = useQuery({
    queryKey: ["admin-manual-cashback-grants"],
    queryFn: () => fetchGrants({}),
  });

  const amount = Math.max(0, Number((amountStr || "0").replace(",", ".")) || 0);
  const canSubmit = !!selected && amount > 0 && amount <= 5000 && reason.trim().length >= 5 && !busy;

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setMsg(null);
    try {
      const rows = await doSearch({ data: { term } });
      setResults(rows);
    } catch (err) {
      setMsg({ type: "err", text: (err as Error).message });
    } finally {
      setSearching(false);
    }
  }

  async function handleGrant() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      await doGrant({ data: { userId: selected.id, amount, reason: reason.trim(), days } });
      setMsg({ type: "ok", text: `${brl(amount)} de cashback concedido para ${selected.name}.` });
      setSelected(null);
      setAmountStr("");
      setReason("");
      setResults(null);
      setTerm("");
      qc.invalidateQueries({ queryKey: ["admin-manual-cashback-grants"] });
    } catch (err) {
      setMsg({ type: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="p-2 rounded hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="display text-2xl flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-600" />
              Cashback manual
            </h1>
            <p className="text-xs text-muted-foreground">
              Conceda cashback para um cliente específico. Somente Super Admin.
            </p>
          </div>
        </div>

        {msg && (
          <div
            className={`rounded-md border p-3 text-sm flex items-start gap-2 ${
              msg.type === "ok"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/40 bg-destructive/5 text-destructive"
            }`}
          >
            {msg.type === "ok" ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 mt-0.5" />
            )}
            <span>{msg.text}</span>
          </div>
        )}

        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar cliente por nome, e-mail, telefone ou CPF"
                className="w-full pl-9 pr-3 py-2 rounded border border-border bg-background text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={term.trim().length < 2 || searching}
              className="text-xs font-bold uppercase px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
            >
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {results && results.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}

          {results && results.length > 0 && (
            <ul className="divide-y divide-border border border-border rounded">
              {results.map((c) => (
                <li key={c.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[c.email, c.phone, c.cpf].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Saldo</div>
                    <div className="font-mono text-sm font-bold">{brl(c.balance)}</div>
                  </div>
                  <button
                    onClick={() => setSelected(c)}
                    className={`text-xs font-bold uppercase px-3 py-2 rounded border ${
                      selected?.id === c.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border"
                    }`}
                  >
                    {selected?.id === c.id ? "Selecionado" : "Selecionar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected && (
          <section className="rounded-lg border-2 border-amber-500/50 bg-amber-500/5 p-4 space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                Conceder cashback para
              </div>
              <div className="display text-lg">{selected.name}</div>
              <div className="text-xs text-muted-foreground">
                Saldo atual: <b className="font-mono">{brl(selected.balance)}</b>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">Valor *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                  <input
                    inputMode="decimal"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="0,00"
                    className="w-full pl-10 pr-3 py-2 rounded border border-border bg-background text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">Validade (dias) *</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider">Motivo *</label>
              <textarea
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: cortesia por atraso na entrega, campanha de fidelidade..."
                className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
              />
              <p className="text-[11px] text-muted-foreground">Mín. 5 caracteres · {reason.length}/500</p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelected(null)}
                className="text-xs font-bold uppercase px-4 py-2 rounded border border-border"
              >
                Cancelar
              </button>
              <button
                onClick={handleGrant}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase px-4 py-2 rounded bg-amber-600 text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                {busy ? "Concedendo..." : `Conceder ${brl(amount)}`}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="display text-base mb-3">Últimas concessões manuais</h2>
          {grants.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {grants.error && (
            <p className="text-sm text-destructive">{(grants.error as Error).message}</p>
          )}
          {grants.data && grants.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma concessão manual ainda.</p>
          )}
          {grants.data && grants.data.length > 0 && (
            <ul className="divide-y divide-border">
              {grants.data.map((g) => (
                <li key={g.id} className="py-2 flex items-start gap-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{g.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(g.created_at).toLocaleString("pt-BR")}
                      {g.expires_at ? ` · expira ${new Date(g.expires_at).toLocaleDateString("pt-BR")}` : ""}
                      {g.reason ? ` · ${g.reason}` : ""}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-amber-700 dark:text-amber-400">{brl(g.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
