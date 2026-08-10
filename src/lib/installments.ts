/** Limites de parcelamento no cartão: até 7x e nunca abaixo de R$ 5,00 por parcela. */
export const MAX_INSTALLMENTS = 7;
export const MIN_INSTALLMENT_VALUE = 5;

export function maxInstallmentsFor(total: number): number {
  return Math.max(1, Math.min(MAX_INSTALLMENTS, Math.floor(total / MIN_INSTALLMENT_VALUE)));
}
