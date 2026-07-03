import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CustomerRow = {
  nome: string;
  email: string;
  whatsapp: string;
};

/**
 * Retorna a lista consolidada e atualizada de clientes (nome, email, whatsapp)
 * a partir da tabela profiles. Restrito a admins.
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
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, phone")
      .order("full_name", { ascending: true, nullsFirst: false });
    if (error) throw error;

    return (data ?? [])
      .map((p) => ({
        nome: (p.full_name ?? "").trim(),
        email: (p.email ?? "").trim(),
        whatsapp: (p.phone ?? "").trim(),
      }))
      .filter((r) => r.email || r.whatsapp);
  });
