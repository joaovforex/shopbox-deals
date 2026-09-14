import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Fora da Lovable: na Vercel usa o preset "vercel" do Nitro (gera .vercel/output);
  // em outros hosts Node usa "node-server" (gera .output/ com servidor Node).
  nitro: process.env.VERCEL ? { preset: "vercel" } : { preset: process.env.NITRO_PRESET || "node-server" },
  plugins: [],
});
