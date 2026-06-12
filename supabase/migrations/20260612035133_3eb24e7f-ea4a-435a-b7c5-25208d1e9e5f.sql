-- 1) Coluna de controle (idempotência)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_restored_at timestamptz;

-- 2) Devolve estoque de cancelados não restaurados
WITH to_restore AS (
  SELECT oi.product_id, SUM(oi.quantity)::int AS qty
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
   WHERE o.status = 'cancelled'
     AND o.stock_restored_at IS NULL
   GROUP BY oi.product_id
)
UPDATE public.products p
   SET stock = p.stock + tr.qty
  FROM to_restore tr
 WHERE p.id = tr.product_id;

UPDATE public.orders SET stock_restored_at = now()
 WHERE status = 'cancelled' AND stock_restored_at IS NULL;

-- 3) Função idempotente (BEFORE trigger para persistir NEW)
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.stock_restored_at IS NULL THEN
    UPDATE public.products p
       SET stock = stock + oi.quantity
      FROM public.order_items oi
     WHERE oi.order_id = NEW.id
       AND oi.product_id = p.id;
    NEW.stock_restored_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) Trigger
DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_stock_on_cancel
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION public.restore_stock_on_cancel();