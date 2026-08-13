delete from public.cashback_entries
where order_id = '35806a3b-308c-4650-a325-22af1e201d7b'
  and kind = 'purchase'
  and consumed = 0;

update public.orders
set status = 'pending',
    asaas_payment_id = null,
    mp_payment_id = null,
    asaas_status = null,
    mp_payment_status = null,
    cashback_granted_at = null
where id = '35806a3b-308c-4650-a325-22af1e201d7b';