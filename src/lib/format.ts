export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export const discountPct = (original: number | null | undefined, price: number) => {
  if (!original || original <= price) return 0;
  return Math.round((1 - price / original) * 100);
};
