/**
 * Cliente Supabase server-only com a chave publicável, usado apenas por
 * endpoints públicos de leitura (sitemap.xml e feed do Google Merchant).
 * Respeita RLS — lê somente o que a policy pública de `products` permite.
 */

export type PublicProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  brand: string | null;
  sku: string | null;
  category: string | null;
  image_url: string | null;
  images: string[] | null;
  updated_at?: string | null;
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    }),
  );
}

/** Lê todos os produtos ativos, paginando no servidor. */
export async function fetchPublicActiveProducts(opts: { inStockOnly?: boolean } = {}) {
  const supabase = await publicClient();
  const pageSize = 1000;
  const out: PublicProduct[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let q = supabase
      .from("products")
      .select("id,name,description,price,stock,brand,sku,category,image_url,images")
      .eq("active", true)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (opts.inStockOnly) q = q.gt("stock", 0);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as PublicProduct[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export function xmlEscape(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function firstImage(p: PublicProduct): string | null {
  const arr = (p.images ?? []).filter(Boolean);
  return arr[0] ?? p.image_url ?? null;
}
