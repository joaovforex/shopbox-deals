/**
 * Taxa de cashback padrão (fallback).
 *
 * ⚠️ A fonte de verdade é a tabela `site_settings` no banco, editável pelo
 * Super Admin em /admin/configuracoes. As constantes abaixo são apenas
 * o valor padrão usado quando as configurações ainda não carregaram e
 * quando um pedido é criado antes da tabela existir.
 */
export const CASHBACK_RATE = 0.05 as const;

export const CASHBACK_PERCENT_LABEL = "5%" as const;

/** Calcula o cashback ganho em cima de um subtotal (em reais) usando uma taxa dinâmica. */
export function calculateCashback(subtotal: number, rate: number = CASHBACK_RATE): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(subtotal * rate * 100) / 100;
}

