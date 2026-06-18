ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER TABLE public.products REPLICA IDENTITY FULL;