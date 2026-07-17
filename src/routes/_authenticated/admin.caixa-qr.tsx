import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, QrCode, RotateCcw, Copy, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Header, Footer } from "@/components/Header";
import { createCaixaQrPayment } from "@/lib/caixa-qr.functions";
import { brl } from "@/lib/format";

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

function CaixaQrPage() {
  const create = useServerFn(createCaixaQrPayment);
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ initPoint: string; total: number; preferenceId: string } | null>(null);

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

  const remove = (id: string) => setItems((prev) => (prev.length === 1 ? prev : prev.filter((it) => it.id !== id)));

  const reset = () => {
    setItems([newItem()]);
    setNote("");
    setResult(null);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar cobrança";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.initPoint);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <section className="container mx-auto px-4 py-8 flex-1">
        <div className="mb-6">
          <h1 className="text-3xl font-black uppercase tracking-tight">Caixa QR</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Solução provisória: cadastre os itens vendidos no balcão, gere um QR code e peça para o cliente
            escanear com o celular. O pagamento acontece direto no Mercado Pago.
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
              <div className="text-3xl font-black">{brl(total)}</div>
              <button
                type="button"
                onClick={onGenerate}
                disabled={loading || total <= 0}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md shadow-deal hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <QrCode className="h-4 w-4" />
                {loading ? "Gerando..." : "Gerar QR code"}
              </button>
              <p className="text-[11px] text-muted-foreground mt-3 leading-snug">
                Ao gerar, o cliente escaneia o QR e finaliza no Mercado Pago (Pix, crédito, débito).
                A confirmação aparece direto no seu painel do Mercado Pago.
              </p>
            </aside>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            <div className="bg-white p-6 rounded-md border-4 border-black flex flex-col items-center print:border-black">
              <QRCodeSVG value={result.initPoint} size={320} level="M" includeMargin={false} />
              <div className="mt-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-black/70">Total a pagar</div>
                <div className="text-3xl font-black text-black">{brl(result.total)}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-emerald-500/10 border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 rounded-md p-4 text-sm">
                <strong className="font-black uppercase tracking-wider block mb-1">QR pronto</strong>
                Peça ao cliente para abrir a câmera do celular, escanear este QR e finalizar o pagamento.
                Confira a confirmação diretamente no painel do Mercado Pago antes de liberar a mercadoria.
              </div>

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
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-4 py-3 rounded-md shadow-deal hover:scale-[1.02] print:hidden"
              >
                <RotateCcw className="h-4 w-4" /> Nova venda
              </button>
            </div>
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
}
