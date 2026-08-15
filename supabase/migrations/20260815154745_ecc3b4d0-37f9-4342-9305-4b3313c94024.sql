ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_label_printed_by_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_label_printed_by_fkey FOREIGN KEY (label_printed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_label_generated_by_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_label_generated_by_fkey FOREIGN KEY (label_generated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_refunded_by_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_refunded_by_fkey FOREIGN KEY (refunded_by) REFERENCES auth.users(id) ON DELETE SET NULL;