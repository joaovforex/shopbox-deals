ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by_name text;

UPDATE public.products p
   SET created_by_name = COALESCE(NULLIF(pr.full_name, ''), u.email)
  FROM auth.users u
  LEFT JOIN public.profiles pr ON pr.id = u.id
 WHERE p.created_by = u.id
   AND p.created_by_name IS NULL;