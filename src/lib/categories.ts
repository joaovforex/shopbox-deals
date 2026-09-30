export const PRODUCT_CATEGORIES = [
  // Restrita: só aparece/vende para quem tem 18+ pela data de nascimento do
  // cadastro (regras no banco: is_adult_category / can_view_adult / RLS).
  "+18",
  "Automotivo",
  "Banheiro",
  "Bebês",
  "Bebidas",
  "Brinquedos",
  "Capinhas e Acessórios",
  "Casa",
  "Casa e Decoração",
  "Calçados",
  "Celulares",
  "Cosméticos e Perfumes",
  "Cozinha",
  "Decoração Comemorativa",
  "Eletrodomésticos",
  "Eletrônicos",
  "Ferramentas",
  "Instrumentos Musicais",
  "Mochilas",
  "Móveis",
  "Moda e Acessórios",
  "Notebooks",
  "Papelaria",
  "Pesca",
  "Pet",
  "Produtos de Limpeza",
  "Roupas",
  "Saúde e Bem-Estar",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

