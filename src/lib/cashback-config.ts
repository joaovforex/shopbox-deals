/**
 * Fonte única da taxa de cashback.
 *
 * ⚠️ NÃO ALTERE este valor sem aprovação explícita do dono da loja.
 * A taxa foi reduzida de 10% para 5% em 30/06/2026 e qualquer mudança
 * acidental quebra os testes em `src/lib/__tests__/cashback-config.test.ts`,
 * o cálculo do banco em `public.grant_order_cashback`, o banner, o checkout
 * e a página do produto.
 *
 * Para alterar oficialmente: atualize a constante, a migração SQL e rode
 * os testes (`bun test src/lib/__tests__/cashback-config.test.ts`).
 */
export const CASHBACK_RATE = 0.05 as const;

export const CASHBACK_PERCENT_LABEL = "5%" as const;

/** Calcula o cashback ganho em cima de um subtotal (em reais). */
export function calculateCashback(subtotal: number): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  return Math.round(subtotal * CASHBACK_RATE * 100) / 100;
}

// Guarda em tempo de execução: se alguém trocar para 10% por engano, a app
// quebra imediatamente em qualquer página que importe este módulo.
if (CASHBACK_RATE !== 0.05) {
  throw new Error(
    `[cashback-config] CASHBACK_RATE deve ser 0.05 (5%). Valor atual: ${CASHBACK_RATE}. ` +
      `Veja src/lib/cashback-config.ts antes de alterar.`,
  );
}
