// Máscaras de PII (LGPD). Aplicadas na exibição em painéis de admin.
// A busca continua sendo feita contra o valor real do banco.

export function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "").padStart(11, "0").slice(0, 11);
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
}

export function formatCpfFull(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "").padStart(11, "0").slice(0, 11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const s = phone.replace(/\D/g, "");
  if (s.length === 11) return `(${s.slice(0, 2)}) 9****-${s.slice(-4)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ****-${s.slice(-4)}`;
  return phone.replace(/.(?=.{4})/g, "*");
}

export function formatPhoneFull(phone: string | null | undefined): string {
  if (!phone) return "—";
  const s = phone.replace(/\D/g, "");
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return phone;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  if (at < 1) return email;
  const user = email.slice(0, at);
  const domain = email.slice(at);
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, user.length - 2))}${domain}`;
}
