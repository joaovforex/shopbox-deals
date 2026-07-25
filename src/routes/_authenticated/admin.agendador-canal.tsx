import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header, Footer } from "@/components/Header";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { shareProduct } from "@/lib/share-product";
import {
  Play,
  Pause,
  Share2,
  Trash2,
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  Bell,
  BellOff,
  ChevronLeft,
  RotateCcw,
  Check,
  Radio,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/agendador-canal")({
  head: () => ({ meta: [{ title: "Agendador Canal · shopbox" }] }),
  component: AgendadorCanalPage,
});

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  category: string | null;
  image_url: string | null;
  stock: number;
};

type QueueItem = {
  id: string; // uuid interno
  product_id: string;
  added_at: number;
  sent_at: number | null;
};

const QUEUE_KEY = "agendador-canal:queue:v1";
const CONFIG_KEY = "agendador-canal:config:v1";

type Config = {
  intervalSec: number;
  soundEnabled: boolean;
  autoAdvance: boolean;
};

const DEFAULT_CONFIG: Config = {
  intervalSec: 60,
  soundEnabled: true,
  autoAdvance: true,
};

function loadQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

function saveQueue(q: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {}
}

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Config) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(c: Config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  } catch {}
}

function uid() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildShareText(p: Product) {
  const url = `${window.location.origin}/produto/${p.id}`;
  const off = discountPct(p.original_price, p.price);
  const stockLine =
    p.stock > 0
      ? `📦 ${p.stock} ${p.stock === 1 ? "peça" : "peças"} em estoque`
      : "❌ Sem estoque no momento";
  return [
    `🔥 *${p.name}*`,
    `Por ${brl(p.price)}${off > 0 ? ` (${off}% OFF!)` : ""}`,
    p.description ? "" : null,
    p.description ?? null,
    "",
    stockLine,
    "",
    "COMPRE NO LINK ABAIXO:",
    `👇 ${url}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

async function shareProduct(p: Product): Promise<boolean> {
  const text = buildShareText(p);
  const url = `${window.location.origin}/produto/${p.id}`;
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as unknown as {
          share?: (data: ShareData) => Promise<void>;
          canShare?: (data: ShareData) => boolean;
        })
      : null;
  if (nav?.share && p.image_url) {
    try {
      const res = await fetch(p.image_url);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const safe =
        p.name.replace(/[^\w]+/g, "-").toLowerCase().slice(0, 40) || "produto";
      const file = new File([blob], `${safe}.${ext}`, {
        type: blob.type || "image/jpeg",
      });
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text, title: p.name });
        return true;
      }
    } catch {}
    try {
      await nav.share({ title: p.name, text, url });
      return true;
    } catch {
      return false;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  return true;
}

function playBeep() {
  try {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch {}
}

function AgendadorCanalPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>(() => loadQueue());
  const [config, setConfig] = useState<Config>(() => loadConfig());
  const [running, setRunning] = useState(false);
  const [nextFireAt, setNextFireAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [readyProductId, setReadyProductId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Carrega produtos ativos
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,description,price,original_price,category,image_url,stock,active")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (cancelled) return;
      if (error) {
        toast.error("Erro ao carregar produtos");
        setLoading(false);
        return;
      }
      setProducts((data ?? []) as Product[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => saveQueue(queue), [queue]);
  useEffect(() => saveConfig(config), [config]);

  // Tick global
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const pending = queue.filter((q) => !q.sent_at);
  const done = queue.filter((q) => !!q.sent_at);

  // Motor: quando next fire chega, sinaliza produto pronto
  useEffect(() => {
    if (!running) return;
    if (readyProductId) return; // já esperando compartilhar
    if (pending.length === 0) {
      setRunning(false);
      setNextFireAt(null);
      toast.success("Fila concluída!");
      return;
    }
    if (nextFireAt === null) {
      // Primeiro disparo é imediato
      setReadyProductId(pending[0].product_id);
      return;
    }
    if (now >= nextFireAt) {
      setReadyProductId(pending[0].product_id);
      if (config.soundEnabled) playBeep();
      // Notificação nativa
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        const p = productById.get(pending[0].product_id);
        if (p) {
          try {
            new Notification("Hora de postar no Canal ShopBox", {
              body: `${p.name} — ${brl(p.price)}`,
              icon: p.image_url ?? undefined,
              tag: "agendador-canal",
            });
          } catch {}
        }
      }
    }
  }, [running, now, nextFireAt, readyProductId, pending, productById, config.soundEnabled]);

  const handleStart = () => {
    if (pending.length === 0) {
      toast.error("Adicione produtos à fila primeiro");
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setRunning(true);
    setNextFireAt(null); // dispara imediato
    setReadyProductId(null);
  };

  const handlePause = () => {
    setRunning(false);
    setNextFireAt(null);
  };

  const handleReset = () => {
    if (!confirm("Limpar toda a fila (incluindo enviados)?")) return;
    setQueue([]);
    setRunning(false);
    setNextFireAt(null);
    setReadyProductId(null);
  };

  const handleShareCurrent = useCallback(async () => {
    if (!readyProductId) return;
    const p = productById.get(readyProductId);
    if (!p) return;
    const ok = await shareProduct(p);
    if (!ok) {
      toast.error("Compartilhamento cancelado");
      return;
    }
    // Marca como enviado
    setQueue((prev) =>
      prev.map((q) =>
        q.product_id === readyProductId && !q.sent_at
          ? { ...q, sent_at: Date.now() }
          : q,
      ),
    );
    setReadyProductId(null);
    if (config.autoAdvance) {
      setNextFireAt(Date.now() + config.intervalSec * 1000);
    } else {
      setRunning(false);
      setNextFireAt(null);
    }
  }, [readyProductId, productById, config.autoAdvance, config.intervalSec]);

  const handleSkip = () => {
    if (!readyProductId) return;
    setQueue((prev) =>
      prev.map((q) =>
        q.product_id === readyProductId && !q.sent_at
          ? { ...q, sent_at: Date.now() }
          : q,
      ),
    );
    setReadyProductId(null);
    if (config.autoAdvance) {
      setNextFireAt(Date.now() + config.intervalSec * 1000);
    }
  };

  const addProducts = (ids: string[]) => {
    if (ids.length === 0) return;
    const existing = new Set(queue.filter((q) => !q.sent_at).map((q) => q.product_id));
    const toAdd = ids.filter((id) => !existing.has(id));
    if (toAdd.length === 0) {
      toast.info("Todos os produtos já estão na fila");
      return;
    }
    const items: QueueItem[] = toAdd.map((product_id) => ({
      id: uid(),
      product_id,
      added_at: Date.now(),
      sent_at: null,
    }));
    setQueue((prev) => [...prev, ...items]);
    toast.success(`${toAdd.length} produto${toAdd.length === 1 ? "" : "s"} adicionado${toAdd.length === 1 ? "" : "s"} à fila`);
  };

  const removeFromQueue = (queueItemId: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== queueItemId));
  };

  const moveInQueue = (queueItemId: string, dir: -1 | 1) => {
    setQueue((prev) => {
      const idx = prev.findIndex((q) => q.id === queueItemId);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const secondsToNext =
    running && nextFireAt !== null && !readyProductId
      ? Math.max(0, Math.ceil((nextFireAt - now) / 1000))
      : null;

  const readyProduct = readyProductId ? productById.get(readyProductId) : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-6 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/admin"
            className="p-2 rounded-md hover:bg-secondary"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-wider flex items-center gap-2">
              <Radio className="h-6 w-6 text-[#25D366]" /> Agendador · Canal ShopBox
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Fila manual · 1 produto por vez · dispara a cada {config.intervalSec}s
            </p>
          </div>
        </div>

        {/* Painel de controle */}
        <div className="bg-card border border-border rounded-lg p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={handleStart}
                disabled={pending.length === 0}
                className="inline-flex items-center gap-2 bg-[#25D366] text-white font-black uppercase tracking-wider px-5 py-3 rounded-md text-sm disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Iniciar
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="inline-flex items-center gap-2 bg-amber-500 text-white font-black uppercase tracking-wider px-5 py-3 rounded-md text-sm"
              >
                <Pause className="h-4 w-4" /> Pausar
              </button>
            )}
            <button
              onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md text-sm"
            >
              <Plus className="h-4 w-4" /> Adicionar produtos
            </button>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 bg-card border border-border font-bold uppercase tracking-wider px-3 py-2.5 rounded-md text-xs hover:bg-secondary"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Limpar tudo
            </button>

            <div className="ml-auto flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Intervalo</span>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  step={5}
                  value={config.intervalSec}
                  onChange={(e) =>
                    setConfig({ ...config, intervalSec: Math.max(10, Number(e.target.value) || 60) })
                  }
                  className="w-16 bg-background border border-border rounded px-2 py-1 text-sm font-bold"
                />
                <span className="text-muted-foreground">s</span>
              </label>
              <button
                onClick={() => setConfig({ ...config, soundEnabled: !config.soundEnabled })}
                className={`p-2 rounded border ${config.soundEnabled ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                aria-label="Som"
                title={config.soundEnabled ? "Som ativado" : "Som desativado"}
              >
                {config.soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Na fila: </span>
              <span className="font-black">{pending.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Enviados: </span>
              <span className="font-black text-primary">{done.length}</span>
            </div>
            {secondsToNext !== null && (
              <div className="ml-auto font-mono font-black text-lg">
                Próximo em {String(Math.floor(secondsToNext / 60)).padStart(2, "0")}:
                {String(secondsToNext % 60).padStart(2, "0")}
              </div>
            )}
          </div>
        </div>

        {/* Card do produto pronto para enviar */}
        {readyProduct && (
          <div className="bg-gradient-to-br from-[#25D366]/20 to-[#128C7E]/10 border-2 border-[#25D366] rounded-lg p-4 mb-4 animate-pulse-slow">
            <div className="text-[10px] uppercase tracking-widest text-[#25D366] font-black mb-2">
              🔴 Hora de postar no Canal ShopBox
            </div>
            <div className="flex gap-4 items-center">
              {readyProduct.image_url && (
                <img
                  src={readyProduct.image_url}
                  alt=""
                  className="h-24 w-24 md:h-32 md:w-32 object-cover rounded"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-black text-lg md:text-xl truncate">{readyProduct.name}</div>
                <div className="text-price font-black text-2xl">{brl(readyProduct.price)}</div>
                {readyProduct.category && (
                  <div className="text-xs text-muted-foreground">{readyProduct.category}</div>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <button
                onClick={handleShareCurrent}
                autoFocus
                className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white font-black uppercase tracking-wider px-6 py-4 rounded-md text-base hover:opacity-90"
              >
                <Share2 className="h-5 w-5" /> Compartilhar no Canal
              </button>
              <button
                onClick={handleSkip}
                className="inline-flex items-center justify-center gap-2 bg-card border border-border font-bold uppercase tracking-wider px-4 py-3 rounded-md text-xs hover:bg-secondary"
              >
                Pular
              </button>
            </div>
          </div>
        )}

        {/* Lista da fila */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-secondary/40">
            <h2 className="font-black uppercase tracking-wider text-sm">Fila</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : queue.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground text-sm mb-3">Fila vazia.</p>
              <button
                onClick={() => setShowPicker(true)}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-2.5 rounded-md text-xs"
              >
                <Plus className="h-4 w-4" /> Adicionar produtos
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {queue.map((q, i) => {
                const p = productById.get(q.product_id);
                const isReady = readyProductId === q.product_id;
                return (
                  <li
                    key={q.id}
                    className={`flex items-center gap-3 p-3 ${q.sent_at ? "opacity-50" : ""} ${isReady ? "bg-[#25D366]/10" : ""}`}
                  >
                    <div className="w-6 text-center font-mono text-xs text-muted-foreground">
                      {q.sent_at ? <Check className="h-4 w-4 text-primary mx-auto" /> : i + 1 - done.filter((_d, di) => di < i).length}
                    </div>
                    {p?.image_url ? (
                      <img src={p.image_url} alt="" className="h-12 w-12 object-cover rounded" />
                    ) : (
                      <div className="h-12 w-12 bg-secondary rounded" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold truncate ${q.sent_at ? "line-through" : ""}`}>
                        {p?.name ?? "Produto removido"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p ? brl(p.price) : ""}
                        {q.sent_at && (
                          <span className="ml-2">
                            · enviado {new Date(q.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>
                    {!q.sent_at && (
                      <>
                        <button
                          onClick={() => moveInQueue(q.id, -1)}
                          className="p-1.5 hover:bg-secondary rounded"
                          aria-label="Subir"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => moveInQueue(q.id, 1)}
                          className="p-1.5 hover:bg-secondary rounded"
                          aria-label="Descer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeFromQueue(q.id)}
                          className="p-1.5 hover:bg-destructive/10 text-destructive rounded"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      {showPicker && (
        <ProductPickerDialog
          products={products}
          alreadyQueued={new Set(queue.filter((q) => !q.sent_at).map((q) => q.product_id))}
          onClose={() => setShowPicker(false)}
          onAdd={(ids) => {
            addProducts(ids);
            setShowPicker(false);
          }}
        />
      )}

      <Footer />
    </div>
  );
}

function ProductPickerDialog({
  products,
  alreadyQueued,
  onClose,
  onAdd,
}: {
  products: Product[];
  alreadyQueued: Set<string>;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of products) if (p.category) s.add(p.category);
    return Array.from(s).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (term && !p.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [products, q, cat]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const available = filtered.filter((p) => !alreadyQueued.has(p.id)).map((p) => p.id);
    const allSelected = available.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of available) next.delete(id);
      } else {
        for (const id of available) next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-2xl rounded-lg border border-border shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-black uppercase tracking-wider text-sm">
            Adicionar produtos à fila
          </h2>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded hover:bg-secondary">
            Fechar
          </button>
        </div>
        <div className="p-3 border-b border-border flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-md text-sm"
            />
          </div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="bg-background border border-border rounded-md text-sm px-3 py-2"
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={toggleAll}
            className="text-xs font-bold uppercase tracking-wider px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80"
          >
            Selecionar todos
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum produto encontrado.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtered.map((p) => {
                const isQueued = alreadyQueued.has(p.id);
                const isSelected = selected.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => !isQueued && toggle(p.id)}
                      disabled={isQueued}
                      className={`w-full flex items-center gap-2 p-2 rounded border text-left ${
                        isQueued
                          ? "opacity-50 border-border cursor-not-allowed"
                          : isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                      }`}
                    >
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-10 w-10 object-cover rounded" />
                      ) : (
                        <div className="h-10 w-10 bg-secondary rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {brl(p.price)} {isQueued && "· na fila"}
                        </div>
                      </div>
                      {isSelected && !isQueued && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-3 border-t border-border flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-2 rounded-md text-xs disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Adicionar {selected.size > 0 ? selected.size : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
