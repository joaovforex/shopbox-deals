/**
 * Imagens de produto.
 *
 * As fotos JÁ são comprimidas no cliente ao subir (ver compressImageForUpload
 * em products.ts: máx. ~1200px, WebP/JPEG q~0.78). Por isso NÃO usamos o
 * endpoint de transformação do Storage (/storage/v1/render/image/...):
 * ele é redundante e é cobrado por cota ("Storage Image Transformations"),
 * que a loja estoura por ter milhares de produtos. Servimos a imagem original
 * (já leve) direto do Storage — custo zero e sem risco de quebrar por cota.
 *
 * Estas funções mantêm a mesma assinatura para não mexer nos componentes;
 * apenas devolvem a URL do objeto original (convertendo de volta qualquer URL
 * antiga que já esteja apontando para /render/image).
 */
export function optimizedImage(
  url: string | null | undefined,
  _opts: { width?: number; quality?: number } = {},
): string {
  if (!url) return "";
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (u.pathname.includes("/storage/v1/render/image/")) {
      // Converte URL de transformação de volta para o objeto original.
      u.pathname = u.pathname.replace("/storage/v1/render/image/", "/storage/v1/object/");
      u.searchParams.delete("width");
      u.searchParams.delete("quality");
      u.searchParams.delete("resize");
      u.searchParams.delete("format");
      return u.toString();
    }
    // Já é /object/ (ou não é do Storage): devolve intacta.
    return url;
  } catch {
    return url;
  }
}

/**
 * Sem srcSet: como servimos a imagem original única (já comprimida), não há
 * variações de largura para oferecer. Devolver undefined faz o <img> usar o src.
 */
export function optimizedSrcSet(
  _url: string | null | undefined,
  _width: number,
  _quality = 70,
): string | undefined {
  return undefined;
}
