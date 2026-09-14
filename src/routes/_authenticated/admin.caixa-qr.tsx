import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, QrCode, RotateCcw, Copy, Printer, CheckCircle2, Clock, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Header, Footer } from "@/components/Header";
import { createCaixaQrPayment, getPosChargeStatus, listRecentPosCharges } from "@/lib/caixa-qr.functions";
import { brl } from "@/lib/format";
import { printReceipt } from "@/lib/receiptPrint";

export const Route = createFileRoute("/_authenticated/admin/caixa-qr")({
  head: () => ({ meta: [{ title: "Caixa QR · shopbox" }] }),
  component: CaixaQrPage,
});

type Item = { id: string; title: string; unit_price: string; quantity: string };

function newItem(): Item {
  return {
    id: crypto.randomUUID(),
    title: "",
    unit_price: "",
    quantity: "1",
  };
}

type StatusValue = "pending" | "paid" | "denied" | "refunded" | "cancelled" | "failed" | string;

function StatusBadge({ status }: { status: StatusValue }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
    pending: {
      label: "Aguardando pagamento",
      cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
      Icon: Clock,
    },
    paid: {
      label: "Pago",
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
      Icon: CheckCircle2,
    },
    denied: {
      label: "Recusado",
      cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
      Icon: XCircle,
    },
    refunded: {
      label: "Estornado",
      cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
      Icon: XCircle,
    },
    cancelled: {
      label: "Cancelado",
      cls: "bg-muted text-muted-foreground border-border",
      Icon: XCircle,
    },
    failed: {
      label: "Falha ao gerar",
      cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
      Icon: XCircle,
    },
  };
  const cfg = map[status] ?? map.pending;
  const { Icon } = cfg;
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${cfg.cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {cfg.label}
    </span>
  );
}

function CaixaQrPage() {
  const create = useServerFn(createCaixaQrPayment);
  const getStatus = useServerFn(getPosChargeStatus);
  const listRecent = useServerFn(listRecentPosCharges);
  const qc = useQueryClient();

  const [items, setItems] = useState<Item[]>([newItem()]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    chargeId: string;
    initPoint: string;
    total: number;
    preferenceId: string;
  } | null>(null);
  const [status, setStatus] = useState<StatusValue>("pending");
  const paidToastShown = useRef(false);

  const total = useMemo(
    () =>
      items.reduce((acc, it) => {
        const price = Number(String(it.unit_price).replace(",", "."));
        const qty = Number(it.quantity);
        if (!Number.isFinite(price) || !Number.isFinite(qty)) return acc;
        return acc + price * qty;
      }, 0),
    [items],
  );

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const remove = (id: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.id !== id)));

  const reset = () => {
    setItems([newItem()]);
    setNote("");
    setResult(null);
    setStatus("pending");
    paidToastShown.current = false;
    qc.invalidateQueries({ queryKey: ["pos-charges"] });
  };

  const onGenerate = async () => {
    const cleaned = items
      .map((it) => ({
        title: it.title.trim(),
        unit_price: Number(String(it.unit_price).replace(",", ".")),
        quantity: Number(it.quantity),
      }))
      .filter((it) => it.title && it.unit_price > 0 && it.quantity > 0);
    if (cleaned.length === 0) {
      toast.error("Adicione ao menos um item com descrição, preço e quantidade.");
      return;
    }
    setLoading(true);
    try {
      const res = await create({ data: { items: cleaned, note: note.trim() || null } });
      setResult(res);
      setStatus("pending");
      paidToastShown.current = false;
      qc.invalidateQueries({ queryKey: ["pos-charges"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar cobrança";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Polling de status enquanto tiver uma cobrança em aberto
  useEffect(() => {
    if (!result) return;
    if (status === "paid" || status === "refunded" || status === "denied" || status === "cancelled") {
      qc.invalidateQueries({ queryKey: ["pos-charges"] });
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const row = (await getStatus({ data: { chargeId: result.chargeId } })) as {
          status: StatusValue;
        } | null;
        if (!alive || !row) return;
        setStatus(row.status);
        if (row.status === "paid" && !paidToastShown.current) {
          paidToastShown.current = true;
          toast.success("Pagamento confirmado!");
          qc.invalidateQueries({ queryKey: ["pos-charges"] });
        }
      } catch {
        // silencia erros transitórios de polling
      }
    };
    void tick();
    const interval = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [result, status, getStatus, qc]);

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.initPoint);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const recentQuery = useQuery({
    queryKey: ["pos-charges", "recent"],
    queryFn: () => listRecent(),
    refetchInterval: 15000,
    staleTime: 5000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <section className="container mx-auto px-4 py-8 flex-1">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold uppercase tracking-tight">Caixa QR</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Solução provisória: cadastre os itens vendidos no balcão, gere um QR code e peça para o cliente
            escanear com o celular. O pagamento acontece direto na Cielo e o status atualiza aqui.
          </p>
        </div>

        {!result ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className="grid grid-cols-12 gap-2 bg-card border border-border rounded-md p-3"
                >
                  <div className="col-span-12 sm:col-span-6">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Descrição {idx + 1}
                    </label>
                    <input
                      type="text"
                      value={it.title}
                      onChange={(e) => update(it.id, { title: e.target.value })}
                      placeholder="Ex: Produto avulso balcão"
                      maxLength={200}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Preço unit. (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={it.unit_price}
                      onChange={(e) => update(it.id, { unit_price: e.target.value.replace(/[^0-9.,]/g, "") })}
                      placeholder="0,00"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Qtd
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={it.quantity}
                      onChange={(e) => update(it.id, { quantity: e.target.value.replace(/\D/g, "") || "1" })}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => remove(it.id)}
                      disabled={items.length === 1}
                      className="inline-flex items-center justify-center h-10 w-10 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setItems((p) => [...p, newItem()])}
                className="inline-flex items-center gap-2 border border-dashed border-border rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wider hover:border-primary"
              >
                <Plus className="h-4 w-4" /> Adicionar item
              </button>

              <div className="pt-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Observação (opcional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex: Caixa 1 / Vendedor Ana"
                  maxLength={200}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <aside className="bg-card border border-border rounded-md p-4 h-fit lg:sticky lg:top-24">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="text-3xl font-bold">{brl(total)}</div>
              <button
                type="button"
                onClick={onGenerate}
                disabled={loading || total <= 0}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold uppercase tracking-wide px-4 py-3 rounded-md shadow-deal hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <QrCode className="h-4 w-4" />
                {loading ? "Gerando..." : "Gerar QR code"}
              </button>
              <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
                Ao gerar, o cliente escaneia o QR e finaliza na Cielo (Pix, crédito, débito).
                A confirmação chega automaticamente pelo webhook e aparece aqui na tela.
              </p>
            </aside>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <div className="bg-white p-6 rounded-md border-4 border-black flex flex-col items-center print:border-black">
              <QRCodeSVG value={result.initPoint} size={320} level="M" includeMargin={false} />
              <div className="mt-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-black/70">Total a pagar</div>
                <div className="text-3xl font-bold text-black">{brl(result.total)}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={status} />
                {status === "pending" && (
                  <span className="text-xs text-muted-foreground">Verificando pagamento…</span>
                )}
              </div>

              {status === "paid" ? (
                <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 rounded-md p-4 text-sm space-y-3">
                  <div>
                    <strong className="font-semibold uppercase tracking-wide block mb-1">Pagamento confirmado</strong>
                    Já pode liberar a mercadoria. O registro ficou salvo no histórico do caixa.
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const row = (await getStatus({ data: { chargeId: result.chargeId } })) as any;
                        printReceipt({
                          chargeId: result.chargeId,
                          items: Array.isArray(row?.items)
                            ? row.items
                            : items
                                .map((i) => ({
                                  title: i.title,
                                  unit_price: Number(String(i.unit_price).replace(",", ".")),
                                  quantity: Number(i.quantity),
                                }))
                                .filter((i) => i.title && i.unit_price > 0 && i.quantity > 0),
                          total: Number(row?.total ?? result.total),
                          paidAt: row?.paid_at ?? new Date().toISOString(),
                          operator: row?.operator_name ?? null,
                          paymentMethod: row?.mp_payment_method_id ?? null,
                          note: row?.note ?? note ?? null,
                        });
                      } catch {
                        printReceipt({
                          chargeId: result.chargeId,
                          items: items
                            .map((i) => ({
                              title: i.title,
                              unit_price: Number(String(i.unit_price).replace(",", ".")),
                              quantity: Number(i.quantity),
                            }))
                            .filter((i) => i.title && i.unit_price > 0 && i.quantity > 0),
                          total: result.total,
                          paidAt: new Date().toISOString(),
                          paymentMethod: null,
                          note: note || null,
                        });
                      }
                    }}
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold uppercase tracking-wide px-4 py-2.5 rounded-md shadow-deal hover:bg-emerald-700"
                  >
                    <Printer className="h-4 w-4" /> Imprimir comprovante (80mm)
                  </button>
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 rounded-md p-4 text-sm">
                  <strong className="font-semibold uppercase tracking-wide block mb-1">QR pronto</strong>
                  Peça ao cliente para abrir a câmera do celular, escanear este QR e finalizar o pagamento.
                  A confirmação chega aqui automaticamente pelo webhook da Cielo.
                </div>
              )}

              <div className="bg-card border border-border rounded-md p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Link de pagamento
                </div>
                <div className="break-all text-xs font-mono bg-muted/50 rounded p-2">{result.initPoint}</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex items-center gap-2 border border-border rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider hover:border-primary"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar link
                  </button>
                  <a
                    href={result.initPoint}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 border border-border rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider hover:border-primary"
                  >
                    Abrir pagamento
                  </a>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 border border-border rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider hover:border-primary print:hidden"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold uppercase tracking-wide px-4 py-3 rounded-md shadow-deal hover:scale-[1.02] print:hidden"
              >
                <RotateCcw className="h-4 w-4" /> Nova venda
              </button>
            </div>
          </div>
        )}

        {/* Histórico */}
        <div className="mt-10 print:hidden">
          <h2 className="text-lg font-semibold uppercase tracking-wide mb-3">Últimas cobranças do caixa</h2>
          <div className="bg-card border border-border rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Quando</th>
                    <th className="text-left px-3 py-2">Operador / Obs</th>
                    <th className="text-right px-3 py-2">Total</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentQuery.data ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted-foreground py-6 text-xs">
                        {recentQuery.isLoading ? "Carregando..." : "Nenhuma cobrança ainda."}
                      </td>
                    </tr>
                  ) : (
                    (recentQuery.data as any[]).map((c) => (
                      <tr key={c.id} className="border-t border-border">
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <div className="font-bold">{c.operator_name ?? "—"}</div>
                          {c.note && <div className="text-muted-foreground">{c.note}</div>}
                        </td>
                        <td className="px-3 py-2 text-right font-bold">{brl(Number(c.total))}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {c.status === "paid" && Array.isArray(c.items) && c.items.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                printReceipt({
                                  chargeId: c.id,
                                  items: c.items,
                                  total: Number(c.total),
                                  paidAt: c.paid_at ?? c.created_at,
                                  operator: c.operator_name ?? null,
                                  paymentMethod: c.mp_payment_method_id ?? null,
                                  note: c.note ?? null,
                                })
                              }
                              className="inline-flex items-center gap-1 border border-border rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wider hover:border-primary"
                              title="Imprimir comprovante (80mm)"
                            >
                              <Printer className="h-3 w-3" /> 2ª via
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
