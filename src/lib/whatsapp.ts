// Helpers para abrir WhatsApp com mensagem pronta (wa.me).
// Envio 100% automático exige WhatsApp Business API (paga).

export const STORE_ADDRESS = "Rua Abel Scuissiato, 2996 — Colombo / PR";
export const STORE_HOURS = "Seg a Sáb · 9h às 18h";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length < 10 || d.length > 13) return null;
  // garante código do país 55
  if (d.startsWith("55") && d.length >= 12) return d;
  return `55${d}`;
}

export function openWhatsApp(phone: string | null | undefined, message: string) {
  const num = normalizePhone(phone);
  if (!num) return;
  const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function orderPaidMessage(customerName: string, orderId: string) {
  const shortId = orderId.slice(0, 8).toUpperCase();
  return [
    `Ola, ${customerName}!`,
    ``,
    `Seu pedido *#${shortId}* foi confirmado e ja esta em *separacao*.`,
    ``,
    `Assim que estiver pronto, voce recebera um novo aviso para retirada.`,
    ``,
    `Endereco: ${STORE_ADDRESS}`,
    `Horario: ${STORE_HOURS}`,
    ``,
    `Obrigado pela compra!`,
  ].join("\n");
}

export function orderReadyMessage(customerName: string, orderId: string) {
  const shortId = orderId.slice(0, 8).toUpperCase();
  return [
    `Ola, ${customerName}!`,
    ``,
    `Seu pedido *#${shortId}* ja esta *separado e pronto para retirada* em ate *1 hora*.`,
    ``,
    `Endereco: ${STORE_ADDRESS}`,
    `Horario: ${STORE_HOURS}`,
    ``,
    `Te esperamos!`,
  ].join("\n");
}
