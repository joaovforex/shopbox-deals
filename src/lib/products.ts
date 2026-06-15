import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
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
  sku: string;
  created_at: string;
};

/** Versão enxuta usada na listagem (sem description). */
export type ProductCard = {
  id: string;
  name: string;
  price: number;
  original_price: number | null;
  category: string | null;
  image_url: string | null;
  images: string[];
  stock: number;
  sku: string;
  created_at: string;
};


export type TeamRole = "admin" | "manager" | "catalog" | "fulfillment" | "user";

export function productImages(p: Pick<Product, "images" | "image_url">): string[] {
  const arr = (p.images ?? []).filter(Boolean);
  if (arr.length > 0) return arr;
  return p.image_url ? [p.image_url] : [];
}

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const clean = url.split("?")[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogg)$/.test(clean);
}

export async function fetchProducts(opts: { onlyActive?: boolean } = {}) {
  let q = supabase.from("products").select("*").order("created_at", { ascending: false });
  if (opts.onlyActive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Product[];
}

export const activeProductsQuery = () =>
  queryOptions({
    queryKey: ["products", "active"],
    queryFn: () => fetchProducts({ onlyActive: true }),
    staleTime: 60_000,
  });

export const PRODUCTS_PAGE_SIZE = 24;

type PagedRow = ProductCard & { total_count: number };
type PagedResult = { items: ProductCard[]; total: number; nextOffset: number | null };

export async function fetchProductsPaged(args: {
  search?: string;
  category?: string;
  offset: number;
  limit: number;
}): Promise<PagedResult> {
  const { data, error } = await supabase.rpc("list_products_paged", {
    p_search: args.search?.trim() ? args.search.trim() : undefined,
    p_category: args.category ? args.category : undefined,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as PagedRow[];
  const total = Number(rows[0]?.total_count ?? 0);
  const items: ProductCard[] = rows.map(({ total_count: _t, ...rest }) => rest);
  const nextOffset = args.offset + items.length < total ? args.offset + items.length : null;
  return { items, total, nextOffset };
}

export const pagedProductsQuery = (args: { search?: string; category?: string }) =>
  infiniteQueryOptions({
    queryKey: ["products", "paged", args.category ?? null, args.search ?? ""],
    queryFn: ({ pageParam }) =>
      fetchProductsPaged({
        search: args.search,
        category: args.category,
        offset: pageParam as number,
        limit: PRODUCTS_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 5 * 60_000,
  });

export async function fetchUsedCategories(): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_used_categories");
  if (error) return [];
  return (data ?? []).map((r: { category: string }) => r.category);
}

export const usedCategoriesQuery = () =>
  queryOptions({
    queryKey: ["categories", "used"],
    queryFn: fetchUsedCategories,
    staleTime: 5 * 60_000,
  });

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
  isManager: boolean;
  isCatalog: boolean;
  isFulfillment: boolean;
  hasAnyTeamRole: boolean;
};

/**
 * Hierarquia de cargos:
 * - admin       → Super Admin (acesso total: catálogo, expedição, pedidos/métricas, equipe)
 * - manager     → ADM (catálogo + expedição)
 * - catalog     → somente catálogo
 * - fulfillment → somente expedição
 */
export async function getRoleSummary(): Promise<RoleSummary> {
  const roles = await getMyRoles();
  const isSuperAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  const isCatalog = isSuperAdmin || isManager || roles.includes("catalog");
  const isFulfillment = isSuperAdmin || isManager || roles.includes("fulfillment");
  return {
    isSuperAdmin,
    isManager,
    isCatalog,
    isFulfillment,
    hasAnyTeamRole: isSuperAdmin || isManager || isCatalog || isFulfillment,
  };
}
