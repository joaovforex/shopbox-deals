#!/usr/bin/env node
/**
 * Pós-build para Vercel: reorganiza dist/ na estrutura
 * .vercel/output/ esperada pela Build Output API v3.
 *
 * Sem isso, dist/ é tratado como site estático e as rotas
 * dinâmicas (ex.: /produto/$id) retornam 404 ao serem acessadas
 * diretamente na Vercel.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const out = path.join(root, ".vercel/output");
const fnDir = path.join(out, "functions/__server.func");

if (!fs.existsSync(dist)) {
  console.error("dist/ não encontrado. Rode `bun run build` primeiro.");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "static"), { recursive: true });
fs.mkdirSync(fnDir, { recursive: true });

// Estáticos (assets do client)
fs.cpSync(path.join(dist, "client"), path.join(out, "static"), { recursive: true });

// Bundle do servidor — copia tudo incluindo node_modules traced
fs.cpSync(path.join(dist, "server"), fnDir, { recursive: true });

// Adapter Node -> Fetch
const adapter = `import handler from "./index.mjs";

export default async function (req, res) {
  try {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const url = proto + "://" + host + req.url;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) for (const vv of v) headers.append(k, vv);
      else if (v != null) headers.set(k, String(v));
    }

    const method = (req.method || "GET").toUpperCase();
    let body;
    if (method !== "GET" && method !== "HEAD") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = Buffer.concat(chunks);
    }

    const request = new Request(url, { method, headers, body, duplex: "half" });
    const response = await handler.fetch(request, {});

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-length") return;
      res.setHeader(key, value);
    });

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (err) {
    console.error("[vercel adapter]", err);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
  }
}
`;
fs.writeFileSync(path.join(fnDir, "handler.mjs"), adapter);

// Substitui o package.json para garantir type: module
fs.writeFileSync(
  path.join(fnDir, "package.json"),
  JSON.stringify(
    { name: "server-function", type: "module", private: true, dependencies: { tslib: "2.8.1" } },
    null,
    2,
  ),
);

// Config do function
fs.writeFileSync(
  path.join(fnDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "handler.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
    },
    null,
    2,
  ),
);

// Routing: assets -> filesystem; resto -> função SSR
const config = {
  version: 3,
  routes: [
    {
      src: "/assets/(.*)",
      headers: { "cache-control": "public, max-age=31536000, immutable" },
      continue: true,
    },
    { handle: "filesystem" },
    { src: "/(.*)", dest: "/__server" },
  ],
};
fs.writeFileSync(path.join(out, "config.json"), JSON.stringify(config, null, 2));

console.log("✔ .vercel/output gerado para deploy na Vercel");
