import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

// Janela e limites
const WINDOW_MIN = 15;
const MAX_FAILS_PER_IP_EMAIL = 5;   // por combinação IP + e-mail (proteção conta específica)
const MAX_FAILS_PER_IP = 20;        // por IP (proteção varredura)

function clientIp(): string {
  try {
    const req = getRequest();
    const h = req.headers;
    const cf = h.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const xri = h.get("x-real-ip");
    if (xri) return xri.trim();
  } catch {
    // sem request context (não deveria acontecer em serverFn)
  }
  return "0.0.0.0";
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

/**
 * Verifica se o IP (e IP+email) está autorizado a tentar login agora.
 * Retorna { allowed, retryAfterSec, reason }.
 */
export const checkLoginRateLimit = createServerFn({ method: "POST" })
  .inputValidator((raw: { email: string }) => ({ email: emailSchema.parse(raw.email) }))
  .handler(async ({ data }) => {
    const ip = clientIp();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

    const [{ data: ipRows, error: ipErr }, { data: pairRows, error: pairErr }] = await Promise.all([
      supabaseAdmin
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("success", false)
        .gte("created_at", since),
      supabaseAdmin
        .from("login_attempts")
        .select("id, created_at", { count: "exact" })
        .eq("ip", ip)
        .eq("email", data.email)
        .eq("success", false)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(MAX_FAILS_PER_IP_EMAIL),
    ]);

    if (ipErr || pairErr) {
      // Fail-open leve: não bloqueia se o próprio limiter falhou (Supabase indisponível).
      return { allowed: true, retryAfterSec: 0, reason: "limiter_unavailable" as const };
    }

    // supabase-js: quando head:true, o total vai no header count via .count — usamos length de pairRows abaixo.
    // Para o ip-only usamos count via segundo shape:
    const ipCount = (ipRows as unknown as { length?: number } | null)?.length ??
      // fallback: refaz consulta rápida
      (await supabaseAdmin
        .from("login_attempts")
        .select("id")
        .eq("ip", ip)
        .eq("success", false)
        .gte("created_at", since)
      ).data?.length ?? 0;

    const pairCount = pairRows?.length ?? 0;

    if (pairCount >= MAX_FAILS_PER_IP_EMAIL) {
      return { allowed: false, retryAfterSec: WINDOW_MIN * 60, reason: "too_many_for_account" as const };
    }
    if (ipCount >= MAX_FAILS_PER_IP) {
      return { allowed: false, retryAfterSec: WINDOW_MIN * 60, reason: "too_many_for_ip" as const };
    }
    return { allowed: true, retryAfterSec: 0, reason: "ok" as const };
  });

/**
 * Registra o resultado de uma tentativa de login para alimentar o rate-limit.
 */
export const recordLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((raw: { email: string; success: boolean }) => ({
    email: emailSchema.parse(raw.email),
    success: Boolean(raw.success),
  }))
  .handler(async ({ data }) => {
    const ip = clientIp();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("login_attempts").insert({
      ip,
      email: data.email,
      success: data.success,
    });
    // Limpeza oportunista: apaga registros antigos (>24h) desse IP para manter tabela enxuta.
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    await supabaseAdmin.from("login_attempts").delete().eq("ip", ip).lt("created_at", cutoff);
    return { ok: true };
  });
