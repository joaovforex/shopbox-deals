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

/**
 * Normaliza um termo de busca da mesma forma que `public.text_norm` no banco:
 * minúsculas, sem acentos e sem pontuação/espaços. Use com as colunas
 * `search_norm` para buscas que ignoram acentuação e maiúsculas.
 */
export function normalizeSearchTerm(input: string, maxLength = 100): string {
  return (input ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, maxLength);
}
