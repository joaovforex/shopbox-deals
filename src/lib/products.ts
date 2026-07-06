import { queryOptions, infiniteQueryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";


export type ColorVariant = {
  color: string;
  hex?: string | null;
  stock: number;
};

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
  color_variants?: ColorVariant[] | null;
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
  color_variants?: ColorVariant[] | null;
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
  // O Supabase corta silenciosamente em 1000 linhas por request. Como o admin
  // usa este resultado para calcular contagens (ativos, ocultos, esgotados) e
  // ações em massa, precisamos paginar até esgotar o catálogo — do contrário
  // os contadores ficam "travados" no teto e produtos somem das listas.
  const PAGE = 1000;
  const all: Product[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (opts.onlyActive) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Product[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

export const activeProductsQuery = () =>
  queryOptions({
    queryKey: ["products", "active"],
    queryFn: () => fetchProducts({ onlyActive: true }),
    staleTime: 60_000,
  });

export const PRODUCTS_PAGE_SIZE = 50;

type PagedRow = ProductCard & { total_count: number };
type PagedResult = { items: ProductCard[]; total: number; nextOffset: number | null };

const CATALOG_PRODUCT_COLUMNS = "id,name,price,original_price,category,image_url,images,stock,sku,created_at,color_variants";

function isCatalogFetchTransient(error: unknown): boolean {
  const maybe = error as { code?: string; message?: string } | null;
  const message = maybe?.message ?? String(error ?? "");
  return (
    maybe?.code === "PGRST002" ||
    message.includes("schema cache") ||
    message.includes("Failed to fetch") ||
    message.includes("fetch failed")
  );
}

function cleanSearchTerm(value: string): string {
  return value.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

async function fetchProductsPagedDirect(args: {
  search?: string;
  category?: string;
  stock?: "in_stock" | "out_of_stock";
  maxPrice?: number;
  offset: number;
  limit: number;
}): Promise<PagedResult> {
  let query = supabase
    .from("products")
    .select(CATALOG_PRODUCT_COLUMNS, { count: "exact" })
    .eq("active", true)
    .order("created_at", { ascending: false });

  const term = args.search?.trim() ? cleanSearchTerm(args.search) : "";
  if (term) query = query.ilike("name", `%${term}%`);
  if (args.category) query = query.eq("category", args.category);
  if (typeof args.maxPrice === "number") query = query.lte("price", args.maxPrice);
  if (args.stock === "in_stock") query = query.gt("stock", 0);
  if (args.stock === "out_of_stock") query = query.eq("stock", 0);

  const { data, count, error } = await query.range(args.offset, args.offset + args.limit - 1);
  if (error) throw error;

  const items = (data ?? []) as ProductCard[];
  const total = count ?? items.length;
  const nextOffset = args.offset + items.length < total ? args.offset + items.length : null;
  return { items, total, nextOffset };
}

export async function fetchProductsPaged(args: {
  search?: string;
  category?: string;
  stock?: "in_stock" | "out_of_stock";
  maxPrice?: number;
  offset: number;
  limit: number;
}): Promise<PagedResult> {
  try {
    const { data, error } = await supabase.rpc("list_products_paged", {
      p_search: args.search?.trim() ? args.search.trim() : undefined,
      p_category: args.category ? args.category : undefined,
      p_limit: args.limit,
      p_offset: args.offset,
      ...(args.stock ? { p_stock_status: args.stock } : {}),
      ...(typeof args.maxPrice === "number" ? { p_max_price: args.maxPrice } : {}),
    });
    if (error) throw error;
    const rows = (data ?? []) as PagedRow[];
    const total = Number(rows[0]?.total_count ?? 0);
    const items: ProductCard[] = rows.map(({ total_count: _t, ...rest }) => rest);
    const nextOffset = args.offset + items.length < total ? args.offset + items.length : null;
    return { items, total, nextOffset };
  } catch (error) {
    if (!isCatalogFetchTransient(error)) throw error;
    console.error("Catalog RPC failed; using direct product query fallback.", error);

    try {
      return await fetchProductsPagedDirect(args);
    } catch (fallbackError) {
      console.error("Catalog fallback query failed; rendering an empty catalog instead of a 500.", fallbackError);
      return { items: [], total: 0, nextOffset: null };
    }
  }
}

export const pagedProductsQuery = (args: { search?: string; category?: string; stock?: "in_stock" | "out_of_stock"; maxPrice?: number }) =>
  infiniteQueryOptions({
    queryKey: ["products", "paged", args.category ?? null, args.search ?? "", args.stock ?? "all", args.maxPrice ?? null],
    queryFn: ({ pageParam }) =>
      fetchProductsPaged({
        search: args.search,
        category: args.category,
        stock: args.stock,
        maxPrice: args.maxPrice,
        offset: pageParam as number,
        limit: PRODUCTS_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 5 * 60_000,
  });

/** Query para uma página específica (paginação numerada). */
export const pageProductsQuery = (args: { search?: string; category?: string; stock?: "in_stock" | "out_of_stock"; maxPrice?: number; page: number }) =>
  queryOptions({
    queryKey: ["products", "page", args.category ?? null, args.search ?? "", args.stock ?? "all", args.maxPrice ?? null, args.page],
    queryFn: () =>
      fetchProductsPaged({
        search: args.search,
        category: args.category,
        stock: args.stock,
        maxPrice: args.maxPrice,
        offset: Math.max(0, (args.page - 1) * PRODUCTS_PAGE_SIZE),
        limit: PRODUCTS_PAGE_SIZE,
      }),
    staleTime: 60_000,
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
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
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

const ROLES_CACHE_KEY = "shopbox_roles_v1";

type CachedRoles = { userId: string; roles: TeamRole[]; ts: number };

function readRolesCache(userId: string | null): TeamRole[] | null {
  if (!userId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ROLES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRoles;
    if (parsed.userId !== userId) return null;
    // 10 min de validade
    if (Date.now() - parsed.ts > 10 * 60_000) return null;
    return parsed.roles;
  } catch {
    return null;
  }
}

function writeRolesCache(userId: string, roles: TeamRole[]) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      ROLES_CACHE_KEY,
      JSON.stringify({ userId, roles, ts: Date.now() } satisfies CachedRoles),
    );
  } catch {}
}

export function clearRolesCache() {
  if (typeof sessionStorage === "undefined") return;
  try { sessionStorage.removeItem(ROLES_CACHE_KEY); } catch {}
}

export async function getMyRoles(): Promise<TeamRole[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    clearRolesCache();
    return [];
  }
  const cached = readRolesCache(user.id);
  if (cached) return cached;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (error) return [];
  const roles = (data ?? []).map((r) => r.role as TeamRole);
  writeRolesCache(user.id, roles);
  return roles;
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

/** Lê o cache síncrono de roles (não dispara fetch). Usado para hidratar UI instantaneamente. */
export function readCachedTeamRoleSync(): boolean | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ROLES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRoles;
    if (Date.now() - parsed.ts > 10 * 60_000) return null;
    const team: TeamRole[] = ["admin", "manager", "catalog", "fulfillment"];
    return parsed.roles.some((r) => team.includes(r));
  } catch {
    return null;
  }
}

/** Hook que retorna true se o usuário tem qualquer cargo da equipe (admin/manager/catalog/fulfillment). */
export function useHasTeamRole(): boolean {
  const { data } = useQuery({
    queryKey: ["my-team-role"],
    queryFn: () => hasAnyRole(["admin", "manager", "catalog", "fulfillment"]),
    staleTime: 5 * 60_000,
    initialData: () => readCachedTeamRoleSync() ?? undefined,
  });
  return data === true;
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
