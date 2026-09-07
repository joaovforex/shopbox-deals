import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://shopboxonline.com";

const STATIC_PATHS: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/loja", changefreq: "daily", priority: "0.9" },
  { path: "/faq", changefreq: "monthly", priority: "0.4" },
  { path: "/trocas-e-garantia", changefreq: "monthly", priority: "0.4" },
  { path: "/termos", changefreq: "yearly", priority: "0.2" },
  { path: "/politica-privacidade", changefreq: "yearly", priority: "0.2" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { fetchPublicActiveProducts, xmlEscape } = await import("@/lib/public-catalog.server");

        const urls: string[] = STATIC_PATHS.map(
          (e) =>
            `  <url>\n    <loc>${BASE_URL}${e.path}</loc>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
        );

        try {
          const products = await fetchPublicActiveProducts();
          const categories = Array.from(
            new Set(products.map((p) => (p.category ?? "").trim()).filter(Boolean)),
          );
          for (const cat of categories) {
            urls.push(
              `  <url>\n    <loc>${BASE_URL}/loja?cat=${xmlEscape(encodeURIComponent(cat))}</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`,
            );
          }
          for (const p of products) {
            urls.push(
              `  <url>\n    <loc>${BASE_URL}/produto/${p.id}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
            );
          }
        } catch {
          // Se o catálogo falhar, ainda devolvemos as páginas estáticas.
        }

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
