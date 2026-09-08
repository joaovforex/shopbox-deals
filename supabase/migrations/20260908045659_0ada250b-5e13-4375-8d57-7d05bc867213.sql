ALTER PUBLICATION supabase_realtime DROP TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products WHERE (active = true);

DROP POLICY IF EXISTS "Fulfillment & admin can read realtime" ON realtime.messages;