-- Cashback por produto: permite desabilitar o ABATIMENTO de saldo de cashback
-- no preço de produtos específicos.
-- Padrão true = comportamento atual (cashback abate em qualquer produto).
-- false = o cliente NÃO pode usar saldo de cashback no preço deste produto
--         (mas o produto continua GERANDO cashback ao ser comprado).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cashback_redeemable boolean NOT NULL DEFAULT true;
