import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SiteSettings = {
  cashback_rate: number;
  banner_desktop_url: string | null;
  banner_mobile_url: string | null;
  global_discount_percent: number;
  store_address: string;
  updated_at: string | null;
};

const DEFAULT_STORE_ADDRESS = "Rua Emílio Gleber, 1118 — Atuba, Colombo / PR";

const DEFAULTS: SiteSettings = {
  cashback_rate: 0.05,
  banner_desktop_url: null,
  banner_mobile_url: null,
  global_discount_percent: 0,
  store_address: DEFAULT_STORE_ADDRESS,
  updated_at: null,
};

export async function fetchSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("cashback_rate, banner_desktop_url, banner_mobile_url, global_discount_percent, store_address, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULTS;
  const d = data as Record<string, unknown>;
  return {
    cashback_rate: Number(d.cashback_rate ?? 0.05),
    banner_desktop_url: (d.banner_desktop_url as string | null) ?? null,
    banner_mobile_url: (d.banner_mobile_url as string | null) ?? null,
    global_discount_percent: Number(d.global_discount_percent ?? 0),
    store_address: ((d.store_address as string | null) ?? DEFAULT_STORE_ADDRESS).trim() || DEFAULT_STORE_ADDRESS,
    updated_at: (d.updated_at as string | null) ?? null,
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
