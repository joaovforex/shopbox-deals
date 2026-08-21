/**
 * Auditoria automática do painel admin.
 *
 * Intercepta o cliente Supabase do navegador e registra em `admin_audit_log`
 * TODA operação de escrita (insert/update/upsert/delete), TODA chamada de RPC
 * relevante, eventos de autenticação e navegação entre telas do admin.
 *
 * Falha silenciosa: nunca deve quebrar a operação principal.
 */
import { supabase } from "@/integrations/supabase/client";

type Entry = {
  action: string;
  entity: string;
  entity_id?: string | null;
  details?: Record<string, unknown>;
};

let installed = false;
let enabled = false;
let userId: string | null = null;
let userName: string | null = null;

const queue: Entry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

/** RPCs de leitura de alta frequência — não geram ruído no log. */
const RPC_DENYLIST = new Set([
  "cashback_balance",
  "cashback_next_expiry",
  "record_visit",
  "resolve_short_link",
  "list_products_paged",
  "search_products_quick",
  "list_used_categories",
  "admin_orders_page",
  "admin_order_metrics",
  "admin_catalog_value",
  "admin_cashback_outstanding",
  "admin_can_manage_products",
  "admin_can_view_reports",
  "has_role",
  "has_role_name",
  "get_latest_price_snapshot",
]);

/** Tabelas cujas escritas não devem ser auditadas (evita recursão/ruído). */
const TABLE_DENYLIST = new Set(["admin_audit_log", "site_visits", "cart_reservations"]);

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 3) return "…";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (/password|token|secret|csc_/i.test(k)) {
        out[k] = "***";
        continue;
      }
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  return value;
}

async function flush() {
  timer = null;
  if (!enabled || !userId || queue.length === 0) return;
  const batch = queue.splice(0, queue.length).slice(-50);
  try {
    await supabase.from("admin_audit_log").insert(
      batch.map((e) => ({
        user_id: userId,
        user_name: userName,
        action: e.action,
        entity: e.entity,
        entity_id: e.entity_id ?? null,
        details: (e.details ?? {}) as never,
      })) as never,
    );
  } catch {
    // ignora
  }
}

function push(entry: Entry) {
  if (!enabled) return;
  queue.push(entry);
  if (queue.length >= 20) {
    void flush();
    return;
  }
  if (!timer) timer = setTimeout(() => void flush(), 1500);
}

/** Registro manual (mantido para chamadas explícitas em telas específicas). */
export function auditManual(entry: Entry) {
  push(entry);
}

function firstId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (row && typeof row === "object" && "id" in (row as Record<string, unknown>)) {
    const id = (row as Record<string, unknown>).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

type WrapResult = { data?: unknown; error?: unknown; before?: unknown };

function wrapThenable(
  builder: unknown,
  onResult: (res: WrapResult) => void,
  beforeExec?: () => Promise<unknown>,
) {
  const b = builder as { then?: (...a: unknown[]) => unknown };
  if (!b || typeof b.then !== "function") return builder;
  const origThen = b.then.bind(b);
  b.then = ((onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
    let beforePromise: Promise<unknown> | undefined;
    try {
      beforePromise = beforeExec?.();
    } catch {
      /* ignora */
    }
    return origThen(
      (res: unknown) => {
        try {
          const base = (res ?? {}) as WrapResult;
          if (beforePromise) {
            void beforePromise
              .then((before) => onResult({ ...base, before }))
              .catch(() => onResult(base));
          } else {
            onResult(base);
          }
        } catch {
          /* ignora */
        }
        return onFulfilled ? onFulfilled(res) : res;
      },
      onRejected,
    );
  }) as never;
  return builder;
}

/** Tabelas em que vale capturar o estado anterior antes de um update. */
const TRACK_BEFORE = new Set([
  "products",
  "orders",
  "profiles",
  "unidades",
  "site_settings",
  "short_links",
  "user_roles",
  "fiscal_config",
  "product_reviews",
]);

const IGNORED_QS = new Set(["select", "columns", "on_conflict", "order", "limit", "offset"]);

function installInterceptors() {
  const client = supabase as unknown as {
    from: (t: string) => unknown;
    rpc: (fn: string, args?: unknown, opts?: unknown) => unknown;
  };

  const origFrom = client.from.bind(client);

  const fetchBefore = (table: string, builder: unknown, keys: string[]) => {
    const url = (builder as { url?: URL }).url;
    if (!url || keys.length === 0) return Promise.resolve(null);
    try {
      const q = (origFrom(table) as { select: (c: string) => unknown }).select(
        ["id", ...keys].join(","),
      ) as { url: URL };
      for (const [k, v] of url.searchParams.entries()) {
        if (IGNORED_QS.has(k)) continue;
        q.url.searchParams.append(k, v);
      }
      q.url.searchParams.set("limit", "3");
      return Promise.resolve(q as unknown as Promise<{ data?: unknown }>)
        .then((r) => r?.data ?? null)
        .catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  };

  client.from = (table: string) => {
    const builder = origFrom(table) as Record<string, unknown>;
    if (TABLE_DENYLIST.has(table)) return builder;
    for (const op of ["insert", "update", "upsert", "delete"] as const) {
      const orig = builder[op] as ((...a: unknown[]) => unknown) | undefined;
      if (typeof orig !== "function") continue;
      builder[op] = (...args: unknown[]) => {
        const result = orig.apply(builder, args);
        const raw = args[0];
        const payload = op === "delete" ? undefined : (sanitize(raw) as Record<string, unknown>);
        const keys =
          op === "update" && raw && typeof raw === "object" && !Array.isArray(raw)
            ? Object.keys(raw as Record<string, unknown>).filter(
                (k) => k !== "updated_at" && k !== "search_norm",
              )
            : [];
        const wantsBefore = op === "update" && TRACK_BEFORE.has(table) && keys.length > 0;
        return wrapThenable(
          result,
          (res) => {
            const beforeRows = Array.isArray(res.before) ? (res.before as Record<string, unknown>[]) : null;
            const antes =
              beforeRows && beforeRows.length === 1
                ? (sanitize(beforeRows[0]) as Record<string, unknown>)
                : beforeRows && beforeRows.length > 1
                  ? { registros: beforeRows.length }
                  : undefined;
            push({
              action: `db.${op}.${table}`,
              entity: table,
              entity_id:
                firstId(res.data) ??
                (beforeRows && beforeRows.length === 1
                  ? ((beforeRows[0]?.["id"] as string | undefined) ?? null)
                  : null),
              details: {
                ok: !res.error,
                ...(antes ? { antes } : {}),
                ...(payload !== undefined
                  ? op === "update"
                    ? { depois: payload }
                    : { payload }
                  : {}),
                ...(res.error ? { erro: sanitize(res.error) } : {}),
              },
            });
          },
          wantsBefore ? () => fetchBefore(table, result, keys) : undefined,
        );
      };
    }
    return builder;
  };


  const origRpc = client.rpc.bind(client);
  client.rpc = (fn: string, args?: unknown, opts?: unknown) => {
    const result = origRpc(fn, args, opts);
    if (RPC_DENYLIST.has(fn)) return result;
    return wrapThenable(result, (res) => {
      push({
        action: `rpc.${fn}`,
        entity: "rpc",
        entity_id: fn,
        details: {
          ok: !res.error,
          args: sanitize(args ?? {}),
          ...(res.error ? { erro: sanitize(res.error) } : {}),
        },
      });
    });
  };

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      if (event === "SIGNED_OUT") {
        push({ action: "auth.sign_out", entity: "auth", entity_id: userId });
        void flush();
        enabled = false;
        return;
      }
      userId = session?.user.id ?? userId;
      push({ action: `auth.${event.toLowerCase()}`, entity: "auth", entity_id: userId });
    }
  });

  if (typeof window !== "undefined") {
    const onLeave = () => void flush();
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onLeave();
    });
  }
}

/**
 * Ativa a auditoria automática para um membro da equipe.
 * Idempotente — pode ser chamada em toda montagem do painel.
 */
export function startAutoAudit(user: { id: string; name?: string | null }) {
  userId = user.id;
  userName = user.name ?? userName;
  enabled = true;
  if (installed) return;
  installed = true;
  installInterceptors();
}

/** Registra a visita a uma tela do admin. */
export function auditPageView(path: string) {
  push({ action: "ui.abrir_tela", entity: "tela", entity_id: path });
}
