
CREATE POLICY "Catalog can upload product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.has_role_name(auth.uid(), 'catalog'));

CREATE POLICY "Catalog can update product images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role_name(auth.uid(), 'catalog'));

CREATE POLICY "Catalog can delete product images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role_name(auth.uid(), 'catalog'));
