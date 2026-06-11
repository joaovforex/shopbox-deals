ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_cpf text;

CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_name text, p_customer_email text, p_customer_phone text,
  p_payment_method text, p_delivery_method text, p_items jsonb,
  p_zip text DEFAULT NULL, p_street text DEFAULT NULL, p_number text DEFAULT NULL,
  p_complement text DEFAULT NULL, p_district text DEFAULT NULL,
  p_city text DEFAULT NULL, p_state text DEFAULT NULL,
  p_customer_cpf text DEFAULT NULL
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
  v_address text;
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
  IF p_payment_method NOT IN ('pix','card') THEN
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
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF NOT v_product.active THEN RAISE EXCEPTION 'Produto indisponível: %', v_product.name; END IF;
    IF v_product.stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente para %', v_product.name; END IF;
    v_total := v_total + v_product.price * v_qty;
  END LOOP;

  IF p_delivery_method = 'delivery' THEN
    v_address := concat_ws(' · ',
      nullif(concat_ws(', ', nullif(p_street,''), nullif(p_number,'')), ''),
      nullif(p_complement,''),
      nullif(p_district,''),
      nullif(concat_ws(' / ', nullif(p_city,''), nullif(upper(p_state),'')), ''),
      CASE WHEN nullif(p_zip,'') IS NOT NULL THEN 'CEP '||p_zip ELSE NULL END
    );
  ELSE
    v_address := 'Retirada na loja';
  END IF;

  INSERT INTO public.orders (
    user_id, customer_name, customer_email, customer_phone, customer_cpf,
    shipping_address, payment_method, delivery_method, total, status,
    shipping_zip, shipping_street, shipping_number, shipping_complement,
    shipping_district, shipping_city, shipping_state, fulfillment_status
  )
  VALUES (
    auth.uid(), trim(p_customer_name), lower(trim(p_customer_email)), p_customer_phone, v_cpf,
    v_address, p_payment_method, p_delivery_method, v_total, 'paid',
    nullif(p_zip,''), nullif(p_street,''), nullif(p_number,''), nullif(p_complement,''),
    nullif(p_district,''), nullif(p_city,''), nullif(upper(p_state),''), 'pending'
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid;
    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity)
    VALUES (v_order_id, v_product.id, v_product.name, v_product.price, v_qty);
    UPDATE public.products SET stock = stock - v_qty WHERE id = v_product.id;
  END LOOP;

  RETURN v_order_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(text,text,text,text,text,jsonb,text,text,text,text,text,text,text,text) TO anon, authenticated;