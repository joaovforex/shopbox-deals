-- Trigger to restore stock if order is cancelled, ensuring fulfillment never has divergent stock.
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    UPDATE public.products p
       SET stock = stock + oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.product_id = p.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_stock_on_cancel
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.restore_stock_on_cancel();

-- Mark column to make reservation behaviour explicit / queryable
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS reserved boolean NOT NULL DEFAULT true;