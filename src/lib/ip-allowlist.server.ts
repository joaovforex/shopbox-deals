/**
 * IP allow-list helper para rotas de cron em /api/public/*.
 *
 * A lista fica em app_secrets.cron_allowed_ips como CSV. Cada item pode ser:
 *  - IPv4 exato        (ex. "203.0.113.10")
 *  - IPv4 em CIDR       (ex. "203.0.113.0/24")
 *  - IPv6 exato         (ex. "2606:4700:4700::1111")   [comparação literal]
 *
 * Regras:
 *  - Lista vazia  → fail-open: apenas loga o IP visto (para o operador popular).
 *  - Lista definida → fail-closed: qualquer IP fora dela recebe 403.
 *  - Falha ao ler o segredo → fail-open com log, para não derrubar cron.
 */

function readClientIp(request: Request): string {
  const h = request.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = h.get("x-real-ip");
  if (xri) return xri.trim();
  return "0.0.0.0";
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n >>> 0;
}

function matchIpv4Cidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base ?? "");
  if (ipInt === null || baseInt === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function ipMatches(ip: string, entry: string): boolean {
  const e = entry.trim();
  if (!e) return false;
  if (e.includes("/")) return matchIpv4Cidr(ip, e);
  return ip === e;
}

/**
 * @returns { ok: true } se a chamada é permitida, { ok: false, response } caso contrário.
 * Chame IMEDIATAMENTE após validar o cron_secret.
 */
export async function enforceCronIpAllowlist(
  request: Request,
  routeTag: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const ip = readClientIp(request);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("app_secrets" as never)
      .select("value")
      .eq("name", "cron_allowed_ips")
      .maybeSingle();
    if (error) {
      console.warn(`[cron:${routeTag}] allowlist read failed, fail-open`, { ip, error: error.message });
      return { ok: true };
    }
    const raw = (data as { value?: string } | null)?.value ?? "";
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) {
      // Modo aprendizado: loga o IP para o operador popular a lista.
      console.info(`[cron:${routeTag}] allowlist empty (learning mode) — request from ip=${ip}`);
      return { ok: true };
    }
    const allowed = list.some((entry) => ipMatches(ip, entry));
    if (!allowed) {
      console.warn(`[cron:${routeTag}] BLOCKED ip=${ip} not in allowlist`);
      return { ok: false, response: new Response("forbidden", { status: 403 }) };
    }
    return { ok: true };
  } catch (err) {
    console.warn(`[cron:${routeTag}] allowlist check crashed, fail-open`, { ip, err });
    return { ok: true };
  }
}
