
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'delivery';

CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address text,
  p_payment_method text,
  p_items jsonb,
  p_delivery_method text DEFAULT 'delivery'
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
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
    SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
    IF NOT v_product.active THEN RAISE EXCEPTION 'Produto indisponível: %', v_product.name; END IF;
    IF v_product.stock < v_qty THEN RAISE EXCEPTION 'Estoque insuficiente para %', v_product.name; END IF;
    v_total := v_total + v_product.price * v_qty;
  END LOOP;

  INSERT INTO public.orders (user_id, customer_name, customer_email, customer_phone, shipping_address, payment_method, delivery_method, total, status)
  VALUES (auth.uid(), p_customer_name, p_customer_email, p_customer_phone, p_shipping_address, p_payment_method, p_delivery_method, v_total, 'paid')
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
