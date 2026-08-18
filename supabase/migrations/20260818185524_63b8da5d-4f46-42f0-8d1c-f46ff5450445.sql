update public.delivery_upgrades set mp_payment_id='pay_ujm3tz66v4ll3mwz', mp_status='RECEIVED' where id='f1fe75bb-1a86-4119-9342-96e37eb89714';
update public.delivery_upgrades set mp_payment_id='pay_mkn4bie1udwoh146', mp_status='RECEIVED' where id='2d17cfa3-a302-4f66-be7c-ad5a7782d159';
select public.apply_delivery_upgrade('f1fe75bb-1a86-4119-9342-96e37eb89714','pay_ujm3tz66v4ll3mwz');
select public.apply_delivery_upgrade('2d17cfa3-a302-4f66-be7c-ad5a7782d159','pay_mkn4bie1udwoh146');