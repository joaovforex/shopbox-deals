
create policy "Public can view product images" on storage.objects for select
  using (bucket_id = 'product-images');
create policy "Admins can upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins can update product images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
create policy "Admins can delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_role(auth.uid(), 'admin'));
