/**
 * Sanitiza texto digitado pelo usuário antes de interpolar em filtros PostgREST
 * (`.or()`, `.ilike()`), removendo caracteres que alteram a sintaxe do filtro
 * (vírgula, parênteses, ponto, aspas, barras e curingas).
 */
export function sanitizePostgrestTerm(input: string, maxLength = 100): string {
  return (input ?? "")
    .replace(/[(),.*%\\"'`:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
