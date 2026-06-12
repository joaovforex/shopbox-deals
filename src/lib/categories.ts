export const PRODUCT_CATEGORIES = [
  "Brinquedos",
  "Eletrônicos",
  "Beleza",
  "Casa",
  "Roupas",
  "Calçados",
  "Automotivo",
  "Bebidas",
  "Suplementos e Cápsulas",
  "Academia",
  "Produtos de Limpeza",
  "Pet",
  "Ferramentas",
  "Infantil",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
