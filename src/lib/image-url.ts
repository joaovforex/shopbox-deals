/**
 * Otimização de imagens hospedadas no Lovable Cloud Storage.
 *
 * Converte URLs `/storage/v1/object/sign/...` (ou `/object/public/...`) em
 * `/storage/v1/render/image/...` adicionando largura/qualidade/format=webp
 * para que o navegador baixe um arquivo MUITO menor (geralmente 70-90% menos).
 *
 * URLs que não são do Storage retornam intactas.
 */
export function optimizedImage(
  url: string | null | undefined,
  opts: { width?: number; quality?: number } = {},
): string {
  if (!url) return "";
  const width = opts.width ?? 600;
  const quality = opts.quality ?? 70;

  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    // Apenas Supabase Storage suporta o render endpoint.
    if (!u.pathname.includes("/storage/v1/")) return url;
    if (u.pathname.includes("/storage/v1/render/image/")) {
      // Já é um render URL — só ajusta os params se faltarem
      if (!u.searchParams.has("width")) u.searchParams.set("width", String(width));
      if (!u.searchParams.has("quality")) u.searchParams.set("quality", String(quality));
      return u.toString();
    }
    u.pathname = u.pathname.replace("/storage/v1/object/", "/storage/v1/render/image/");
    u.searchParams.set("width", String(width));
    u.searchParams.set("quality", String(quality));
    u.searchParams.set("resize", "contain");
    return u.toString();
  } catch {
    return url;
  }
}

/** Gera um srcSet responsivo (1x/2x) para o mesmo recurso do Storage. */
export function optimizedSrcSet(
  url: string | null | undefined,
  width: number,
  quality = 70,
): string | undefined {
  if (!url) return undefined;
  const a = optimizedImage(url, { width, quality });
  const b = optimizedImage(url, { width: width * 2, quality });
  if (a === url) return undefined; // não é storage; não emite srcset
  return `${a} 1x, ${b} 2x`;
}
