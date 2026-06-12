-- Recreate create_pending_order to NOT decrement stock (only validate availability)
CREATE OR REPLACE FUNCTION public.create_pending_order(
  p_customer_name text, p_customer_email text, p_customer_phone text, p_customer_cpf text,
  p_payment_method text, p_delivery_method text, p_items jsonb
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
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 999 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF NOT v_product.active THEN RAISE EXCEPTION 'Produto indisponível: %', v_product.name; END IF;
    IF v_product.stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente para %', v_product.name; END IF;
    v_total := v_total + v_product.price * v_qty;
  END LOOP;

  INSERT INTO public.orders (
    user_id, customer_name, customer_email, customer_phone, customer_cpf,
    shipping_address, payment_method, delivery_method, total, status, fulfillment_status,
    stock_restored_at  -- marca como "sem estoque reservado" para que cancelamento não tente devolver
  )
  VALUES (
    auth.uid(), trim(p_customer_name), lower(trim(p_customer_email)), p_customer_phone, v_cpf,
    'Retirada na loja', p_payment_method, p_delivery_method, v_total, 'pending', 'pending',
    now()
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity)
    VALUES (v_order_id, v_product.id, v_product.name, v_product.price, v_qty);
    -- NÃO debita estoque aqui. Estoque só é debitado quando o pagamento for confirmado.
  END LOOP;

  RETURN v_order_id;
END;
$function$;

-- Function called by the webhook when payment is approved: debits stock atomically.
CREATE OR REPLACE FUNCTION public.confirm_order_paid(p_order_id uuid, p_mp_payment_id text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_restored timestamptz;
  v_item record;
  v_updated int;
BEGIN
  SELECT status, stock_restored_at INTO v_status, v_restored
    FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_status = 'paid' THEN RETURN 'already_paid'; END IF;
  IF v_status = 'cancelled' THEN RETURN 'already_cancelled'; END IF;

  -- Debita estoque com verificação por item; se faltar, cancela o pedido
  FOR v_item IN
    SELECT oi.product_id, oi.quantity, oi.product_name
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
  LOOP
    UPDATE public.products
       SET stock = stock - v_item.quantity
     WHERE id = v_item.product_id
       AND stock >= v_item.quantity;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      -- Não deu para debitar: cancela e devolve o que já tinha debitado deste pedido
      UPDATE public.orders
         SET status = 'cancelled',
             mp_payment_id = coalesce(mp_payment_id, p_mp_payment_id),
             stock_restored_at = now()  -- nada a restaurar fora deste loop pois ainda não marcamos como reservado
       WHERE id = p_order_id;
      -- Devolve o que foi debitado em iterações anteriores deste loop
      UPDATE public.products p
         SET stock = stock + oi.quantity
        FROM public.order_items oi
       WHERE oi.order_id = p_order_id
         AND oi.product_id = p.id
         AND oi.product_id <> v_item.product_id;
      RETURN 'out_of_stock';
    END IF;
  END LOOP;

  -- Sucesso: marca como pago e indica que existe estoque reservado (para o gatilho restaurar caso seja cancelado depois)
  UPDATE public.orders
     SET status = 'paid',
         mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
         stock_restored_at = NULL
   WHERE id = p_order_id;

  RETURN 'ok';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.confirm_order_paid(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_paid(uuid, text) TO service_role;