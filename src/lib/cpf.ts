// Validação completa de CPF (com dígitos verificadores).
// Usada tanto no checkout quanto no servidor antes de enviar ao Mercado Pago.
export function isValidCpf(value: string): boolean {
  const cpf = (value ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (s * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (s * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10], 10);
}

// Mapeia status_detail do Mercado Pago para mensagens em português, claras e acionáveis.
export function mpStatusDetailMessage(detail: string | null | undefined): {
  title: string;
  description: string;
  retryable: boolean;
} {
  const d = (detail ?? "").toLowerCase();
  const map: Record<string, { title: string; description: string; retryable: boolean }> = {
    cc_rejected_bad_filled_card_number: { title: "Número do cartão incorreto", description: "Confira o número do cartão e tente novamente.", retryable: true },
    cc_rejected_bad_filled_date: { title: "Data de validade incorreta", description: "Confira a data de validade do cartão e tente novamente.", retryable: true },
    cc_rejected_bad_filled_other: { title: "Dados do cartão incorretos", description: "Reveja todos os dados do cartão e tente novamente.", retryable: true },
    cc_rejected_bad_filled_security_code: { title: "Código de segurança (CVV) inválido", description: "Confira o CVV de 3 dígitos no verso do cartão e tente novamente.", retryable: true },
    cc_rejected_blacklist: { title: "Cartão não autorizado", description: "Este cartão não está habilitado para compras. Tente outro cartão ou pague via Pix.", retryable: false },
    cc_rejected_call_for_authorize: { title: "Autorize com seu banco", description: "Seu banco precisa autorizar a compra. Ligue para o número no verso do cartão e libere essa transação, depois tente de novo.", retryable: true },
    cc_rejected_card_disabled: { title: "Cartão desativado", description: "Seu cartão está desativado. Ligue para o banco para ativá-lo ou use outro meio de pagamento.", retryable: false },
    cc_rejected_card_error: { title: "Não foi possível processar o pagamento", description: "Tente novamente ou use outro cartão.", retryable: true },
    cc_rejected_duplicated_payment: { title: "Pagamento duplicado", description: "Já existe um pagamento idêntico recente. Aguarde alguns minutos antes de tentar novamente.", retryable: true },
    cc_rejected_high_risk: { title: "Pagamento recusado por segurança", description: "O Mercado Pago não aprovou esta transação. Tente outro cartão, use o Pix, ou pague pelo app do Mercado Pago.", retryable: true },
    cc_rejected_insufficient_amount: { title: "Saldo / limite insuficiente", description: "O cartão não tem limite suficiente para essa compra. Tente outro cartão ou diminua o valor.", retryable: true },
    cc_rejected_invalid_installments: { title: "Parcelamento não disponível", description: "Esse número de parcelas não é aceito por esse cartão. Tente menos parcelas ou outro cartão.", retryable: true },
    cc_rejected_max_attempts: { title: "Muitas tentativas seguidas", description: "Você atingiu o limite de tentativas. Aguarde alguns minutos antes de tentar novamente.", retryable: true },
    cc_rejected_other_reason: { title: "Pagamento recusado", description: "O cartão não autorizou a compra. Tente outro cartão ou pague via Pix.", retryable: true },
  };
  if (map[d]) return map[d];
  return {
    title: "Pagamento recusado",
    description: "Não foi possível concluir a cobrança. Tente novamente ou escolha outro meio de pagamento.",
    retryable: true,
  };
}
