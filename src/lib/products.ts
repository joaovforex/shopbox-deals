import { supabase } from "@/integrations/supabase/client";

export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  category: string | null;
  image_url: string | null;
  images: string[];
  stock: number;
  active: boolean;
  created_at: string;
};

export type TeamRole = "admin" | "catalog" | "fulfillment" | "user";

export function productImages(p: Pick<Product, "images" | "image_url">): string[] {
  const arr = (p.images ?? []).filter(Boolean);
  if (arr.length > 0) return arr;
  return p.image_url ? [p.image_url] : [];
}

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
  const { data, error: signErr } = await supabase.storage
    .from("product-images")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (signErr) throw signErr;
  return data.signedUrl;
}

export async function getMyRoles(): Promise<TeamRole[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (error) return [];
  return (data ?? []).map((r) => r.role as TeamRole);
}

export async function isAdmin(): Promise<boolean> {
  const roles = await getMyRoles();
  return roles.includes("admin");
}

/** Super Admin (Dono) = papel `admin`. Único com acesso a métricas e equipe. */
export async function isSuperAdmin(): Promise<boolean> {
  return isAdmin();
}

export async function hasAnyRole(roles: TeamRole[]): Promise<boolean> {
  const mine = await getMyRoles();
  return mine.some((r) => roles.includes(r));
}

export type RoleSummary = {
  isSuperAdmin: boolean;
  isCatalog: boolean;
  isFulfillment: boolean;
  hasAnyTeamRole: boolean;
};

export async function getRoleSummary(): Promise<RoleSummary> {
  const roles = await getMyRoles();
  const isSuperAdmin = roles.includes("admin");
  const isCatalog = roles.includes("catalog");
  const isFulfillment = roles.includes("fulfillment");
  return {
    isSuperAdmin,
    isCatalog,
    isFulfillment,
    hasAnyTeamRole: isSuperAdmin || isCatalog || isFulfillment,
  };
}
