
-- 1. Tabela de reservas de carrinho
CREATE TABLE public.cart_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_color text,
  quantity int NOT NULL CHECK (quantity > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cart_reservations_unique_user_product
  ON public.cart_reservations (user_id, product_id, COALESCE(variant_color, ''));
CREATE INDEX cart_reservations_expires_idx ON public.cart_reservations (expires_at);
CREATE INDEX cart_reservations_user_idx ON public.cart_reservations (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_reservations TO authenticated;
GRANT ALL ON public.cart_reservations TO service_role;

ALTER TABLE public.cart_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own reservations"
  ON public.cart_reservations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Reservar último item de estoque
CREATE OR REPLACE FUNCTION public.reserve_cart_last_stock(
  p_product_id uuid,
  p_variant_color text,
  p_quantity int
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_color text := nullif(trim(coalesce(p_variant_color, '')), '');
  v_idx int;
  v_available int;
  v_existing public.cart_reservations%ROWTYPE;
  v_delta int;
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- Determinar estoque disponível atual (já decrementado por outras reservas/pendentes)
  IF v_color IS NOT NULL AND v_product.color_variants IS NOT NULL
     AND jsonb_array_length(v_product.color_variants) > 0 THEN
    v_idx := public.find_variant_index(v_product.color_variants, v_color);
    IF v_idx IS NULL THEN RETURN 'invalid_color'; END IF;
    v_available := COALESCE((v_product.color_variants->v_idx->>'stock')::int, 0);
  ELSE
    v_available := v_product.stock;
  END IF;

  -- Quanto este usuário já tem reservado para este produto/cor
  SELECT * INTO v_existing
    FROM public.cart_reservations
   WHERE user_id = v_uid AND product_id = p_product_id
     AND coalesce(variant_color, '') = coalesce(v_color, '')
   FOR UPDATE;

  -- O "estoque restante" do ponto de vista da loja já inclui a reserva atual do user (foi decrementada).
  -- Estoque que outros veriam = v_available (já está abatido).
  -- Verificamos se a nova quantidade ainda cabe no estoque disponível MAIS o que o user já tinha.

  v_delta := p_quantity - COALESCE(v_existing.quantity, 0);

  IF v_delta > 0 AND v_available < v_delta THEN
    -- Não há estoque suficiente para reservar a diferença
    IF v_available + COALESCE(v_existing.quantity, 0) <= 0 THEN
      RETURN 'out_of_stock';
    END IF;
    RETURN 'insufficient_stock';
  END IF;

  -- Decidir se é "último" estoque
  -- "Último" = depois da reserva, o estoque público fica zerado
  IF (v_available - v_delta) > 0 THEN
    -- Ainda sobra estoque: não reservamos (cliente compete normalmente)
    -- Se já existia reserva, mantemos como está
    IF v_existing.id IS NOT NULL THEN
      RETURN 'kept_reservation';
    END IF;
    RETURN 'not_last';
  END IF;

  -- É último: aplicar delta ao estoque e gravar/atualizar reserva
  IF v_delta <> 0 THEN
    IF v_color IS NOT NULL THEN
      UPDATE public.products p
         SET color_variants = jsonb_set(
               p.color_variants,
               ARRAY[v_idx::text, 'stock'],
               to_jsonb(GREATEST(0, COALESCE((p.color_variants->v_idx->>'stock')::int, 0) - v_delta))
             )
       WHERE p.id = p_product_id
         AND COALESCE((p.color_variants->v_idx->>'stock')::int, 0) >= GREATEST(0, v_delta);
      GET DIAGNOSTICS v_updated = ROW_COUNT;
    ELSE
      UPDATE public.products
         SET stock = stock - v_delta
       WHERE id = p_product_id AND stock >= GREATEST(0, v_delta);
      GET DIAGNOSTICS v_updated = ROW_COUNT;
    END IF;
    -- v_delta pode ser negativo (devolução parcial) — tratar:
    IF v_delta < 0 THEN
      IF v_color IS NOT NULL THEN
        UPDATE public.products p
           SET color_variants = jsonb_set(
                 p.color_variants,
                 ARRAY[v_idx::text, 'stock'],
                 to_jsonb(COALESCE((p.color_variants->v_idx->>'stock')::int, 0) + ABS(v_delta))
               )
         WHERE p.id = p_product_id;
      ELSE
        UPDATE public.products SET stock = stock + ABS(v_delta) WHERE id = p_product_id;
      END IF;
    ELSIF v_updated = 0 THEN
      RETURN 'out_of_stock';
    END IF;
  END IF;

  INSERT INTO public.cart_reservations(user_id, product_id, variant_color, quantity, expires_at)
  VALUES (v_uid, p_product_id, v_color, p_quantity, now() + interval '5 minutes')
  ON CONFLICT (user_id, product_id, COALESCE(variant_color, ''))
  DO UPDATE SET quantity = EXCLUDED.quantity, expires_at = now() + interval '5 minutes';

  RETURN 'reserved';
END;
$$;

-- 3. Liberar reserva do usuário
CREATE OR REPLACE FUNCTION public.release_cart_reservation(
  p_product_id uuid,
  p_variant_color text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_color text := nullif(trim(coalesce(p_variant_color, '')), '');
  v_res public.cart_reservations%ROWTYPE;
  v_idx int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  DELETE FROM public.cart_reservations
   WHERE user_id = v_uid AND product_id = p_product_id
     AND coalesce(variant_color, '') = coalesce(v_color, '')
   RETURNING * INTO v_res;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_res.variant_color IS NOT NULL THEN
    v_idx := public.find_variant_index(
      (SELECT color_variants FROM public.products WHERE id = p_product_id),
      v_res.variant_color
    );
    IF v_idx IS NOT NULL THEN
      UPDATE public.products p
         SET color_variants = jsonb_set(
               p.color_variants,
               ARRAY[v_idx::text, 'stock'],
               to_jsonb(COALESCE((p.color_variants->v_idx->>'stock')::int, 0) + v_res.quantity)
             )
       WHERE p.id = p_product_id;
    END IF;
  ELSE
    UPDATE public.products SET stock = stock + v_res.quantity WHERE id = p_product_id;
  END IF;

  RETURN true;
END;
$$;

-- 4. Expirar reservas vencidas (chamada por cron)
CREATE OR REPLACE FUNCTION public.expire_cart_reservations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res record;
  v_count int := 0;
  v_idx int;
BEGIN
  FOR v_res IN
    DELETE FROM public.cart_reservations
     WHERE expires_at <= now()
     RETURNING *
  LOOP
    IF v_res.variant_color IS NOT NULL THEN
      v_idx := public.find_variant_index(
        (SELECT color_variants FROM public.products WHERE id = v_res.product_id),
        v_res.variant_color
      );
      IF v_idx IS NOT NULL THEN
        UPDATE public.products p
           SET color_variants = jsonb_set(
                 p.color_variants,
                 ARRAY[v_idx::text, 'stock'],
                 to_jsonb(COALESCE((p.color_variants->v_idx->>'stock')::int, 0) + v_res.quantity)
               )
         WHERE p.id = v_res.product_id;
      END IF;
    ELSE
      UPDATE public.products SET stock = stock + v_res.quantity WHERE id = v_res.product_id;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 5. create_pending_order: liberar reservas do usuário ANTES de reservar via pedido pendente
CREATE OR REPLACE FUNCTION public.create_pending_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_cpf text,
  p_payment_method text,
  p_delivery_method text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_qty int;
  v_color text;
  v_idx int;
  v_variant_stock int;
  v_item_count int;
  v_cpf text;
  v_updated int;
  v_uid uuid := auth.uid();
  v_res record;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 3 OR length(p_customer_name) > 120 THEN
    RAISE EXCEPTION 'Nome inválido';
  END IF;
  IF p_customer_email IS NULL OR p_customer_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(p_customer_email) > 254 THEN
    RAISE EXCEPTION 'Email inválido';
  END IF;
  IF p_customer_phone IS NULL OR p_customer_phone !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;
  v_cpf := regexp_replace(coalesce(p_customer_cpf,''), '\D', '', 'g');
  IF length(v_cpf) <> 11 THEN RAISE EXCEPTION 'CPF inválido'; END IF;
  IF p_payment_method NOT IN ('pix','card','mercadopago') THEN RAISE EXCEPTION 'Método de pagamento inválido'; END IF;
  IF p_delivery_method NOT IN ('pickup','delivery') THEN RAISE EXCEPTION 'Método de entrega inválido'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Itens inválidos'; END IF;
  v_item_count := jsonb_array_length(p_items);
  IF v_item_count < 1 OR v_item_count > 50 THEN RAISE EXCEPTION 'Quantidade de itens inválida'; END IF;

  -- Liberar quaisquer reservas do carrinho do usuário para os itens deste pedido
  -- (devolve estoque para que o fluxo de reserva via pedido pendente funcione normalmente)
  IF v_uid IS NOT NULL THEN
    FOR v_res IN
      DELETE FROM public.cart_reservations cr
       WHERE cr.user_id = v_uid
         AND cr.product_id IN (SELECT (i->>'product_id')::uuid FROM jsonb_array_elements(p_items) i)
       RETURNING *
    LOOP
      IF v_res.variant_color IS NOT NULL THEN
        v_idx := public.find_variant_index(
          (SELECT color_variants FROM public.products WHERE id = v_res.product_id),
          v_res.variant_color
        );
        IF v_idx IS NOT NULL THEN
          UPDATE public.products p
             SET color_variants = jsonb_set(
                   p.color_variants,
                   ARRAY[v_idx::text, 'stock'],
                   to_jsonb(COALESCE((p.color_variants->v_idx->>'stock')::int, 0) + v_res.quantity)
                 )
           WHERE p.id = v_res.product_id;
        END IF;
      ELSE
        UPDATE public.products SET stock = stock + v_res.quantity WHERE id = v_res.product_id;
      END IF;
    END LOOP;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    v_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 999 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF NOT v_product.active THEN RAISE EXCEPTION 'Produto indisponível: %', v_product.name; END IF;
    IF v_product.color_variants IS NOT NULL AND jsonb_array_length(v_product.color_variants) > 0 THEN
      IF v_color IS NULL THEN RAISE EXCEPTION 'Escolha uma cor para o produto: %', v_product.name; END IF;
      v_idx := public.find_variant_index(v_product.color_variants, v_color);
      IF v_idx IS NULL THEN RAISE EXCEPTION 'Cor inválida para o produto: %', v_product.name; END IF;
      v_variant_stock := COALESCE((v_product.color_variants->v_idx->>'stock')::int, 0);
      IF v_variant_stock < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente para % (%). Disponível: %', v_product.name, v_color, v_variant_stock;
      END IF;
    ELSE
      IF v_product.stock < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente para %. Disponível: %', v_product.name, v_product.stock;
      END IF;
    END IF;
    v_total := v_total + v_product.price * v_qty;
  END LOOP;

  INSERT INTO public.orders (
    user_id, customer_name, customer_email, customer_phone, customer_cpf,
    shipping_address, payment_method, delivery_method, total, status, fulfillment_status,
    stock_restored_at
  )
  VALUES (
    auth.uid(), trim(p_customer_name), lower(trim(p_customer_email)), p_customer_phone, v_cpf,
    'Retirada na loja', p_payment_method, p_delivery_method, v_total, 'pending', 'pending',
    NULL
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    v_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, variant_color)
    VALUES (v_order_id, v_product.id, v_product.name, v_product.price, v_qty, v_color);

    IF v_color IS NOT NULL THEN
      UPDATE public.products p
         SET color_variants = jsonb_set(
               p.color_variants,
               ARRAY[public.find_variant_index(p.color_variants, v_color)::text, 'stock'],
               to_jsonb(GREATEST(0, COALESCE((p.color_variants->public.find_variant_index(p.color_variants, v_color)->>'stock')::int, 0) - v_qty))
             )
       WHERE p.id = v_product.id
         AND public.find_variant_index(p.color_variants, v_color) IS NOT NULL
         AND COALESCE((p.color_variants->public.find_variant_index(p.color_variants, v_color)->>'stock')::int, 0) >= v_qty;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
    ELSE
      UPDATE public.products SET stock = stock - v_qty
       WHERE id = v_product.id AND stock >= v_qty
         AND (color_variants IS NULL OR jsonb_array_length(color_variants) = 0);
      GET DIAGNOSTICS v_updated = ROW_COUNT;
    END IF;

    IF v_updated = 0 THEN
      RAISE EXCEPTION 'Estoque esgotado para % durante a reserva. Tente novamente.', v_product.name;
    END IF;
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- 6. Cron job para expirar reservas a cada minuto
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-cart-reservations') THEN
    PERFORM cron.unschedule('expire-cart-reservations');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-cart-reservations',
  '* * * * *',
  $$ SELECT public.expire_cart_reservations(); $$
);
