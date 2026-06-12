// Helpers para abrir WhatsApp com mensagem pronta (wa.me).
// Envio 100% automático exige WhatsApp Business API (paga).

export const STORE_ADDRESS = "Rua Emílio Gleber, 1118 — Atuba, Colombo / PR";
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
    `Olá, ${customerName}!`,
    ``,
    `Seu pedido *#${shortId}* foi confirmado e já está em *separação*.`,
    ``,
    `Assim que estiver pronto, você receberá um novo aviso para retirada.`,
    ``,
    `Endereço: ${STORE_ADDRESS}`,
    `Horário: ${STORE_HOURS}`,
    ``,
    `Obrigado pela compra!`,
  ].join("\n");
}

export function orderReadyMessage(customerName: string, orderId: string) {
  const shortId = orderId.slice(0, 8).toUpperCase();
  return [
    `Olá, ${customerName}!`,
    ``,
    `Seu pedido *#${shortId}* já está *separado e pronto para retirada* em até *1 hora*.`,
    ``,
    `Endereço: ${STORE_ADDRESS}`,
    `Horário: ${STORE_HOURS}`,
    ``,
    `Te esperamos!`,
  ].join("\n");
}

export function orderReminderMessage(customerName: string, orderId: string) {
  const shortId = orderId.slice(0, 8).toUpperCase();
  return [
    `Olá, ${customerName}!`,
    ``,
    `Passando para lembrar que seu pedido *#${shortId}* já está *separado e aguardando retirada* na nossa loja.`,
    ``,
    `Endereço: ${STORE_ADDRESS}`,
    `Horário: ${STORE_HOURS}`,
    ``,
    `Qualquer dúvida é só responder por aqui.`,
  ].join("\n");
}

export function orderDeliveredMessage(customerName: string, orderId: string) {
  const shortId = orderId.slice(0, 8).toUpperCase();
  return [
    `Olá, ${customerName}!`,
    ``,
    `Confirmamos a *retirada do seu pedido #${shortId}*.`,
    ``,
    `Muito obrigado pela compra! Esperamos te ver novamente em breve.`,
    ``,
    `Se puder, conte para a gente como foi sua experiência — sua opinião é muito importante!`,
  ].join("\n");
}
