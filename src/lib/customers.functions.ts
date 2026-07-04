import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CustomerRow = {
  nome: string;
  email: string;
  whatsapp: string;
};

/**
 * Retorna a lista consolidada e atualizada de clientes (nome, email, whatsapp).
 * Combina profiles (nome, telefone, email opcional) com auth.users (email
 * autoritativo do cadastro). Restrito a admins.
 */
export const listAllCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomerRow[]> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, phone")
      .order("full_name", { ascending: true, nullsFirst: false });
    if (profErr) throw profErr;

    // Busca emails autoritativos direto do auth (a coluna profiles.email
    // fica em branco pra maioria dos usuários — o email real vive em auth.users).
    const authEmails = new Map<string, string>();
    let page = 1;
    const perPage = 1000;
    // Paginação defensiva; a maioria dos projetos cabe em 1-2 páginas.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const u of users) {
        if (u.id && u.email) authEmails.set(u.id, u.email);
      }
      if (users.length < perPage) break;
      page += 1;
      if (page > 20) break; // teto de segurança
    }

    return (profiles ?? [])
      .map((p) => {
        const authEmail = p.id ? authEmails.get(p.id) : undefined;
        const email = (authEmail ?? p.email ?? "").trim();
        return {
          nome: (p.full_name ?? "").trim(),
          email,
          whatsapp: (p.phone ?? "").trim(),
        };
      })
      .filter((r) => r.email || r.whatsapp);
  });
