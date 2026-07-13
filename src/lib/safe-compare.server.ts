import { timingSafeEqual } from "node:crypto";

/**
 * Comparação de strings resistente a timing attacks.
 * Usada para validar segredos (cron_secret, webhooks) sem vazar
 * informação de tempo caractere-a-caractere para atacantes remotos.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
