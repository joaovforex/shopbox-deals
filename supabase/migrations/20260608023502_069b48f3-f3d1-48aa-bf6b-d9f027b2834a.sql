
-- 1) Add new roles to app_role enum (use IF NOT EXISTS to be idempotent)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'catalog';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'fulfillment';

-- 2) Structured address columns + fulfillment status
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_zip text,
  ADD COLUMN IF NOT EXISTS shipping_street text,
  ADD COLUMN IF NOT EXISTS shipping_number text,
  ADD COLUMN IF NOT EXISTS shipping_complement text,
  ADD COLUMN IF NOT EXISTS shipping_district text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text,
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending';

-- 3) Helper: role check by text name (so we can use new enum values without
-- the "unsafe use of new enum value" restriction in the same transaction).
CREATE OR REPLACE FUNCTION public.has_role_name(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  )
$$;

-- 4) Drop old place_order overloads and recreate with structured address
DROP FUNCTION IF EXISTS public.place_order(text,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.place_order(text,text,text,text,text,jsonb,text);

CREATE OR REPLACE FUNCTION public.place_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_payment_method text,
  p_delivery_method text,
  p_items jsonb,
  p_zip text DEFAULT NULL,
  p_street text DEFAULT NULL,
  p_number text DEFAULT NULL,
  p_complement text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_qty int;
  v_address text;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::int;
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
    user_id, customer_name, customer_email, customer_phone,
    shipping_address, payment_method, delivery_method, total, status,
    shipping_zip, shipping_street, shipping_number, shipping_complement,
    shipping_district, shipping_city, shipping_state, fulfillment_status
  )
  VALUES (
    auth.uid(), p_customer_name, p_customer_email, p_customer_phone,
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
$$;

-- 5) RLS additions for the two new internal roles (uses text-based helper to avoid enum-in-same-tx restriction)

-- Catalog team can manage products
DROP POLICY IF EXISTS "Catalog can insert products" ON public.products;
CREATE POLICY "Catalog can insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role_name(auth.uid(), 'catalog'));

DROP POLICY IF EXISTS "Catalog can update products" ON public.products;
CREATE POLICY "Catalog can update products" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_role_name(auth.uid(), 'catalog'));

DROP POLICY IF EXISTS "Catalog can delete products" ON public.products;
CREATE POLICY "Catalog can delete products" ON public.products
  FOR DELETE TO authenticated
  USING (public.has_role_name(auth.uid(), 'catalog'));

-- Fulfillment team can view all orders and update fulfillment status
DROP POLICY IF EXISTS "Fulfillment can view orders" ON public.orders;
CREATE POLICY "Fulfillment can view orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_role_name(auth.uid(), 'fulfillment'));

DROP POLICY IF EXISTS "Fulfillment can update orders" ON public.orders;
CREATE POLICY "Fulfillment can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING (public.has_role_name(auth.uid(), 'fulfillment'));

DROP POLICY IF EXISTS "Fulfillment can view order items" ON public.order_items;
CREATE POLICY "Fulfillment can view order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.has_role_name(auth.uid(), 'fulfillment'));

-- Admins can insert roles (for the team management UI)
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
