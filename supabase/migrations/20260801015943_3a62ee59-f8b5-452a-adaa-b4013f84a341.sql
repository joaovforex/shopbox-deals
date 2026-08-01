CREATE OR REPLACE FUNCTION public.create_manual_order(
  p_customer_name text,
  p_customer_phone text,
  p_delivery_method text,
  p_items jsonb,
  p_customer_email text DEFAULT NULL::text,
  p_customer_cpf text DEFAULT NULL::text,
  p_payment_method text DEFAULT 'mercadopago'
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
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
  v_email text;
  v_updated int;
  v_name text;
  v_pm text;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  v_pm := lower(trim(coalesce(p_payment_method, 'mercadopago')));
  IF v_pm = '' THEN v_pm := 'mercadopago'; END IF;
  IF v_pm NOT IN ('mercadopago','cielo','pix','card','dinheiro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida: %', v_pm;
  END IF;
  v_status := CASE WHEN v_pm = 'dinheiro' THEN 'paid' ELSE 'pending' END;

  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 OR length(p_customer_name) > 120 THEN
    RAISE EXCEPTION 'Nome inválido';
  END IF;
  IF p_customer_phone IS NULL OR regexp_replace(p_customer_phone, '\D', '', 'g') !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION 'Telefone inválido';
  END IF;
  IF p_delivery_method NOT IN ('pickup','delivery') THEN RAISE EXCEPTION 'Método de entrega inválido'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Itens inválidos'; END IF;
  v_item_count := jsonb_array_length(p_items);
  IF v_item_count < 1 OR v_item_count > 50 THEN RAISE EXCEPTION 'Quantidade de itens inválida'; END IF;

  v_email := lower(trim(coalesce(p_customer_email, '')));
  IF v_email = '' THEN v_email := 'venda-manual+' || substr(gen_random_uuid()::text,1,8) || '@shopboxonline.com'; END IF;

  v_cpf := regexp_replace(coalesce(p_customer_cpf,''), '\D', '', 'g');
  IF v_cpf = '' THEN v_cpf := NULL; END IF;

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
      IF v_variant_stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente para % (%)', v_product.name, v_color; END IF;
    ELSE
      IF v_product.stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente para %', v_product.name; END IF;
    END IF;
    v_total := v_total + v_product.price * v_qty;
  END LOOP;

  SELECT coalesce(nullif(full_name,''), (SELECT email FROM auth.users WHERE id = v_uid))
    INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.orders (
    user_id, customer_name, customer_email, customer_phone, customer_cpf,
    shipping_address, payment_method, delivery_method, total, status, fulfillment_status,
    stock_restored_at, manual_sale, manual_created_by, manual_created_by_name
  )
  VALUES (
    v_uid, trim(p_customer_name), v_email, regexp_replace(p_customer_phone, '\D', '', 'g'), v_cpf,
    CASE WHEN p_delivery_method = 'pickup' THEN 'Retirada na loja' ELSE 'A definir' END,
    v_pm, p_delivery_method, v_total, v_status, 'pending',
    NULL, true, v_uid, v_name
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    v_color := nullif(trim(coalesce(v_item->>'color', '')), '');
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, variant_color, category)
    VALUES (v_order_id, v_product.id, v_product.name, v_product.price, v_qty, v_color, nullif(v_product.category, ''));

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
      RAISE EXCEPTION 'Estoque esgotado para %', v_product.name;
    END IF;
  END LOOP;

  RETURN v_order_id;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_method_status
  ON public.orders (payment_method, status, created_at DESC);