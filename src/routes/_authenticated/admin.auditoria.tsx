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
  const [openId, setOpenId] = useState<string | null>(null);

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
                const isOpen = openId === r.id;
                return (
                  <div key={r.id} className="bg-card border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm truncate">{actionLabel(r)}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{fmt(r.created_at)}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5 break-all">{r.action}{r.entity ? ` · ${r.entity}` : ""}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}</div>
                    <div className="text-xs mt-1">{r.user_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground mt-1">{situationText(r)}</div>
                    <div className="mt-2 flex items-center gap-4">
                      {href && (
                        <Link to={href as never} className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary">Ver <ExternalLink className="h-3 w-3" /></Link>
                      )}
                      <button type="button" onClick={() => setOpenId(isOpen ? null : r.id)} className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {isOpen ? "Ocultar" : "Detalhes"} {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    </div>
                    {isOpen && <div className="mt-3 border-t border-border/50 pt-3"><AuditDetail row={r} /></div>}
                  </div>
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
                    const isOpen = openId === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr className="border-t border-border align-top hover:bg-secondary/60">
                          <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.created_at)}</td>
                          <td className="p-3">{r.user_name ?? "—"}</td>
                          <td className="p-3">
                            <div className="font-semibold">{actionLabel(r)}</div>
                            <div className="text-[10px] text-muted-foreground font-mono break-all">{r.action}{r.entity ? ` · ${r.entity}` : ""}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ""}</div>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground max-w-xl">{situationText(r)}</td>
                          <td className="p-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {href && (
                                <Link to={href as never} className="text-primary" title="Abrir registro"><ExternalLink className="h-4 w-4" /></Link>
                              )}
                              <button type="button" onClick={() => setOpenId(isOpen ? null : r.id)} className="text-muted-foreground hover:text-foreground" title="Ver detalhes">
                                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-border bg-secondary/30">
                            <td colSpan={5} className="p-4"><AuditDetail row={r} /></td>
                          </tr>
                        )}
                      </Fragment>
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

function AuditDetail({ row }: { row: AuditRow }) {
  const changes = changedFields(row);
  const ctx = auditContext(row);
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="space-y-3 text-xs">
      {ctx.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {ctx.map((c, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0">{c.label}:</span>
              <span className="font-medium break-all">{c.value}</span>
            </div>
          ))}
        </div>
      )}
      {changes.length > 0 && (
        <div className="border-t border-border/50 pt-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">Alterações ({changes.length})</div>
          <div className="space-y-1">
            {changes.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1">
                <span className="font-semibold">{c.label}:</span>
                <span className="line-through text-muted-foreground break-all">{c.before}</span>
                <span>→</span>
                <span className="text-foreground font-medium break-all">{c.after}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="border-t border-border/50 pt-2">
        <button type="button" onClick={() => setShowRaw((v) => !v)} className="text-[11px] font-bold uppercase tracking-wider text-primary">
          {showRaw ? "Ocultar dados brutos" : "Ver dados brutos (JSON)"}
        </button>
        {showRaw && (
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-background border border-border p-3 text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(row.details ?? {}, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
