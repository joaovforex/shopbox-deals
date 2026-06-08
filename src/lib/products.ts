import { supabase } from "@/integrations/supabase/client";

export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  category: string | null;
  image_url: string | null;
  stock: number;
  active: boolean;
  created_at: string;
};

export async function fetchProducts(opts: { onlyActive?: boolean } = {}) {
  let q = supabase.from("products").select("*").order("created_at", { ascending: false });
  if (opts.onlyActive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Product[];
}

export async function fetchProduct(id: string) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

export async function uploadProductImage(file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  // Use a very long signed URL (1 year). Bucket é privado, mas a policy permite leitura pública.
  const { data, error: signErr } = await supabase.storage
    .from("product-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (signErr) throw signErr;
  return data.signedUrl;
}

export async function isAdmin(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return !!data;
}
