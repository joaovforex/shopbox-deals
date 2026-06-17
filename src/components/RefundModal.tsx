import { useState } from "react";
import { Undo2, X, AlertTriangle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

export type RefundConfirmPayload = {
  amount: number;
  reason: string;
  confirmText: string;
  customerConfirm: string;
  customerVerify: string;
  expectedCustomerName: string;
  expectedTotal: number;
  expectedMpPaymentId: string | null;
};

type RefundModalProps = {
  orderId: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: RefundConfirmPayload) => void | Promise<void>;
};

type FreshOrder = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_cpf: string | null;
  customer_email: string | null;
  total: number;
  mp_payment_id: string | null;
  status: string;
  refund_status: string | null;
  items: { product_name: string; quantity: number; unit_price: number; variant_color: string | null }[];
};

function digitsOnly(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

export function RefundModal({ orderId, busy, onClose, onConfirm }: RefundModalProps) {
  // Re-busca o pedido FRESCO do DB para garantir que o operador veja exatamente
  // o que será estornado, sem depender de snapshot stale da lista renderizada.
  const { data: order, isLoading, error } = useQuery<FreshOrder>({
    queryKey: ["refund-fresh-order", orderId],
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: ord, error: e1 } = await supabase
        .from("orders")
        .select("id,customer_name,customer_phone,customer_cpf,customer_email,total,mp_payment_id,status,refund_status")
        .eq("id", orderId)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!ord) throw new Error("Pedido não encontrado");
      const { data: items, error: e2 } = await supabase
        .from("order_items")
        .select("product_name,quantity,unit_price,variant_color")
        .eq("order_id", orderId);
      if (e2) throw new Error(e2.message);
      return { ...(ord as any), total: Number(ord.total), items: (items ?? []) as any };
    },
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<"full" | "partial">("full");
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [ack3, setAck3] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [customerConfirm, setCustomerConfirm] = useState("");
  const [customerVerify, setCustomerVerify] = useState("");

  const total = Number(order?.total ?? 0);
  const amount =
    kind === "full"
      ? total
      : Number((amountStr || "0").replace(",", "."));
  const amountValid = !!order && isFinite(amount) && amount > 0 && amount <= total + 0.001;
  const reasonValid = reason.trim().length >= 5;

  const realName = (order?.customer_name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const typed = customerConfirm.trim().toLowerCase().replace(/\s+/g, " ");
  const customerOk =
    !!order &&
    typed.length >= 2 &&
    (realName === typed || realName.startsWith(typed) || realName.split(" ")[0] === typed.split(" ")[0]);

  const phoneDigits = digitsOnly(order?.customer_phone);
  const cpfDigits = digitsOnly(order?.customer_cpf);
  const verifyDigits = digitsOnly(customerVerify);
  const verifyOk =
    !!order &&
    verifyDigits.length === 4 &&
    ((phoneDigits.length >= 4 && phoneDigits.slice(-4) === verifyDigits) ||
      (cpfDigits.length >= 4 && cpfDigits.slice(-4) === verifyDigits));

  const finalValid =
    !!order &&
    ack1 &&
    ack2 &&
    ack3 &&
    confirmText === "REEMBOLSAR" &&
    reasonValid &&
    customerOk &&
    verifyOk;

  function handleConfirm() {
    if (!order) return;
    onConfirm({
      amount,
      reason: reason.trim(),
      confirmText,
      customerConfirm: customerConfirm.trim(),
      customerVerify: verifyDigits,
      expectedCustomerName: order.customer_name,
      expectedTotal: total,
      expectedMpPaymentId: order.mp_payment_id,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="display text-lg text-amber-700 dark:text-amber-400">Reembolsar pedido</h3>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              #{orderId.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1 hover:bg-secondary rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading && (
          <div className="p-8 flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Buscando dados atualizados do pedido...
          </div>
        )}

        {error && (
          <div className="p-5">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex gap-2 items-start">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold">Não foi possível carregar o pedido</p>
                <p className="text-xs mt-1">{(error as Error).message}</p>
              </div>
            </div>
            <div className="flex justify-end pt-3">
              <button onClick={onClose} className="text-xs font-bold uppercase px-4 py-2 rounded border border-border">
                Fechar
              </button>
            </div>
          </div>
        )}

        {order && !isLoading && (
          <div className="p-5 space-y-4">
            {/* Bloco PROEMINENTE com os dados frescos do pedido. Sempre visível em todos os steps. */}
            <div className="rounded-md border-2 border-amber-500/60 bg-amber-500/10 p-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Confira o pedido antes de continuar
              </div>
              <div className="display text-xl break-words leading-tight">{order.customer_name}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Pedido</div>
                  <div className="font-mono font-bold">#{order.id.slice(0, 8).toUpperCase()}</div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground">Total</div>
                  <div className="font-black text-price">{brl(total)}</div>
                </div>
                {order.customer_phone && (
                  <div>
                    <div className="text-muted-foreground">Telefone</div>
                    <div className="font-mono">…{phoneDigits.slice(-4) || "----"}</div>
                  </div>
                )}
                {order.customer_cpf && (
                  <div className="text-right">
                    <div className="text-muted-foreground">CPF</div>
                    <div className="font-mono">…{cpfDigits.slice(-4) || "----"}</div>
                  </div>
                )}
              </div>
              {order.items.length > 0 && (
                <div className="pt-2 border-t border-amber-500/30">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Itens</div>
                  <ul className="text-xs space-y-0.5">
                    {order.items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">
                          {it.quantity}× {it.product_name}
                          {it.variant_color ? ` (${it.variant_color})` : ""}
                        </span>
                        <span className="font-mono text-muted-foreground shrink-0">
                          {brl(Number(it.unit_price) * Number(it.quantity))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {step === 1 && (
              <>
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
                    <span>O estorno será enviado ao Mercado Pago e <b>não pode ser desfeito</b>.</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} className="mt-0.5" />
                    <span>O <b>estoque NÃO será devolvido automaticamente</b>.</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={ack3} onChange={(e) => setAck3(e.target.checked)} className="mt-0.5" />
                    <span>
                      Eu confirmo que o cliente do pedido acima é <b>{order.customer_name}</b> e que o valor é <b>{brl(total)}</b>.
                    </span>
                  </label>
                </div>
                <div className="flex justify-between gap-2 pt-2">
                  <button onClick={() => setStep(1)} className="text-xs font-bold uppercase px-4 py-2 rounded border border-border">Voltar</button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!reasonValid || !ack1 || !ack2 || !ack3}
                    className="text-xs font-bold uppercase px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    Avançar
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Digite o primeiro nome do cliente *
                  </label>
                  <input
                    type="text"
                    value={customerConfirm}
                    onChange={(e) => setCustomerConfirm(e.target.value)}
                    placeholder={(order.customer_name ?? "").split(" ")[0]}
                    className={`w-full px-3 py-2 rounded border bg-background text-sm ${customerOk || !customerConfirm ? "border-amber-500/40" : "border-destructive"}`}
                  />
                  {customerConfirm && !customerOk && (
                    <p className="text-xs text-destructive">Não bate com o cliente do pedido.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Últimos 4 dígitos do <b>telefone</b> ou <b>CPF</b> do cliente *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={customerVerify}
                    onChange={(e) => setCustomerVerify(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    className={`w-full px-3 py-2 rounded border bg-background text-sm font-mono tracking-widest ${verifyOk || !customerVerify ? "border-amber-500/40" : "border-destructive"}`}
                  />
                  {customerVerify && !verifyOk && (
                    <p className="text-xs text-destructive">
                      4 dígitos não conferem com telefone nem CPF deste pedido.
                    </p>
                  )}
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
                    onClick={handleConfirm}
                    disabled={busy || !finalValid}
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase px-4 py-2 rounded bg-amber-600 text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Undo2 className="h-4 w-4" />
                    {busy ? "Processando..." : `Confirmar ${brl(amount)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
