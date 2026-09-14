// Normaliza nomes de variaveis de ambiente do Supabase.
// A integracao oficial Supabase x Vercel injeta SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_*; o app usa SUPABASE_PUBLISHABLE_KEY.
// Roda no servidor, antes de qualquer leitura de process.env.
const env = process.env;
env.SUPABASE_URL ||= env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || "";
env.SUPABASE_PUBLISHABLE_KEY ||=
  env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
if (!env.SUPABASE_PROJECT_ID && env.SUPABASE_URL) {
  try { env.SUPABASE_PROJECT_ID = new URL(env.SUPABASE_URL).hostname.split(".")[0]; } catch { /* ignore */ }
}
export {};
