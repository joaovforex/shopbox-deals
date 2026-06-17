import { useState } from "react";
import { Undo2, X } from "lucide-react";
import { brl } from "@/lib/format";

export type RefundModalOrder = {
  id: string;
  customer_name: string;
  total: number;
};

type RefundModalProps = {
  order: RefundModalOrder;
  busy: boolean;
  onClose: () => void;
  onConfirm: (amount: number, reason: string, confirmText: string) => void | Promise<void>;
};

export function RefundModal({ order, busy, onClose, onConfirm }: RefundModalProps) {
  const total = Number(order.total);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<"full" | "partial">("full");
  const [amountStr, setAmountStr] = useState(total.toFixed(2));
  const [reason, setReason] = useState("");
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const amount = kind === "full" ? total : Number(amountStr.replace(",", "."));
  const amountValid = isFinite(amount) && amount > 0 && amount <= total + 0.001;
  const reasonValid = reason.trim().length >= 5;
  const finalValid = ack1 && ack2 && confirmText === "REEMBOLSAR" && reasonValid;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="display text-lg text-amber-700 dark:text-amber-400">Reembolsar pedido</h3>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              #{order.id.slice(0, 8).toUpperCase()} · {order.customer_name}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 hover:bg-secondary rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {step === 1 && (
            <>
              <div className="text-sm">
                <div className="text-muted-foreground">Total do pedido</div>
                <div className="display text-2xl text-price">{brl(total)}</div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider">Tipo de reembolso</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setKind("full"); setAmountStr(total.toFixed(2)); }}
                    className={`p-3 rounded border text-sm font-bold ${kind === "full" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                  >
                    Total
                  </button>
                  <button
                    onClick={() => setKind("partial")}
                    className={`p-3 rounded border text-sm font-bold ${kind === "partial" ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                  >
                    Parcial
                  </button>
                </div>
              </div>
              {kind === "partial" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider">Valor a estornar (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={total}
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                  />
                  {!amountValid && <p className="text-xs text-destructive">Valor inválido (máx. {brl(total)})</p>}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="text-xs font-bold uppercase px-4 py-2 rounded border border-border">Cancelar</button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!amountValid}
                  className="text-xs font-bold uppercase px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
                >
                  Avançar
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider">Motivo do reembolso *</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ex.: produto indisponível, solicitação do cliente, defeito..."
                  className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Mín. 5 caracteres · {reason.length}/500</p>
              </div>
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-2">
                <p className="font-bold text-amber-700 dark:text-amber-400">⚠️ Atenção</p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={ack1} onChange={(e) => setAck1(e.target.checked)} className="mt-0.5" />
                  <span>O estorno será enviado ao Mercado Pago e <b>não pode ser desfeito</b>. O cliente receberá o valor no método original (cartão em até 2 faturas; PIX em minutos).</span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} className="mt-0.5" />
                  <span>O <b>estoque NÃO será devolvido automaticamente</b>. Eu farei o ajuste manualmente se necessário.</span>
                </label>
              </div>
              <div className="flex justify-between gap-2 pt-2">
                <button onClick={() => setStep(1)} className="text-xs font-bold uppercase px-4 py-2 rounded border border-border">Voltar</button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!reasonValid || !ack1 || !ack2}
                  className="text-xs font-bold uppercase px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
                >
                  Avançar
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="rounded-md border border-border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Pedido</span><span className="font-mono">#{order.id.slice(0, 8).toUpperCase()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span>{order.customer_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span className="font-bold uppercase">{kind === "full" ? "Total" : "Parcial"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor a estornar</span><span className="display text-amber-700 dark:text-amber-400">{brl(amount)}</span></div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Motivo do reembolso (revise antes de enviar) *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded border border-amber-500/40 bg-background text-sm"
                />
                <p className="text-[11px] text-muted-foreground">Mín. 5 caracteres · {reason.length}/500</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Digite <span className="font-mono">REEMBOLSAR</span> para confirmar:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="REEMBOLSAR"
                  className="w-full px-3 py-2 rounded border border-amber-500/40 bg-background font-mono text-sm"
                />
              </div>
              <div className="flex justify-between gap-2 pt-2">
                <button onClick={() => setStep(2)} disabled={busy} className="text-xs font-bold uppercase px-4 py-2 rounded border border-border">Voltar</button>
                <button
                  onClick={() => onConfirm(amount, reason.trim(), confirmText)}
                  disabled={busy || !finalValid}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase px-4 py-2 rounded bg-amber-600 text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Undo2 className="h-4 w-4" />
                  {busy ? "Processando..." : "Confirmar reembolso"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
