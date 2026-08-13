DELETE FROM public.cashback_entries
WHERE order_id = '35806a3b-308c-4650-a325-22af1e201d7b' AND kind = 'earn';

UPDATE public.orders
SET status = 'pending',
    fulfillment_status = 'pending',
    cashback_granted_at = NULL,
    asaas_payment_id = NULL,
    asaas_status = NULL,
    mp_payment_id = NULL,
    updated_at = now()
WHERE id = '35806a3b-308c-4650-a325-22af1e201d7b';