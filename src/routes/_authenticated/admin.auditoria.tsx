import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getRoleSummary, type RoleSummary } from "@/lib/products";
import { normalizeSearchTerm } from "@/lib/pgrst";
import { AdminSkeleton } from "@/components/admin/AdminSkeleton";
import { actionLabel, situationText, auditLink, changedFields, auditContext, type AuditLogRow } from "@/lib/audit-format";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
  head: () => ({
    meta: [
      { title: "Log de auditoria · Admin · shopbox" },
      { name: "description", content: "Histórico de ações sensíveis do painel administrativo." },
    ],
  }),
  component: AuditLogPage,
});

const PAGE_SIZE = 50;

type AuditRow = AuditLogRow;

function fmt(ts: string) {
  return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function AuditLogPage() {
  const [roles, setRoles] = useState<RoleSummary | null>(null);
  const [page, setPage] = useState(0);
  const [term, setTerm] = useState("");
  const navigate = Route.useNavigate();

  useEffect(() => { getRoleSummary().then(setRoles); }, []);

  const enabled = !!roles?.isSuperAdmin;

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin", "audit-log", page, term],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from("admin_audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const t = normalizeSearchTerm(term);
      if (t) q = q.ilike("search_norm", `%${t}%`);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as AuditRow[], total: count ?? 0 };
    },
  });

  if (roles && !roles.isSuperAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Acesso restrito ao Super Admin.</p>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="flex-1 flex flex-col">
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-accent font-bold flex items-center gap-2">
              <ScrollText className="h-3.5 w-3.5 shrink-0" /> Segurança
            </div>
            <h1 className="display text-3xl truncate">Log de auditoria</h1>
            <p className="text-sm text-muted-foreground">{total} registro(s)</p>
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
        <input
          type="search"
          value={term}
          onChange={(e) => { setPage(0); setTerm(e.target.value); }}
          placeholder="Filtrar por ação, entidade ou usuário..."
          className="w-full max-w-md h-11 px-4 mb-4 rounded-md border border-border bg-card text-sm focus:outline-none focus:border-primary"
        />

        {isFetching && rows.length === 0 ? (
          <AdminSkeleton variant="table" rows={8} />
        ) : rows.length === 0 ? (
          <div className="text-center py-16 bg-card rounded-lg border border-border">
            <p className="text-muted-foreground text-sm">Nenhum registro de auditoria.</p>
          </div>
        ) : (
          <>
            {/* Mobile: cartões */}
            <div className="md:hidden flex flex-col gap-3">
              {rows.map((r) => {
                const href = auditLink(r);
                const body = (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm truncate">{actionLabel(r)}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{fmt(r.created_at)}</span>
                    </div>
                    <div className="text-xs mt-1">{r.user_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">{situationText(r)}</div>
                    {href && (
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                        Ver <ExternalLink className="h-3 w-3" />
                      </span>
                    )}
                  </>
                );
                return href ? (
                  <Link key={r.id} to={href as never} className="bg-card border border-border rounded-lg p-3 block hover:border-primary">
                    {body}
                  </Link>
                ) : (
                  <div key={r.id} className="bg-card border border-border rounded-lg p-3">{body}</div>
                );
              })}
            </div>

            {/* Desktop: tabela */}
            <div className="hidden md:block overflow-x-auto bg-card rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-left text-xs uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Quando</th>
                    <th className="p-3">Usuário</th>
                    <th className="p-3">Ação</th>
                    <th className="p-3">Situação</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const href = auditLink(r);
                    return (
                      <tr
                        key={r.id}
                        className={`border-t border-border align-top ${href ? "hover:bg-secondary/60 cursor-pointer" : ""}`}
                        onClick={href ? () => navigate({ to: href as never }) : undefined}
                      >
                        <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.created_at)}</td>
                        <td className="p-3">{r.user_name ?? "—"}</td>
                        <td className="p-3 font-semibold">{actionLabel(r)}</td>
                        <td className="p-3 text-xs text-muted-foreground max-w-xl">{situationText(r)}</td>
                        <td className="p-3">
                          {href && <ExternalLink className="h-4 w-4 text-primary" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="inline-flex items-center gap-1 min-h-11 px-4 rounded-md border border-border bg-card text-xs font-bold uppercase disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <span className="text-xs text-muted-foreground">Página {page + 1} de {lastPage + 1}</span>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 min-h-11 px-4 rounded-md border border-border bg-card text-xs font-bold uppercase disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
