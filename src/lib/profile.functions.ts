import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCpf } from "@/lib/cpf";

export type ProfileUpdateInput = {
  full_name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  birth_date?: string | null;
  address_zip?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string | null;
  address_district?: string | null;
  address_city?: string;
  address_state?: string;
};

function digits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProfileUpdateInput) => {
    if (!data || typeof data !== "object") throw new Error("Dados inválidos");
    const out: Record<string, string | null> = {};
    if (data.full_name !== undefined) {
      const v = data.full_name.trim();
      if (v && (v.length < 2 || v.length > 120)) throw new Error("Nome inválido");
      out.full_name = v || null;
    }
    if (data.email !== undefined) {
      const v = data.email.trim().toLowerCase();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error("Email inválido");
      out.email = v || null;
    }
    if (data.phone !== undefined) {
      const p = digits(data.phone);
      if (p && !/^[0-9]{10,11}$/.test(p)) throw new Error("Telefone inválido");
      out.phone = p || null;
    }
    if (data.cpf !== undefined) {
      const c = digits(data.cpf);
      if (c && !isValidCpf(c)) throw new Error("CPF inválido");
      out.cpf = c || null;
    }
    if (data.birth_date !== undefined) {
      if (data.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.birth_date)) throw new Error("Data inválida");
      out.birth_date = data.birth_date || null;
    }
    if (data.address_zip !== undefined) {
      const z = digits(data.address_zip);
      if (z && z.length !== 8) throw new Error("CEP inválido");
      out.address_zip = z || null;
    }
    for (const f of ["address_street","address_number","address_complement","address_district","address_city","address_state"] as const) {
      if (data[f] !== undefined) {
        const v = (data[f] ?? "").toString().trim();
        if (v.length > 200) throw new Error("Campo de endereço muito longo");
        out[f] = v || null;
      }
    }
    return out;
  })
  .handler(async ({ data, context }) => {
    if (Object.keys(data).length === 0) return { ok: true };
    // Upsert por id (cobre o caso raro de o profile não existir)
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ id: context.userId, ...(data as Record<string, unknown>) } as never, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
