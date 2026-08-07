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
SET search_path TO 'public'
AS $function$
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
  IF p_payment_method NOT IN ('pix','card','mercadopago','cielo','asaas') THEN RAISE EXCEPTION 'Método de pagamento inválido'; END IF;
  IF p_delivery_method NOT IN ('pickup','delivery') THEN RAISE EXCEPTION 'Método de entrega inválido'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Itens inválidos'; END IF;
  v_item_count := jsonb_array_length(p_items);
  IF v_item_count < 1 OR v_item_count > 50 THEN RAISE EXCEPTION 'Quantidade de itens inválida'; END IF;

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
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, variant_color, category)
    VALUES (v_order_id, v_product.id, v_product.name, v_product.price, v_qty, v_color, nullif(v_product.category, ''));
    IF v_color IS NOT NULL THEN
      v_idx := public.find_variant_index(v_product.color_variants, v_color);
      UPDATE public.products p
         SET color_variants = jsonb_set(
               p.color_variants,
               ARRAY[v_idx::text, 'stock'],
               to_jsonb(COALESCE((p.color_variants->v_idx->>'stock')::int, 0) - v_qty)
             )
       WHERE p.id = v_product.id;
    ELSE
      UPDATE public.products SET stock = stock - v_qty WHERE id = v_product.id;
    END IF;
  END LOOP;

  RETURN v_order_id;
END;
$function$;