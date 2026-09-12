// Regras puras (sem I/O) usadas pelo webhook e pela reconciliação da Cielo.
// Ficam fora dos handlers para serem testáveis com `bun test`.

/** Identificador no formato que a Cielo aceita como order_number: só a-zA-Z0-9, máx. 20 chars. */
export function normalizeCieloKey(id: string): string {
  return String(id ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 20)
    .toLowerCase();
}

export type CieloKeyResolution =
  | { ok: true; key: string }
  | { ok: false; reason: "sem_identificador" | "order_number_divergente" };

/**
 * Decide qual pedido a notificação confirma.
 *
 * O `order_number` do payload NÃO é confiável (a Cielo não assina o POST):
 * ele serve apenas para localizar a transação. A chave do pedido vem sempre da
 * transação consultada na Cielo (`cieloOrderNumber`). Quando o payload traz um
 * order_number diferente do que a Cielo devolveu, a notificação é rejeitada —
 * caso contrário um checkout pago de valor baixo poderia "confirmar" outro
 * pedido apenas trocando o order_number no corpo.
 *
 * Se a Cielo não devolver o order_number, o chamador precisa validar por outro
 * caminho (conferir que o checkout consultado pertence ao order_number do
 * payload via `listCheckoutsByOrderNumber`) antes de confiar em `bodyOrderNumber`.
 */
export function resolveCieloOrderKey(input: {
  bodyOrderNumber: string | null | undefined;
  cieloOrderNumber: string | null | undefined;
}): CieloKeyResolution {
  const bodyKey = normalizeCieloKey(input.bodyOrderNumber ?? "");
  const cieloKey = normalizeCieloKey(input.cieloOrderNumber ?? "");

  if (cieloKey) {
    if (bodyKey && bodyKey !== cieloKey) return { ok: false, reason: "order_number_divergente" };
    return { ok: true, key: cieloKey };
  }
  if (!bodyKey) return { ok: false, reason: "sem_identificador" };
  // Sem order_number da Cielo: o chamador é responsável por comprovar o vínculo.
  return { ok: true, key: bodyKey };
}

/**
 * Confere o valor cobrado na Cielo (centavos, apenas itens do carrinho — a
 * Cielo não inclui o frete no somatório) com o esperado no pedido
 * (`total - delivery_fee`). Mesma regra usada pela reconciliação.
 *
 * Sem valor na transação ou sem valor esperado (>0) não bloqueia: mantém o
 * comportamento anterior para pedidos legados.
 */
export function cieloAmountMatches(
  amountCents: number | null | undefined,
  total: number | null | undefined,
  deliveryFee: number | null | undefined,
): boolean {
  if (amountCents == null || !Number.isFinite(Number(amountCents))) return true;
  const expected = Math.max(0, Number(total ?? 0) - Number(deliveryFee ?? 0));
  if (!(expected > 0)) return true;
  const paid = Number(amountCents) / 100;
  return Math.abs(paid - expected) <= 0.02;
}
