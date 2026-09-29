/**
 * Status da corrida Mais Entregas (TBT Express) — helpers CLIENT-SAFE.
 *
 * A API devolve o status como texto livre ("Serviço Finalizado",
 * "Contatando Parceiro", ...). Guardamos no banco SEMPRE a forma
 * normalizada (minúsculas, sem acento, snake_case), e os status finais
 * viram um valor canônico: `entregue` / `cancelado`.
 *
 * Isso é o que permite ao poller filtrar corridas ativas por
 * `maisentregas_status NOT IN ('entregue','cancelado','devolvido')` e à tela
 * do cliente reconhecer a entrega.
 */

export const ME_FINAL_STATUSES = ["entregue", "cancelado", "devolvido"] as const;

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

/** Texto cru da API → valor canônico gravado no banco. */
export function normalizeMeStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = slug(String(raw));
  if (!s) return null;
  if (s === "servico_finalizado" || s === "finalizado" || s === "entregue" || s === "concluido") return "entregue";
  if (s === "cancelado" || s === "cancelada" || s === "cancelled" || s === "canceled") return "cancelado";
  if (s === "devolvido" || s === "devolvida") return "devolvido";
  return s;
}

export function isMeDelivered(s: string | null | undefined): boolean {
  return normalizeMeStatus(s) === "entregue";
}

export function isMeFinal(s: string | null | undefined): boolean {
  const n = normalizeMeStatus(s);
  return !!n && (ME_FINAL_STATUSES as readonly string[]).includes(n);
}

/** Etiqueta amigável para o cliente/painel. */
export function meStatusLabel(s: string | null | undefined): string {
  const n = normalizeMeStatus(s);
  if (!n) return "Aguardando";
  const map: Record<string, string> = {
    criado: "Corrida solicitada",
    pendente: "Pendente",
    aguardando_preparo: "Aguardando preparo",
    contatando_parceiro: "Procurando entregador",
    parceiro_confirmado: "Entregador confirmado",
    parceiro_a_caminho: "Entregador a caminho",
    em_rota: "Em rota de entrega",
    entregue: "Entregue",
    cancelado: "Cancelado",
    devolvido: "Devolvido",
  };
  return map[n] || n.replace(/_/g, " ");
}

/** Está "na rua"? (entregador já aceitou / a caminho) */
export function isMeOnTheWay(s: string | null | undefined): boolean {
  const n = normalizeMeStatus(s);
  return n === "parceiro_confirmado" || n === "parceiro_a_caminho" || n === "em_rota";
}
