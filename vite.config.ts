import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Build (Vite) le VITE_*; aceita tambem os nomes injetados pela integracao Supabase x Vercel.
const _e = process.env;
_e.VITE_SUPABASE_URL ||= _e.SUPABASE_URL || _e.NEXT_PUBLIC_SUPABASE_URL || "";
_e.VITE_SUPABASE_PUBLISHABLE_KEY ||=
  _e.SUPABASE_PUBLISHABLE_KEY || _e.SUPABASE_ANON_KEY || _e.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
if (!_e.VITE_SUPABASE_PROJECT_ID && _e.VITE_SUPABASE_URL) {
  try { _e.VITE_SUPABASE_PROJECT_ID = new URL(_e.VITE_SUPABASE_URL).hostname.split(".")[0]; } catch { /* ignore */ }
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Fora da Lovable: na Vercel usa o preset "vercel" do Nitro (gera .vercel/output);
  // em outros hosts Node usa "node-server" (gera .output/ com servidor Node).
  nitro: process.env.VERCEL ? { preset: "vercel" } : { preset: process.env.NITRO_PRESET || "node-server" },
  plugins: [],
});
