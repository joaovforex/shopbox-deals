import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "shopbox_session_v1";
const RECORDED_KEY = "shopbox_visit_recorded_v1";

function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "");
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function OnlineCounter() {
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState<number | null>(null);
  const [daily, setDaily] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const sessionId = getSessionId();

    // Registra a visita do dia (uma vez por sessão por dia)
    const recordedToday = (() => {
      try { return sessionStorage.getItem(RECORDED_KEY) === todayKey(); } catch { return false; }
    })();

    const recordVisit = async () => {
      try {
        const { data, error } = await supabase.rpc("record_visit" as never, { p_session_id: sessionId } as never);
        if (!error && typeof data === "number") {
          setDaily(data);
          try { sessionStorage.setItem(RECORDED_KEY, todayKey()); } catch {}
        }
      } catch {}
    };

    if (!recordedToday) {
      recordVisit();
    } else {
      // Apenas busca o total atual sem registrar duplicado (chama RPC mesmo, idempotente)
      recordVisit();
    }

    // Presence: contar quantas abas estão conectadas agora
    const channel = supabase.channel("site-online", {
      config: { presence: { key: sessionId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        // Conta sessões únicas (uma chave por sessionId)
        setOnline(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Evita hydration mismatch — só renderiza no cliente
  if (!mounted) return null;

  const dailyStr = daily ?? "—";
  const onlineStr = online ?? 1;

  return (
    <span
      className="inline-flex items-center gap-2 text-[11px] font-mono text-muted-foreground"
      title={`${onlineStr} pessoa(s) online agora · ${dailyStr} visita(s) hoje`}
      aria-label={`${onlineStr} online agora, ${dailyStr} visitas hoje`}
    >
      <span className="opacity-70">{dailyStr}</span>
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-75 animate-ping" />
        <span className="relative inline-block h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-bold text-emerald-500">{onlineStr}</span>
    </span>
  );
}
