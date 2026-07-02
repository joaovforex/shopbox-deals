import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, Gift, Search, X, AlertTriangle } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { isSuperAdmin } from "@/lib/products";
import { brl } from "@/lib/format";
import { listExchangeVouchers } from "@/lib/exchange-vouchers.functions";

export const Route = createFileRoute("/_authenticated/admin/vale-troca")({
  head: () => ({ meta: [{ title: "Vale-Troca · Admin" }] }),
  beforeLoad: async () => {
    const allowed = await isSuperAdmin();
    if (!allowed) throw redirect({ to: "/admin" });
  },
  component: VoucherPage,
});

function VoucherPage() {
  const [search, setSearch] = useState("");
  const fetchList = useServerFn(listExchangeVouchers);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-exchange-vouchers"],
    queryFn: () => fetchList({}),
  });

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

  return (
    <Shell>
      <section className="bg-card border-b-4 border-emerald-500">
        <div className="container mx-auto px-4 py-6">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao admin
          </Link>
          <div className="text-xs uppercase tracking-widest text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" /> Histórico
          </div>
          <h1 className="display text-3xl md:text-4xl">Vale-Troca</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Trocas por avaria/mal funcionamento convertidas em cashback para uso no site. Expira em 30 dias.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Vales emitidos" value={String(totals.count)} />
          <Kpi label="Total em cashback" value={brl(totals.sum)} accent />
        </div>

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
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando vale-trocas...</div>
          ) : error ? (
            <div className="p-6 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {(error as Error).message}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {search ? "Nenhum vale-troca encontrado." : "Nenhum vale-troca emitido ainda."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-muted-foreground">
                        #{r.order_id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="font-bold text-base break-words">{r.customer_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        {r.customer_cpf && <div>CPF: {formatCpf(r.customer_cpf)}</div>}
                        {r.customer_phone && <div>📱 {r.customer_phone}</div>}
                        {r.customer_email && <div className="break-all">✉️ {r.customer_email}</div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="display text-xl text-emerald-700 dark:text-emerald-400">
                        {brl(Number(r.amount))}
                      </div>
                      <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mt-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        Cashback
                      </span>
                    </div>
                  </div>

                  {r.items && r.items.length > 0 && (
                    <ul className="text-xs text-muted-foreground pl-3 border-l-2 border-border space-y-0.5">
                      {r.items.map((it, i) => (
                        <li key={i}>
                          {it.quantity}x {it.name}
                          {it.color && <span className="text-foreground/70"> · {it.color}</span>}
                          <span className="text-foreground/70"> · {brl(it.subtotal ?? it.unitPrice * it.quantity)}</span>
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
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-4 border ${accent ? "bg-emerald-500/10 border-emerald-500/40" : "bg-card border-border"}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`display text-2xl mt-1 ${accent ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</div>
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
