UPDATE public.refunds
SET status = 'cancelled',
    provider_status = 'CANCELLED',
    cancelled_at = now(),
    confirmed_at = NULL,
    failure_reason = 'Devolução Pix cancelada pela Asaas — exige autorização de ação crítica na conta. Cliente não recebeu.',
    last_checked_at = now()
WHERE id = 'c135882c-9650-4825-a3b3-963dcbfec5cb';

INSERT INTO public.admin_notifications (type, title, body, metadata)
VALUES (
  'refund_cancelled',
  'Estorno cancelado pelo banco',
  'Edimara Moreira — R$ 44,08 não foi devolvido. Reenvio também foi cancelado pela Asaas (autorização pendente).',
  jsonb_build_object('refund_id', 'c135882c-9650-4825-a3b3-963dcbfec5cb', 'amount', 44.08)
);