
CREATE TABLE public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  target_url text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  click_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX short_links_slug_lower_idx ON public.short_links (lower(slug));

GRANT SELECT ON public.short_links TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads active short links"
  ON public.short_links FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY "Admin views all short links"
  ON public.short_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin inserts short links"
  ON public.short_links FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin updates short links"
  ON public.short_links FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin deletes short links"
  ON public.short_links FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.short_links_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER short_links_touch
  BEFORE UPDATE ON public.short_links
  FOR EACH ROW EXECUTE FUNCTION public.short_links_touch_updated_at();

CREATE OR REPLACE FUNCTION public.resolve_short_link(_slug text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text;
BEGIN
  UPDATE public.short_links
     SET click_count = click_count + 1
   WHERE lower(slug) = lower(_slug) AND active = true
  RETURNING target_url INTO _url;
  RETURN _url;
END; $$;

GRANT EXECUTE ON FUNCTION public.resolve_short_link(text) TO anon, authenticated;
