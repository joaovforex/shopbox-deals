import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, UserPlus, Trash2, Crown, Package, Truck, User, KeyRound, UserX, ShieldCheck } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, type TeamRole } from "@/lib/products";
import { searchTeamCandidates, assignTeamRole, removeTeamRole, adminResetPassword, adminDeleteUser } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/admin/equipe")({
  head: () => ({ meta: [{ title: "Equipe · Admin" }] }),
  component: TeamPage,
});

type Member = {
  user_id: string;
  full_name: string | null;
  roles: TeamRole[];
};

const ROLE_LABEL: Record<TeamRole, string> = {
  admin: "Super Admin (Dono · acesso total)",
  manager: "ADM (Catálogo + Expedição)",
  catalog: "Catálogo (somente)",
  fulfillment: "Expedição (somente)",
  user: "Cliente",
};

const ROLE_ICON: Record<TeamRole, React.ReactNode> = {
  admin: <Crown className="h-3.5 w-3.5" />,
  manager: <ShieldCheck className="h-3.5 w-3.5" />,
  catalog: <Package className="h-3.5 w-3.5" />,
  fulfillment: <Truck className="h-3.5 w-3.5" />,
  user: <User className="h-3.5 w-3.5" />,
};

const ASSIGNABLE: TeamRole[] = ["admin", "manager", "catalog", "fulfillment"];

function TeamPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const qc = useQueryClient();

  useEffect(() => { isAdmin().then(setAdmin); }, []);

  const { data: members = [], refetch } = useQuery({
    queryKey: ["team-members"],
    enabled: admin === true,
    queryFn: async () => {
      const { data: roles, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map = new Map<string, Member>();
      for (const r of roles ?? []) {
        const cur = map.get(r.user_id) ?? {
          user_id: r.user_id,
          full_name: profs?.find((p) => p.id === r.user_id)?.full_name ?? null,
          roles: [],
        };
        cur.roles.push(r.role as TeamRole);
        map.set(r.user_id, cur);
      }
      return [...map.values()];
    },
  });

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const doSearch = useServerFn(searchTeamCandidates);
  const doAssign = useServerFn(assignTeamRole);
  const doRemove = useServerFn(removeTeamRole);
  const doResetPassword = useServerFn(adminResetPassword);
  const doDeleteUser = useServerFn(adminDeleteUser);

  const resetPassword = async (user_id: string, label: string) => {
    const pw = prompt(`Nova senha para ${label} (mínimo 8 caracteres):`);
    if (!pw) return;
    if (pw.length < 8) return toast.error("Senha precisa ter ao menos 8 caracteres");
    try {
      await doResetPassword({ data: { user_id, new_password: pw } });
      toast.success("Senha redefinida. Avise o usuário.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao redefinir senha");
    }
  };

  const deleteUser = async (user_id: string, label: string) => {
    if (!confirm(`EXCLUIR a conta de "${label}" permanentemente? Esta ação não pode ser desfeita.`)) return;
    if (!confirm("Tem certeza absoluta? Todos os dados associados serão removidos.")) return;
    try {
      await doDeleteUser({ data: { user_id } });
      toast.success("Conta excluída");
      qc.invalidateQueries({ queryKey: ["team-members"] });
      refetch();
      setSearchResults((prev) => prev.filter((u) => u.id !== user_id));
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao excluir");
    }
  };

  const findUser = async () => {
    const term = search.trim();
    if (term.length < 2) {
      toast.error("Digite ao menos 2 caracteres");
      return;
    }
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await doSearch({ data: { term } });
      if (!res || res.length === 0) {
        toast.error("Ninguém encontrado. Confirme se a pessoa já criou conta.");
        return;
      }
      setSearchResults(res);
      // Atualiza a lista de membros para refletir os cargos atribuídos a quem foi buscado.
      qc.invalidateQueries({ queryKey: ["team-members"] });
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Erro na busca");
    } finally {
      setSearching(false);
    }
  };

  const rolesFor = (user_id: string): TeamRole[] =>
    (members.find((m) => m.user_id === user_id)?.roles ?? []).filter((r) => r !== "user");

  const assignRole = async (user_id: string, role: TeamRole) => {
    if (role === "admin" && !confirm("Atribuir SUPER ADMIN dá controle TOTAL da loja (produtos, pedidos, métricas e equipe). Confirma?")) return;
    if (role === "manager" && !confirm("Atribuir ADM dá acesso a Catálogo + Expedição (sem métricas/equipe). Confirma?")) return;
    try {
      const r = await doAssign({ data: { user_id, role: role as "admin" | "manager" | "catalog" | "fulfillment" } });
      if (!r.ok && r.reason === "duplicate") return toast.info("Essa função já está atribuída");
      toast.success(`Função "${ROLE_LABEL[role]}" atribuída`);
      qc.invalidateQueries({ queryKey: ["team-members"] });
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atribuir");
    }
  };

  const removeRole = async (user_id: string, role: TeamRole) => {
    if (!confirm(`Remover função "${ROLE_LABEL[role]}"?`)) return;
    try {
      await doRemove({ data: { user_id, role: role as "admin" | "manager" | "catalog" | "fulfillment" } });
      toast.success("Removida");
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao remover");
    }
  };

  if (admin === null) {
    return <Shell><div className="flex-1 flex items-center justify-center">Carregando...</div></Shell>;
  }
  if (!admin) {
    return <Shell><div className="flex-1 flex items-center justify-center p-6 text-muted-foreground">Acesso restrito a administradores.</div></Shell>;
  }

  return (
    <Shell>
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao admin
          </Link>
          <div className="text-xs uppercase tracking-widest text-accent font-bold">Painel</div>
          <h1 className="display text-3xl md:text-4xl">Equipe interna</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Defina quem cataloga produtos e quem processa pedidos para envio/retirada.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 space-y-6">
        <div className="bg-card border border-border rounded-lg p-5 space-y-3">
          <h2 className="display text-lg flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Adicionar pessoa à equipe</h2>
          <p className="text-xs text-muted-foreground">
            A pessoa precisa ter criado uma conta na loja. Busque pelo nome cadastrado.
          </p>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou email"
              className="flex-1 bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), findUser())}
            />
            <button
              onClick={findUser}
              disabled={searching}
              className="bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-sm disabled:opacity-60"
            >
              {searching ? "..." : "Buscar"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="space-y-2">
              {searchResults.map((u) => (
                <div key={u.id} className="bg-secondary rounded-md p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{u.full_name ?? "(sem nome)"}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email ?? "(sem email)"}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{u.id.slice(0, 8)}...</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ASSIGNABLE.map((r) => (
                      <button
                        key={r}
                        onClick={() => assignRole(u.id, r)}
                        className="inline-flex items-center gap-1 text-xs bg-card border border-border hover:border-primary rounded px-2.5 py-1.5"
                      >
                        {ROLE_ICON[r]} {ROLE_LABEL[r]}
                      </button>
                    ))}
                    <button
                      onClick={() => resetPassword(u.id, u.full_name ?? u.email ?? u.id.slice(0,8))}
                      className="inline-flex items-center gap-1 text-xs bg-card border border-border hover:border-accent rounded px-2.5 py-1.5"
                      title="Definir nova senha"
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Resetar senha
                    </button>
                    <button
                      onClick={() => deleteUser(u.id, u.full_name ?? u.email ?? u.id.slice(0,8))}
                      className="inline-flex items-center gap-1 text-xs bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 rounded px-2.5 py-1.5"
                      title="Excluir cadastro"
                    >
                      <UserX className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary">
            <h2 className="display text-lg">Membros e funções</h2>
            <p className="text-xs text-muted-foreground">{members.filter((m) => m.roles.some((r) => r !== "user")).length} pessoas com funções internas</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="p-3">Pessoa</th><th className="p-3">Funções</th><th className="p-3 text-right">Ações</th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-t border-border">
                    <td className="p-3">
                      <div className="font-semibold">{m.full_name ?? "(sem nome)"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{m.user_id.slice(0, 8)}...</div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {m.roles.map((r) => (
                          <span
                            key={r}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-bold ${
                              r === "admin" ? "bg-primary/20 text-primary" :
                              r === "manager" ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400" :
                              r === "catalog" ? "bg-accent/20 text-accent" :
                              r === "fulfillment" ? "bg-[#25D366]/20 text-[#25D366]" :
                              "bg-muted text-muted-foreground"
                            }`}
                          >
                            {ROLE_ICON[r]} {ROLE_LABEL[r]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end flex-wrap gap-1">
                        {m.roles.filter((r) => r !== "user").map((r) => (
                          <button
                            key={r}
                            onClick={() => removeRole(m.user_id, r)}
                            className="inline-flex items-center gap-1 text-xs hover:bg-destructive/10 text-destructive rounded px-2 py-1"
                            title={`Remover ${ROLE_LABEL[r]}`}
                          >
                            <Trash2 className="h-3 w-3" /> {ROLE_LABEL[r]}
                          </button>
                        ))}
                        <button
                          onClick={() => resetPassword(m.user_id, m.full_name ?? m.user_id.slice(0,8))}
                          className="inline-flex items-center gap-1 text-xs hover:bg-accent/10 text-accent rounded px-2 py-1"
                          title="Resetar senha"
                        >
                          <KeyRound className="h-3 w-3" /> Senha
                        </button>
                        <button
                          onClick={() => deleteUser(m.user_id, m.full_name ?? m.user_id.slice(0,8))}
                          className="inline-flex items-center gap-1 text-xs hover:bg-destructive/20 text-destructive rounded px-2 py-1"
                          title="Excluir cadastro"
                        >
                          <UserX className="h-3 w-3" /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Shell>
  );
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
