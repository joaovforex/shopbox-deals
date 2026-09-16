import { queryOptions, infiniteQueryOptions, useQuery } from "@tanstack/react-query";
import { normalizeSearchTerm } from "@/lib/pgrst";
import { supabase } from "@/integrations/supabase/client";
import { discountPct } from "@/lib/format";


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
  brand?: string | null;
  size?: string | null;
  unidade_id?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  /** true (padrão) = cliente pode abater saldo de cashback no preço deste produto. */
  cashback_redeemable?: boolean;
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
  brand?: string | null;
  size?: string | null;
  unidade_id?: string | null;
  cashback_redeemable?: boolean;
};



export type TeamRole = "admin" | "manager" | "catalog" | "fulfillment" | "cashier" | "user";

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

export const ADMIN_PRODUCTS_PAGE_SIZE = 100;

export async function fetchAdminProductsPaged(args: { offset: number; limit: number }): Promise<{
  items: Product[];
  total: number;
  nextOffset: number | null;
}> {
  const { data, count, error } = await supabase
    .from("products")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(args.offset, args.offset + args.limit - 1);
  if (error) throw error;
  const items = (data ?? []) as Product[];
  const total = count ?? items.length;
  const nextOffset = args.offset + items.length < total ? args.offset + items.length : null;
  return { items, total, nextOffset };
}

/** Agente que cadastrou o produto (created_by_name), com contagem de ativos/ocultos. */
export type ProductAgent = { name: string; total: number; ativos: number; ocultos: number };

/**
 * Lista os agentes que já cadastraram produtos, com contagens.
 * Percorre o catálogo em lotes de 1000 (limite do PostgREST) para não perder
 * agentes quando há mais de 1000 produtos. Somente colunas leves.
 */
export async function fetchProductAgents(): Promise<ProductAgent[]> {
  const map = new Map<string, ProductAgent>();
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("created_by_name, active")
      .not("created_by_name", "is", null)
      .neq("created_by_name", "")
      .order("created_by_name", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { created_by_name: string | null; active: boolean }[];
    for (const r of rows) {
      const name = (r.created_by_name ?? "").trim();
      if (!name) continue;
      const cur = map.get(name) ?? { name, total: 0, ativos: 0, ocultos: 0 };
      cur.total += 1;
      if (r.active) cur.ativos += 1;
      else cur.ocultos += 1;
      map.set(name, cur);
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export const productAgentsQuery = () =>
  queryOptions({
    queryKey: ["admin", "product-agents"],
    queryFn: fetchProductAgents,
    staleTime: 60_000,
  });

/** IDs dos produtos de um agente num dado estado ativo/oculto (para ações em massa). */
export async function fetchAgentProductIds(agent: string, active: boolean): Promise<string[]> {
  const ids: string[] = [];
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .eq("created_by_name", agent)
      .eq("active", active)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { id: string }[];
    for (const r of rows) ids.push(r.id);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

export const adminProductsInfiniteQuery = () =>
  infiniteQueryOptions({
    queryKey: ["admin", "products", "paged"],
    queryFn: ({ pageParam }) =>
      fetchAdminProductsPaged({ offset: pageParam as number, limit: ADMIN_PRODUCTS_PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 60_000,
  });

export const PRODUCTS_PAGE_SIZE = 50;

type PagedRow = ProductCard & { total_count: number };
type PagedResult = { items: ProductCard[]; total: number; nextOffset: number | null };

const CATALOG_PRODUCT_COLUMNS = "id,name,price,original_price,category,image_url,images,stock,sku,created_at,color_variants,brand,size,unidade_id,cashback_redeemable";

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
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  size?: string;
  offset: number;
  limit: number;
}): Promise<PagedResult> {
  let query = supabase
    .from("products")
    .select(CATALOG_PRODUCT_COLUMNS, { count: "exact" })
    .eq("active", true)
    .order("created_at", { ascending: false });

  const term = args.search?.trim() ? normalizeSearchTerm(args.search) : "";
  if (term) query = query.ilike("search_norm", `%${term}%`);
  if (args.category) query = query.eq("category", args.category);
  if (args.brand) query = query.eq("brand", args.brand);
  if (args.size) query = query.eq("size", args.size);
  if (typeof args.minPrice === "number") query = query.gte("price", args.minPrice);
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
  minPrice?: number;
  maxPrice?: number;
  brand?: string;
  size?: string;
  offset: number;
  limit: number;
}): Promise<PagedResult> {
  // O RPC list_products_paged não conhece preço mínimo nem marca/numeração,
  // então caímos direto na query (filtrada no servidor) nesses casos.
  if (typeof args.minPrice === "number" || args.brand || args.size) {
    try {
      return await fetchProductsPagedDirect(args);
    } catch (err) {
      console.error("Catalog direct query failed; returning empty.", err);
      return { items: [], total: 0, nextOffset: null };
    }
  }
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

export const pagedProductsQuery = (args: { search?: string; category?: string; stock?: "in_stock" | "out_of_stock"; minPrice?: number; maxPrice?: number }) =>
  infiniteQueryOptions({
    queryKey: ["products", "paged", args.category ?? null, args.search ?? "", args.stock ?? "all", args.minPrice ?? null, args.maxPrice ?? null],
    queryFn: ({ pageParam }) =>
      fetchProductsPaged({
        search: args.search,
        category: args.category,
        stock: args.stock,
        minPrice: args.minPrice,
        maxPrice: args.maxPrice,
        offset: pageParam as number,
        limit: PRODUCTS_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 5 * 60_000,
  });

/** Query para uma página específica (paginação numerada). */
export const pageProductsQuery = (args: { search?: string; category?: string; stock?: "in_stock" | "out_of_stock"; minPrice?: number; maxPrice?: number; brand?: string; size?: string; page: number }) =>
  queryOptions({
    queryKey: ["products", "page", args.category ?? null, args.search ?? "", args.stock ?? "all", args.minPrice ?? null, args.maxPrice ?? null, args.brand ?? null, args.size ?? null, args.page],
    queryFn: () =>
      fetchProductsPaged({
        search: args.search,
        category: args.category,
        stock: args.stock,
        minPrice: args.minPrice,
        maxPrice: args.maxPrice,
        brand: args.brand,
        size: args.size,
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

const byDiscountDesc = (a: ProductCard, b: ProductCard) =>
  discountPct(b.original_price, b.price) - discountPct(a.original_price, a.price);

/** Vitrine da home: top ofertas por página 1 (usado como fallback). */
async function fetchHomeTopOffers(limit: number): Promise<ProductCard[]> {
  const page = await fetchProductsPaged({ stock: "in_stock", offset: 0, limit: 50 });
  return page.items
    .filter((p) => p.stock > 0)
    .sort(byDiscountDesc)
    .slice(0, limit);
}

/**
 * Vitrine MISTA da home: intercala produtos de várias categorias (round-robin),
 * para a home não ficar 100% autopeças. Busca um punhado de cada categoria em
 * estoque e alterna entre elas; dentro de cada categoria, maiores descontos primeiro.
 * Se houver só uma categoria (ou falha), cai na vitrine de top ofertas.
 */
export async function fetchHomeShowcase(limit = 12): Promise<ProductCard[]> {
  let cats: string[] = [];
  try {
    cats = (await fetchUsedCategories()).filter(Boolean);
  } catch {
    cats = [];
  }

  if (cats.length <= 1) {
    return fetchHomeTopOffers(limit);
  }

  const perCat = Math.max(3, Math.ceil(limit / cats.length) + 2);
  const buckets = await Promise.all(
    cats.map(async (c) => {
      try {
        const r = await fetchProductsPaged({ category: c, stock: "in_stock", offset: 0, limit: perCat });
        return r.items.filter((p) => p.stock > 0).sort(byDiscountDesc);
      } catch {
        return [] as ProductCard[];
      }
    }),
  );

  // Round-robin entre as categorias que retornaram algo.
  const active = buckets.filter((b) => b.length > 0);
  const mixed: ProductCard[] = [];
  const seen = new Set<string>();
  let i = 0;
  let guard = 0;
  const maxGuard = limit * active.length + active.length;
  while (mixed.length < limit && active.some((b) => b.length > 0) && guard < maxGuard) {
    const b = active[i % active.length];
    const p = b.shift();
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      mixed.push(p);
    }
    i++;
    guard++;
  }

  if (mixed.length === 0) return fetchHomeTopOffers(limit);
  return mixed.slice(0, limit);
}

export const homeShowcaseQuery = () =>
  queryOptions({
    queryKey: ["products", "home-showcase"],
    queryFn: () => fetchHomeShowcase(12),
    staleTime: 60_000,
  });

export async function fetchProduct(id: string) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

/**
 * Redimensiona/recomprime a imagem no navegador antes do upload.
 * Fotos de celular ~3–5MB caem para ~150–250KB, o que resolve o efeito de
 * "foto carregando pela metade" — na prática era uma JPEG progressiva grande
 * baixando devagar em conexões móveis. As transformações do Storage
 * (/render/image/?width=...) NÃO estão ativas neste projeto (o endpoint
 * devolve o original), então a compressão precisa acontecer no cliente.
 */
// iOS Safari/WebKit (Chrome no iPhone também usa WebKit) tem um limite
// agressivo de memória por aba (~200-300MB) e recarrega a página quando
// estoura — sintoma reportado por admins: "o site recarrega e buga".
// Decodificar várias fotos grandes em paralelo com createImageBitmap +
// OffscreenCanvas + encoding WebP é o gatilho clássico.
export const IS_IOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ se apresenta como Mac com touch
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1));

export const UPLOAD_CONCURRENCY = IS_IOS ? 1 : 4;

async function compressImageForUpload(file: File): Promise<File> {
  let bitmap: ImageBitmap | null = null;
  try {
    if (!file.type.startsWith("image/")) return file;
    if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

    // iOS: dimensão menor + qualidade um pouco menor para reduzir pico de memória
    const MAX_DIM = IS_IOS ? 1000 : 1200;
    const QUALITY = IS_IOS ? 0.75 : 0.78;

    bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) return file;

    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    // iOS Safari: OffscreenCanvas.convertToBlob('image/webp') não é confiável
    // e o encoding WebP consome muito mais memória que JPEG. No iOS forçamos
    // canvas comum + JPEG (mais rápido e sem risco de crash de memória).
    const useOffscreen = !IS_IOS && typeof OffscreenCanvas !== "undefined";
    const canvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
    if (!useOffscreen) {
      (canvas as HTMLCanvasElement).width = w;
      (canvas as HTMLCanvasElement).height = h;
    }
    const ctx = (canvas as any).getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    bitmap = null;

    const supportsWebp = !IS_IOS && (() => {
      try {
        const c = document.createElement("canvas");
        return c.toDataURL("image/webp").startsWith("data:image/webp");
      } catch { return false; }
    })();
    const mime = supportsWebp ? "image/webp" : "image/jpeg";

    const blob: Blob | null = await (canvas instanceof OffscreenCanvas
      ? canvas.convertToBlob({ type: mime, quality: QUALITY }).catch(() => null)
      : new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, mime, QUALITY)));

    // Libera a bitmap do canvas para o GC do WebKit recuperar memória rápido
    if (!useOffscreen) {
      (canvas as HTMLCanvasElement).width = 0;
      (canvas as HTMLCanvasElement).height = 0;
    }

    if (!blob || blob.size >= file.size) return file;
    const ext = mime === "image/webp" ? ".webp" : ".jpg";
    return new File([blob], file.name.replace(/\.\w+$/, "") + ext, {
      type: mime,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

export async function uploadProductImage(file: File) {
  const compressed = await compressImageForUpload(file);
  const extFromType =
    compressed.type === "image/webp" ? "webp" :
    compressed.type === "image/jpeg" ? "jpg" :
    (compressed.name.split(".").pop() ?? "jpg");
  const path = `${crypto.randomUUID()}.${extFromType}`;
  const { error } = await supabase.storage.from("product-images").upload(path, compressed, {
    cacheControl: "31536000",
    upsert: false,
    contentType: compressed.type || "image/jpeg",
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
  isCashier: boolean;
  hasAnyTeamRole: boolean;
};

/**
 * Hierarquia de cargos:
 * - admin       → Super Admin (acesso total: catálogo, expedição, pedidos/métricas, equipe)
 * - manager     → ADM (catálogo + expedição)
 * - catalog     → somente catálogo
 * - fulfillment → somente expedição
 * - cashier     → Caixa (apenas Caixa QR e impressão de comprovantes)
 */
export async function getRoleSummary(): Promise<RoleSummary> {
  const roles = await getMyRoles();
  const isSuperAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  const isCatalog = isSuperAdmin || isManager || roles.includes("catalog");
  const isFulfillment = isSuperAdmin || isManager || roles.includes("fulfillment");
  const isCashier = isSuperAdmin || isManager || roles.includes("cashier");
  return {
    isSuperAdmin,
    isManager,
    isCatalog,
    isFulfillment,
    isCashier,
    hasAnyTeamRole: isSuperAdmin || isManager || isCatalog || isFulfillment || roles.includes("cashier"),
  };
}
