import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SiteSettings = {
  cashback_rate: number;
  banner_desktop_url: string | null;
  banner_mobile_url: string | null;
  updated_at: string | null;
};

const DEFAULTS: SiteSettings = {
  cashback_rate: 0.05,
  banner_desktop_url: null,
  banner_mobile_url: null,
  updated_at: null,
};

export async function fetchSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("cashback_rate, banner_desktop_url, banner_mobile_url, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULTS;
  return {
    cashback_rate: Number(data.cashback_rate ?? 0.05),
    banner_desktop_url: (data.banner_desktop_url as string | null) ?? null,
    banner_mobile_url: (data.banner_mobile_url as string | null) ?? null,
    updated_at: (data.updated_at as string | null) ?? null,
  };
}

export function useSiteSettings() {
  return useQuery({
    queryKey: ["site_settings"],
    queryFn: fetchSiteSettings,
    staleTime: 60_000,
    placeholderData: DEFAULTS,
  });
}

export function formatCashbackLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
