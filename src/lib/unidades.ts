import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Unidade = Database["public"]["Tables"]["unidades"]["Row"];

export async function fetchUnidades(opts: { onlyActive?: boolean } = {}): Promise<Unidade[]> {
  let q = supabase.from("unidades").select("*").order("ordem", { ascending: true });
  if (opts.onlyActive) q = q.eq("ativa", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export type UnidadeInput = {
  nome: string;
  slug?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  horario_retirada?: string | null;
  ativa?: boolean;
  ordem?: number;
};

// Escrita protegida por RLS: apenas admin e manager conseguem gravar.
export async function saveUnidade(id: string | null, input: UnidadeInput): Promise<void> {
  if (id) {
    const { data, error } = await supabase.from("unidades").update(input).eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Sem permissão para editar unidades.");
    return;
  }
  const { data, error } = await supabase.from("unidades").insert(input).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Sem permissão para criar unidades.");
}

export function unidadeEndereco(u: Unidade): string {
  const linha1 = [u.rua, u.numero].filter(Boolean).join(", ");
  const linha2 = [u.bairro, [u.cidade, u.estado].filter(Boolean).join(" / ")].filter(Boolean).join(" — ");
  return [linha1, u.complemento, linha2].filter(Boolean).join(" — ");
}
