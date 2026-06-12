
-- 1) Trigger que devolve o estoque quando o pedido é cancelado
DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON public.orders;
CREATE TRIGGER trg_restore_stock_on_cancel
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.restore_stock_on_cancel();

-- 2) Função que expira pedidos pendentes antigos
CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(p_minutes int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH updated AS (
    UPDATE public.orders
       SET status = 'cancelled'
     WHERE status = 'pending'
       AND created_at < now() - make_interval(mins => p_minutes)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

-- 3) Libera agora o estoque de quem ficou preso (pedidos pendentes > 30 min)
SELECT public.expire_stale_pending_orders(30);
