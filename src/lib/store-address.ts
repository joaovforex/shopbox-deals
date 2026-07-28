// Fonte ÚNICA do endereço da loja. É buscada em `site_settings.store_address`
// e cai no fallback abaixo enquanto a query não resolve (SSR, primeira carga).
//
// TODO João: confirmar/editar o endereço correto no painel
// (/admin/configuracoes → "Endereço da loja"). Este fallback só é usado se o
// site_settings ainda não retornou.

import { useSiteSettings } from "@/lib/site-settings";

export const DEFAULT_STORE_ADDRESS =
  "Rua Emílio Gleber, 1118 — Atuba, Colombo / PR";

export const STORE_HOURS = "Seg a Sáb · 9h às 18h · Dom · 10h às 16h";

export function useStoreAddress(): string {
  const { data } = useSiteSettings();
  return data?.store_address?.trim() || DEFAULT_STORE_ADDRESS;
}

export function googleMapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;
}
