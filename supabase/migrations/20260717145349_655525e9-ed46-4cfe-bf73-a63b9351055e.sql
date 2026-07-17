
CREATE TABLE public.pos_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID,
  operator_name TEXT,
  items JSONB NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  note TEXT,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  mp_status TEXT,
  mp_status_detail TEXT,
  mp_payment_method_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pos_charges_created_at_idx ON public.pos_charges (created_at DESC);
CREATE INDEX pos_charges_status_idx ON public.pos_charges (status);
CREATE INDEX pos_charges_mp_payment_id_idx ON public.pos_charges (mp_payment_id);

GRANT SELECT ON public.pos_charges TO authenticated;
GRANT ALL ON public.pos_charges TO service_role;

ALTER TABLE public.pos_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view pos_charges"
  ON public.pos_charges FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'catalog')
    OR public.has_role(auth.uid(), 'fulfillment')
  );
