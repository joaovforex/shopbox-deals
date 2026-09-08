import { createFileRoute } from "@tanstack/react-router";

const BASE_URL = "https://shopboxonline.com";

/**
 * Feed XML (RSS 2.0 + namespace g:) para o Google Merchant Center.
 * Somente produtos ativos com estoque, com título, descrição, imagem e preço
 * reais. Marca só é enviada quando existe no cadastro — GTIN/MPN não são
 * inventados (o Merchant aceita `identifier_exists: no` nesse caso).
 */
export const Route = createFileRoute("/api/public/feed/google.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { fetchPublicActiveProducts, xmlEscape, firstImage } = await import(
          "@/lib/public-catalog.server"
        );

        let items: string[] = [];
        try {
          const products = await fetchPublicActiveProducts({ inStockOnly: true });
          items = products
            .filter((p) => {
              const img = firstImage(p);
              return !!p.name && !!img && Number(p.price) > 0;
            })
            .map((p) => {
              const img = firstImage(p)!;
              const link = `${BASE_URL}/produto/${p.id}`;
              const description = (p.description ?? p.name).slice(0, 4900);
              const lines = [
                `    <item>`,
                `      <g:id>${xmlEscape(p.sku || p.id)}</g:id>`,
                `      <g:title>${xmlEscape(p.name.slice(0, 150))}</g:title>`,
                `      <g:description>${xmlEscape(description)}</g:description>`,
                `      <g:link>${xmlEscape(link)}</g:link>`,
                `      <g:image_link>${xmlEscape(img)}</g:image_link>`,
                `      <g:availability>in_stock</g:availability>`,
                `      <g:condition>new</g:condition>`,
                `      <g:price>${Number(p.price).toFixed(2)} BRL</g:price>`,
                p.brand ? `      <g:brand>${xmlEscape(p.brand)}</g:brand>` : null,
                p.brand ? null : `      <g:identifier_exists>no</g:identifier_exists>`,
                p.category ? `      <g:product_type>${xmlEscape(p.category)}</g:product_type>` : null,
                `    </item>`,
              ].filter(Boolean);
              return lines.join("\n");
            });
        } catch {
          items = [];
        }

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
          `  <channel>`,
          `    <title>shopbox</title>`,
          `    <link>${BASE_URL}</link>`,
          `    <description>Catálogo shopbox — produtos ativos com estoque</description>`,
          ...items,
          `  </channel>`,
          `</rss>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=1800",
          },
        });
      },
    },
  },
});
