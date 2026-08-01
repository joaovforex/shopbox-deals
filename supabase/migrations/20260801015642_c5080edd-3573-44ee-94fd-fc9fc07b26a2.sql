-- 1) Snapshot de categoria em order_items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS category text;

UPDATE public.order_items oi
   SET category = NULLIF(p.category, '')
  FROM public.products p
 WHERE p.id = oi.product_id
   AND oi.category IS NULL
   AND NULLIF(p.category, '') IS NOT NULL;

-- 2) Gravar categoria na venda (apenas o campo novo)
CREATE OR REPLACE FUNCTION public.create_manual_order(p_customer_name text, p_customer_phone text, p_delivery_method text, p_items jsonb, p_customer_email text DEFAULT NULL::text, p_customer_cpf text DEFAULT NULL::text)
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;

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
    'mercadopago', p_delivery_method, v_total, 'pending', 'pending',
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

CREATE OR REPLACE FUNCTION public.create_pending_order(p_customer_name text, p_customer_email text, p_customer_phone text, p_customer_cpf text, p_payment_method text, p_delivery_method text, p_items jsonb)
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
  IF p_payment_method NOT IN ('pix','card','mercadopago','cielo') THEN RAISE EXCEPTION 'Método de pagamento inválido'; END IF;
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

-- 3) Métricas: nome sempre do snapshot, categoria do snapshot com fallback
CREATE OR REPLACE FUNCTION public.admin_order_metrics(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_delivery text DEFAULT NULL::text, p_payment text DEFAULT NULL::text, p_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_unknown constant text := 'Sem categoria (produto removido)';
BEGIN
  IF NOT public.admin_can_view_reports(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para ver relatórios';
  END IF;

  WITH paid AS (
    SELECT o.id, o.total, o.delivery_fee, o.delivery_method, o.payment_method, o.payment_provider
      FROM public.orders o
     WHERE o.status = 'paid'
       AND (p_from IS NULL OR o.created_at >= p_from)
       AND (p_to IS NULL OR o.created_at <= p_to)
       AND (p_delivery IS NULL OR o.delivery_method = p_delivery)
       AND (p_payment IS NULL OR o.payment_method = p_payment)
       AND (
         p_category IS NULL OR EXISTS (
           SELECT 1 FROM public.order_items oi
             LEFT JOIN public.products pr ON pr.id = oi.product_id
            WHERE oi.order_id = o.id
              AND COALESCE(NULLIF(oi.category, ''), NULLIF(pr.category, ''), v_unknown) = p_category
         )
       )
  ),
  items AS (
    SELECT oi.product_id,
           COALESCE(NULLIF(oi.product_name, ''), 'Produto removido') AS product_name,
           COALESCE(NULLIF(oi.category, ''), NULLIF(pr.category, ''), v_unknown) AS category,
           oi.quantity,
           oi.unit_price
      FROM public.order_items oi
      JOIN paid ON paid.id = oi.order_id
      LEFT JOIN public.products pr ON pr.id = oi.product_id
     WHERE p_category IS NULL
        OR COALESCE(NULLIF(oi.category, ''), NULLIF(pr.category, ''), v_unknown) = p_category
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM paid)::bigint AS orders_count,
      COALESCE((SELECT SUM(quantity) FROM items), 0)::bigint AS units_sold,
      COALESCE((SELECT SUM(unit_price * quantity) FROM items), 0)::numeric AS products_revenue,
      CASE WHEN p_category IS NULL
           THEN COALESCE((SELECT SUM(COALESCE(delivery_fee, 0)) FROM paid), 0)::numeric
           ELSE 0::numeric END AS shipping_revenue,
      COALESCE((SELECT count(*) FROM paid WHERE delivery_method = 'delivery'), 0)::bigint AS delivery_count,
      COALESCE((SELECT count(*) FROM paid WHERE delivery_method = 'pickup'), 0)::bigint AS pickup_count
  ),
  by_payment AS (
    SELECT COALESCE(NULLIF(payment_method, ''), 'outro') AS method,
           COALESCE(NULLIF(payment_provider, ''), 'outro') AS provider,
           count(*)::bigint AS orders_count,
           COALESCE(SUM(total), 0)::numeric AS revenue
      FROM paid
     GROUP BY 1, 2
  ),
  by_product AS (
    SELECT product_name AS name,
           MAX(product_id::text) AS id,
           SUM(quantity)::bigint AS qty,
           SUM(unit_price * quantity)::numeric AS revenue
      FROM items
     GROUP BY product_name
  ),
  by_category AS (
    SELECT category AS name,
           SUM(quantity)::bigint AS qty,
           SUM(unit_price * quantity)::numeric AS revenue
      FROM items
     GROUP BY category
  )
  SELECT jsonb_build_object(
    'orders_count', t.orders_count,
    'units_sold', t.units_sold,
    'revenue', t.products_revenue + t.shipping_revenue,
    'products_revenue', t.products_revenue,
    'shipping_revenue', t.shipping_revenue,
    'avg_ticket', CASE WHEN t.orders_count > 0
                       THEN round((t.products_revenue + t.shipping_revenue) / t.orders_count, 2)
                       ELSE 0 END,
    'delivery_count', t.delivery_count,
    'pickup_count', t.pickup_count,
    'by_payment', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'method', method, 'provider', provider,
                      'orders_count', orders_count, 'revenue', revenue
                    ) ORDER BY revenue DESC) FROM by_payment), '[]'::jsonb),
    'product_ranking', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'id', id, 'name', name, 'qty', qty, 'revenue', revenue
                    ) ORDER BY qty DESC) FROM by_product), '[]'::jsonb),
    'category_ranking', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                      'name', name, 'qty', qty, 'revenue', revenue
                    ) ORDER BY revenue DESC) FROM by_category), '[]'::jsonb)
  ) INTO v_result
  FROM totals t;

  RETURN v_result;
END;
$function$;