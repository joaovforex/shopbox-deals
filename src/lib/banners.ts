import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SiteBanner = {
  id: string;
  desktop_url: string;
  mobile_url: string;
  alt_text: string;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

const COLUMNS =
  "id,desktop_url,mobile_url,alt_text,link_url,sort_order,is_active,starts_at,ends_at";

/** Slides visíveis ao público: ativos e dentro da janela (RLS também filtra). */
export function isBannerVisible(b: SiteBanner, now: Date = new Date()): boolean {
  if (!b.is_active) return false;
  const t = now.getTime();
  if (b.starts_at && new Date(b.starts_at).getTime() > t) return false;
  if (b.ends_at && new Date(b.ends_at).getTime() <= t) return false;
  return true;
}

export function sortBanners(list: SiteBanner[]): SiteBanner[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export async function fetchActiveBanners(): Promise<SiteBanner[]> {
  const { data, error } = await supabase
    .from("site_banners")
    .select(COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as SiteBanner[];
  // Defesa em profundidade: a policy já filtra, mas o cache pode envelhecer.
  return sortBanners(rows.filter((b) => isBannerVisible(b)));
}

export const activeBannersQuery = () =>
  queryOptions({
    queryKey: ["site_banners", "active"],
    queryFn: fetchActiveBanners,
    staleTime: 60_000,
  });

export function useActiveBanners() {
  return useQuery(activeBannersQuery());
}

/** Admin (super admin): lista tudo, inclusive inativos/fora da janela. */
export async function fetchAllBanners(): Promise<SiteBanner[]> {
  const { data, error } = await supabase
    .from("site_banners")
    .select(COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return sortBanners((data ?? []) as SiteBanner[]);
}

export type BannerInput = {
  desktop_url: string;
  mobile_url: string;
  alt_text: string;
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

export function validateBanner(input: BannerInput): string | null {
  if (!input.desktop_url || !input.mobile_url) {
    return "Envie as duas imagens (computador e celular).";
  }
  if (!input.alt_text.trim()) return "Descreva a imagem (texto alternativo).";
  if (input.link_url && !isSafeBannerLink(input.link_url)) {
    return "O link deve começar com / (interno) ou https://";
  }
  if (input.starts_at && input.ends_at && new Date(input.ends_at) <= new Date(input.starts_at)) {
    return "A data final deve ser depois da inicial.";
  }
  return null;
}

/** Aceita caminho interno ("/loja") ou URL https. Bloqueia javascript:, http:, etc. */
export function isSafeBannerLink(url: string): boolean {
  const v = url.trim();
  if (!v) return false;
  if (v.startsWith("//")) return false;
  if (v.startsWith("/")) return true;
  return /^https:\/\/[^\s]+$/i.test(v);
}

export function isExternalBannerLink(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

export async function createBanner(input: BannerInput) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("site_banners")
    .insert({ ...input, updated_by: auth.user?.id ?? null });
  if (error) throw error;
}

export async function updateBanner(id: string, patch: Partial<BannerInput>) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("site_banners")
    .update({ ...patch, updated_by: auth.user?.id ?? null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteBanner(id: string) {
  const { error } = await supabase.from("site_banners").delete().eq("id", id);
  if (error) throw error;
}

/** Reordena gravando sort_order sequencial na ordem recebida. */
export async function reorderBanners(ids: string[]) {
  for (let i = 0; i < ids.length; i += 1) {
    const { error } = await supabase
      .from("site_banners")
      .update({ sort_order: i })
      .eq("id", ids[i]);
    if (error) throw error;
  }
}
