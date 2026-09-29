import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SiteSettings = {
  cashback_rate: number;
  banner_desktop_url: string | null;
  banner_mobile_url: string | null;
  global_discount_percent: number;
  store_address: string;
  payment_provider: string;
  updated_at: string | null;
  // Coleta das entregas (TBT Express / Mais Entregas) — null = usa o padrão do servidor.
  pickup_zip: string | null;
  pickup_street: string | null;
  pickup_number: string | null;
  pickup_complement: string | null;
  pickup_district: string | null;
  pickup_city: string | null;
  pickup_state: string | null;
  pickup_phone: string | null;
  pickup_name: string | null;
};

const DEFAULT_STORE_ADDRESS = "Rua Emílio Gleber, 1118 — Atuba, Colombo / PR";

const DEFAULTS: SiteSettings = {
  cashback_rate: 0.05,
  banner_desktop_url: null,
  banner_mobile_url: null,
  global_discount_percent: 0,
  store_address: DEFAULT_STORE_ADDRESS,
  payment_provider: "asaas",
  updated_at: null,
  pickup_zip: null, pickup_street: null, pickup_number: null, pickup_complement: null,
  pickup_district: null, pickup_city: null, pickup_state: null, pickup_phone: null, pickup_name: null,
};


export async function fetchSiteSettings(): Promise<SiteSettings> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("cashback_rate, banner_desktop_url, banner_mobile_url, global_discount_percent, store_address, payment_provider, updated_at, pickup_zip, pickup_street, pickup_number, pickup_complement, pickup_district, pickup_city, pickup_state, pickup_phone, pickup_name")
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
    payment_provider: ((d.payment_provider as string | null) ?? "asaas") || "asaas",
    updated_at: (d.updated_at as string | null) ?? null,
    pickup_zip: (d.pickup_zip as string | null) ?? null,
    pickup_street: (d.pickup_street as string | null) ?? null,
    pickup_number: (d.pickup_number as string | null) ?? null,
    pickup_complement: (d.pickup_complement as string | null) ?? null,
    pickup_district: (d.pickup_district as string | null) ?? null,
    pickup_city: (d.pickup_city as string | null) ?? null,
    pickup_state: (d.pickup_state as string | null) ?? null,
    pickup_phone: (d.pickup_phone as string | null) ?? null,
    pickup_name: (d.pickup_name as string | null) ?? null,
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
