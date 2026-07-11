
DROP POLICY IF EXISTS "site-assets public read" ON storage.objects;
CREATE POLICY "site-assets public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'site-assets');

DROP POLICY IF EXISTS "site-assets superadmin insert" ON storage.objects;
CREATE POLICY "site-assets superadmin insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "site-assets superadmin update" ON storage.objects;
CREATE POLICY "site-assets superadmin update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "site-assets superadmin delete" ON storage.objects;
CREATE POLICY "site-assets superadmin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'site-assets' AND public.has_role(auth.uid(), 'admin'));
