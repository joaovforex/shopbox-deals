/**
 * Veículo da entrega — CLIENT-SAFE.
 *
 * 'moto'  : padrão (TBT Express, serviço atual `pr/curitiba`).
 * 'carro' : produto grande que não cabe na moto (Fiorino/utilitário).
 *           Basta UM item do carrinho com `products.requires_car = true`
 *           para o pedido inteiro ir de carro.
 */

export type DeliveryVehicle = "moto" | "carro";

export const VEHICLE_LABEL: Record<DeliveryVehicle, string> = {
  moto: "Motoboy",
  carro: "Carro (Fiorino)",
};

/** Nome da cidade normalizado para a chave da tabela de frete do carro. */
export function cityKey(city: string | null | undefined): string {
  return (city ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Lê a tabela `{ cidade: valor }` tolerando formatos ruins. */
export function parseCarFeeTable(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
    if (Number.isFinite(n) && n > 0) out[cityKey(k)] = Math.round(n * 100) / 100;
  }
  return out;
}

/** Frete de carro pela tabela: valor da cidade ou o padrão. null = não atende. */
export function carFeeFromTable(
  city: string | null | undefined,
  table: Record<string, number>,
  fallback: number | null | undefined,
): number | null {
  const v = table[cityKey(city)];
  if (Number.isFinite(v) && v > 0) return v;
  const f = Number(fallback);
  return Number.isFinite(f) && f > 0 ? Math.round(f * 100) / 100 : null;
}
