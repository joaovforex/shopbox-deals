/** Limites de parcelamento no cartão: até 5x e nunca abaixo de R$ 5,00 por parcela. */
export const MAX_INSTALLMENTS = 5;
export const MIN_INSTALLMENT_VALUE = 5;

export function maxInstallmentsFor(total: number): number {
  return Math.max(1, Math.min(MAX_INSTALLMENTS, Math.floor(total / MIN_INSTALLMENT_VALUE)));
}

/** Valor de cada parcela para um total e uma quantidade de parcelas. */
export function installmentValue(total: number, count: number): number {
  const n = Math.max(1, count);
  return Math.round((total / n) * 100) / 100;
}

/** Lista de opções de parcelamento (1x até o máximo permitido). */
export function installmentPlans(total: number): { count: number; value: number }[] {
  const max = maxInstallmentsFor(total);
  return Array.from({ length: max }, (_, i) => ({
    count: i + 1,
    value: installmentValue(total, i + 1),
  }));
}

/** Texto curto do melhor parcelamento, ex.: "em até 7x de R$ 28,57 sem juros". */
export function installmentLabel(total: number): string | null {
  const max = maxInstallmentsFor(total);
  if (!(total > 0) || max < 2) return null;
  const value = installmentValue(total, max);
  const brl = value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `em até ${max}x de ${brl} sem juros`;
}
