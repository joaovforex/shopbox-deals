export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export const discountPct = (original: number | null | undefined, price: number) => {
  if (!original || original <= price) return 0;
  return Math.round((1 - price / original) * 100);
};

export const postDate = (iso: string | Date | null | undefined) => {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

