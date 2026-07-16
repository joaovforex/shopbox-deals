
-- =============================================================
-- Fila de reembolso Cielo
-- =============================================================
CREATE TABLE public.cielo_refund_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cielo_payment_id text NOT NULL,
  amount numeric(10,2) NOT NULL,
  is_full boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  -- snapshot do pedido / operador (para caso o pedido seja apagado no futuro)
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_cpf text,
  payment_method text,
  order_total numeric(10,2),
  order_created_at timestamptz,
  items jsonb DEFAULT '[]'::jsonb,
  operator_id uuid,
  operator_name text,
  expected_mp_payment_id text,
  -- controle de execução
  status text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 20,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error text,
  last_error_code text,
  completed_at timestamptz,
  refund_id uuid REFERENCES public.refunds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cielo_refund_queue TO authenticated;
GRANT ALL ON public.cielo_refund_queue TO service_role;

ALTER TABLE public.cielo_refund_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver fila de reembolso Cielo"
  ON public.cielo_refund_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem inserir fila de reembolso Cielo"
  ON public.cielo_refund_queue FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem atualizar fila de reembolso Cielo"
  ON public.cielo_refund_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem apagar fila de reembolso Cielo"
  ON public.cielo_refund_queue FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_cielo_refund_queue_status_next ON public.cielo_refund_queue(status, next_attempt_at);
CREATE INDEX idx_cielo_refund_queue_order ON public.cielo_refund_queue(order_id);

CREATE TRIGGER set_cielo_refund_queue_updated_at
  BEFORE UPDATE ON public.cielo_refund_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
