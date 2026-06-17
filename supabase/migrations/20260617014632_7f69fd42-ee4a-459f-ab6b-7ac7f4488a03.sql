
-- ============================================================
-- 1. Variações de cor nos produtos (estoque por cor)
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS color_variants jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_color text;

-- Trigger: quando há variantes, o estoque total do produto vira a soma das variantes
CREATE OR REPLACE FUNCTION public.products_sync_variant_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_sum int;
BEGIN
  IF NEW.color_variants IS NOT NULL
     AND jsonb_typeof(NEW.color_variants) = 'array'
     AND jsonb_array_length(NEW.color_variants) > 0 THEN
    SELECT COALESCE(SUM(GREATEST(0, COALESCE((elem->>'stock')::int, 0))), 0)
      INTO v_sum
      FROM jsonb_array_elements(NEW.color_variants) AS elem;
    NEW.stock := v_sum;
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS products_sync_variant_stock_trg ON public.products;
CREATE TRIGGER products_sync_variant_stock_trg
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_sync_variant_stock();

-- Helper: encontra o índice (base 0) da variante por cor (case-insensitive)
CREATE OR REPLACE FUNCTION public.find_variant_index(_variants jsonb, _color text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (idx - 1)::int FROM (
    SELECT elem, ord AS idx
      FROM jsonb_array_elements(_variants) WITH ORDINALITY AS t(elem, ord)
  ) x
  WHERE lower(coalesce(x.elem->>'color','')) = lower(coalesce(_color,''))
  LIMIT 1;
$$;

-- ============================================================
-- 2. create_pending_order: aceita cor em cada item
-- ============================================================
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
  IF length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'CPF inválido';
  END IF;
  IF p_payment_method NOT IN ('pix','card','mercadopago') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;
  IF p_delivery_method NOT IN ('pickup','delivery') THEN
    RAISE EXCEPTION 'Método de entrega inválido';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Itens inválidos';
  END IF;
  v_item_count := jsonb_array_length(p_items);
  IF v_item_count < 1 OR v_item_count > 50 THEN
    RAISE EXCEPTION 'Quantidade de itens inválida';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    v_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 999 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF NOT v_product.active THEN RAISE EXCEPTION 'Produto indisponível: %', v_product.name; END IF;

    IF v_product.color_variants IS NOT NULL AND jsonb_array_length(v_product.color_variants) > 0 THEN
      IF v_color IS NULL THEN
        RAISE EXCEPTION 'Escolha uma cor para o produto: %', v_product.name;
      END IF;
      v_idx := public.find_variant_index(v_product.color_variants, v_color);
      IF v_idx IS NULL THEN
        RAISE EXCEPTION 'Cor inválida para o produto: %', v_product.name;
      END IF;
      v_variant_stock := COALESCE((v_product.color_variants->v_idx->>'stock')::int, 0);
      IF v_variant_stock < v_qty THEN
        RAISE EXCEPTION 'Estoque insuficiente para % (%)', v_product.name, v_color;
      END IF;
    ELSE
      IF v_product.stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente para %', v_product.name; END IF;
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
    now()
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    v_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, variant_color)
    VALUES (v_order_id, v_product.id, v_product.name, v_product.price, v_qty, v_color);
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- ============================================================
-- 3. confirm_order_paid: debita estoque por variante quando aplicável
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_order_paid(p_order_id uuid, p_mp_payment_id text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_item record;
  v_updated int;
  v_idx int;
  v_variant_stock int;
  v_new_variants jsonb;
BEGIN
  SELECT status INTO v_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF v_status = 'cancelled' THEN RETURN 'already_cancelled'; END IF;

  FOR v_item IN
    SELECT oi.product_id, oi.quantity, oi.product_name, oi.variant_color
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
  LOOP
    IF v_item.variant_color IS NOT NULL THEN
      -- decremento atômico da variante
      UPDATE public.products p
         SET color_variants = jsonb_set(
               p.color_variants,
               ARRAY[public.find_variant_index(p.color_variants, v_item.variant_color)::text, 'stock'],
               to_jsonb(GREATEST(0, COALESCE((p.color_variants->public.find_variant_index(p.color_variants, v_item.variant_color)->>'stock')::int, 0) - v_item.quantity))
             )
       WHERE p.id = v_item.product_id
         AND public.find_variant_index(p.color_variants, v_item.variant_color) IS NOT NULL
         AND COALESCE((p.color_variants->public.find_variant_index(p.color_variants, v_item.variant_color)->>'stock')::int, 0) >= v_item.quantity;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
    ELSE
      UPDATE public.products
         SET stock = stock - v_item.quantity
       WHERE id = v_item.product_id
         AND stock >= v_item.quantity
         AND (color_variants IS NULL OR jsonb_array_length(color_variants) = 0);
      GET DIAGNOSTICS v_updated = ROW_COUNT;
    END IF;

    IF v_updated = 0 THEN
      UPDATE public.orders
         SET status = 'cancelled',
             cancellation_reason = 'out_of_stock',
             mp_payment_id = coalesce(mp_payment_id, p_mp_payment_id),
             stock_restored_at = now()
       WHERE id = p_order_id;
      -- devolve o estoque dos itens já debitados (anteriores neste loop)
      FOR v_item IN
        SELECT oi.product_id, oi.quantity, oi.variant_color
          FROM public.order_items oi
         WHERE oi.order_id = p_order_id
      LOOP
        IF v_item.variant_color IS NOT NULL THEN
          UPDATE public.products p
             SET color_variants = jsonb_set(
                   p.color_variants,
                   ARRAY[public.find_variant_index(p.color_variants, v_item.variant_color)::text, 'stock'],
                   to_jsonb(COALESCE((p.color_variants->public.find_variant_index(p.color_variants, v_item.variant_color)->>'stock')::int, 0) + v_item.quantity)
                 )
           WHERE p.id = v_item.product_id
             AND public.find_variant_index(p.color_variants, v_item.variant_color) IS NOT NULL;
        ELSE
          UPDATE public.products
             SET stock = stock + v_item.quantity
           WHERE id = v_item.product_id
             AND (color_variants IS NULL OR jsonb_array_length(color_variants) = 0);
        END IF;
      END LOOP;
      RETURN 'out_of_stock';
    END IF;
  END LOOP;

  UPDATE public.orders
     SET status = 'paid',
         mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
         stock_restored_at = NULL
   WHERE id = p_order_id;

  RETURN 'ok';
END;
$$;

-- ============================================================
-- 4. restore_stock_on_cancel: também devolve para variantes
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_item record;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.stock_restored_at IS NULL THEN
    FOR v_item IN
      SELECT oi.product_id, oi.quantity, oi.variant_color
        FROM public.order_items oi
       WHERE oi.order_id = NEW.id
    LOOP
      IF v_item.variant_color IS NOT NULL THEN
        UPDATE public.products p
           SET color_variants = jsonb_set(
                 p.color_variants,
                 ARRAY[public.find_variant_index(p.color_variants, v_item.variant_color)::text, 'stock'],
                 to_jsonb(COALESCE((p.color_variants->public.find_variant_index(p.color_variants, v_item.variant_color)->>'stock')::int, 0) + v_item.quantity)
               )
         WHERE p.id = v_item.product_id
           AND public.find_variant_index(p.color_variants, v_item.variant_color) IS NOT NULL;
      ELSE
        UPDATE public.products
           SET stock = stock + v_item.quantity
         WHERE id = v_item.product_id
           AND (color_variants IS NULL OR jsonb_array_length(color_variants) = 0);
      END IF;
    END LOOP;
    NEW.stock_restored_at := now();
  END IF;
  RETURN NEW;
END$$;

-- ============================================================
-- 5. Tabela e RPC para contador de visitas (acessos diários únicos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  visited_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS site_visits_session_day_uniq
  ON public.site_visits(session_id, visited_on);
CREATE INDEX IF NOT EXISTS site_visits_day_idx ON public.site_visits(visited_on);

GRANT SELECT, INSERT ON public.site_visits TO anon, authenticated;
GRANT ALL ON public.site_visits TO service_role;

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can record a visit" ON public.site_visits;
CREATE POLICY "anyone can record a visit"
  ON public.site_visits FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.record_visit(p_session_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_count int;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) < 6 OR length(p_session_id) > 64 THEN
    RAISE EXCEPTION 'invalid session';
  END IF;
  INSERT INTO public.site_visits(session_id, visited_on)
    VALUES (p_session_id, v_today)
    ON CONFLICT (session_id, visited_on) DO NOTHING;
  SELECT count(*) INTO v_count FROM public.site_visits WHERE visited_on = v_today;
  RETURN v_count;
END$$;

GRANT EXECUTE ON FUNCTION public.record_visit(text) TO anon, authenticated;
