import { useState } from "react";
import { Gift, X, AlertTriangle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";

export type ExchangeVoucherPayload = {
  items: { itemId: string; quantity: number }[];
  reason: string;
  confirmText: string;
  customerConfirm: string;
  customerVerify: string;
  expectedCustomerName: string;
  expectedTotal: number;
  extraAmount: number;
};

type Props = {
  orderId: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: ExchangeVoucherPayload) => void | Promise<void>;
};

type FreshOrder = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_cpf: string | null;
  customer_email: string | null;
  total: number;
  status: string;
  user_id: string | null;
  items: {
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    variant_color: string | null;
  }[];
};

function digitsOnly(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

export function ExchangeVoucherModal({ orderId, busy, onClose, onConfirm }: Props) {
  const { data: order, isLoading, error } = useQuery<FreshOrder>({
    queryKey: ["exchange-fresh-order", orderId],
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: ord, error: e1 } = await supabase
        .from("orders")
        .select("id,customer_name,customer_phone,customer_cpf,customer_email,total,status,user_id")
        .eq("id", orderId)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!ord) throw new Error("Pedido não encontrado");
      const { data: items, error: e2 } = await supabase
        .from("order_items")
        .select("id,product_name,quantity,unit_price,variant_color")
        .eq("order_id", orderId);
      if (e2) throw new Error(e2.message);
      return { ...(ord as any), total: Number(ord.total), items: (items ?? []) as any };
    },
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sel, setSel] = useState<Record<string, number>>({}); // itemId -> qty selecionada
  const [reason, setReason] = useState("");
  const [extraStr, setExtraStr] = useState("");
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [ack3, setAck3] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [customerConfirm, setCustomerConfirm] = useState("");
  const [customerVerify, setCustomerVerify] = useState("");

  const total = Number(order?.total ?? 0);
  const noUser = !!order && !order.user_id;

  const selectedItems = order?.items.filter((it) => (sel[it.id] ?? 0) > 0) ?? [];
  const itemsAmount = selectedItems.reduce(
    (s, it) => s + Number(it.unit_price) * (sel[it.id] ?? 0),
    0,
  );
  const extraAmount = Math.max(0, Number((extraStr || "0").replace(",", ".")) || 0);
  const amount = itemsAmount + extraAmount;
  const amountValid = itemsAmount > 0 && itemsAmount <= total + 0.001 && extraAmount >= 0 && extraAmount <= 10000;
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
    !noUser &&
    ack1 &&
    ack2 &&
    ack3 &&
    confirmText === "VALE TROCA" &&
    reasonValid &&
    customerOk &&
    verifyOk &&
    amountValid;

  function toggleQty(itemId: string, max: number, delta: number) {
    setSel((prev) => {
      const cur = prev[itemId] ?? 0;
      const next = Math.max(0, Math.min(max, cur + delta));
      return { ...prev, [itemId]: next };
    });
  }

  function handleConfirm() {
    if (!order) return;
    onConfirm({
      items: selectedItems.map((it) => ({ itemId: it.id, quantity: sel[it.id] ?? 0 })),
      reason: reason.trim(),
      confirmText,
      customerConfirm: customerConfirm.trim(),
      customerVerify: verifyDigits,
      expectedCustomerName: order.customer_name,
      expectedTotal: total,
      extraAmount,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="display text-lg text-emerald-700 dark:text-emerald-400">Emitir Vale-Troca</h3>
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
            Buscando dados do pedido...
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
          </div>
        )}

        {order && !isLoading && (
          <div className="p-5 space-y-4">
            <div className="rounded-md border-2 border-emerald-500/60 bg-emerald-500/10 p-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5" />
                Vale-troca vira cashback (expira em 30 dias)
              </div>
              <div className="display text-xl break-words leading-tight">{order.customer_name}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Pedido</div>
                  <div className="font-mono font-bold">#{order.id.slice(0, 8).toUpperCase()}</div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground">Total do pedido</div>
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
            </div>

            {noUser && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex gap-2 items-start">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  Este pedido não tem cliente cadastrado. Vale-troca só é possível para clientes com conta
                  no site (o cashback fica vinculado ao login).
                </span>
              </div>
            )}

            {step === 1 && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider">
                    Itens devolvidos por avaria / mal funcionamento
                  </label>
                  <ul className="divide-y divide-border border border-border rounded">
                    {order.items.map((it) => {
                      const qty = sel[it.id] ?? 0;
                      const max = Number(it.quantity);
                      return (
                        <li key={it.id} className="p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{it.product_name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {it.variant_color ? `${it.variant_color} · ` : ""}
                              comprou {max} · {brl(Number(it.unit_price))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleQty(it.id, max, -1)}
                              disabled={qty <= 0}
                              className="w-7 h-7 rounded border border-border text-sm font-bold disabled:opacity-40"
                            >−</button>
                            <span className="w-8 text-center font-mono text-sm font-bold">{qty}</span>
                            <button
                              type="button"
                              onClick={() => toggleQty(it.id, max, +1)}
                              disabled={qty >= max}
                              className="w-7 h-7 rounded border border-border text-sm font-bold disabled:opacity-40"
                            >+</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="rounded bg-secondary/40 p-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor a creditar como cashback:</span>
                  <span className="font-black text-emerald-700 dark:text-emerald-400 text-base">{brl(amount)}</span>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={onClose} className="text-xs font-bold uppercase px-4 py-2 rounded border border-border">Cancelar</button>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!amountValid || noUser}
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
                  <label className="text-xs font-bold uppercase tracking-wider">Motivo do vale-troca *</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Ex.: produto chegou com defeito, avaria de fábrica, mal funcionamento..."
                    className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">Mín. 5 caracteres · {reason.length}/500</p>
                </div>
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs space-y-2">
                  <p className="font-bold text-emerald-700 dark:text-emerald-400">⚠️ Atenção</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={ack1} onChange={(e) => setAck1(e.target.checked)} className="mt-0.5" />
                    <span>O cliente receberá <b>{brl(amount)}</b> em cashback (uso somente no site, expira em 30 dias).</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} className="mt-0.5" />
                    <span>Os produtos devolvidos <b>NÃO voltam ao estoque</b> (registro apenas para histórico).</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={ack3} onChange={(e) => setAck3(e.target.checked)} className="mt-0.5" />
                    <span>Confirmo que o cliente é <b>{order.customer_name}</b> e o valor devolvido é <b>{brl(amount)}</b>.</span>
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
                  <label className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Digite o primeiro nome do cliente *
                  </label>
                  <input
                    type="text"
                    value={customerConfirm}
                    onChange={(e) => setCustomerConfirm(e.target.value)}
                    placeholder={(order.customer_name ?? "").split(" ")[0]}
                    className={`w-full px-3 py-2 rounded border bg-background text-sm ${customerOk || !customerConfirm ? "border-emerald-500/40" : "border-destructive"}`}
                  />
                  {customerConfirm && !customerOk && (
                    <p className="text-xs text-destructive">Não bate com o cliente do pedido.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Últimos 4 dígitos do <b>telefone</b> ou <b>CPF</b> do cliente *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={customerVerify}
                    onChange={(e) => setCustomerVerify(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    className={`w-full px-3 py-2 rounded border bg-background text-sm font-mono tracking-widest ${verifyOk || !customerVerify ? "border-emerald-500/40" : "border-destructive"}`}
                  />
                  {customerVerify && !verifyOk && (
                    <p className="text-xs text-destructive">4 dígitos não conferem com telefone nem CPF.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Digite <span className="font-mono">VALE TROCA</span> para confirmar:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="VALE TROCA"
                    className="w-full px-3 py-2 rounded border border-emerald-500/40 bg-background font-mono text-sm"
                  />
                </div>
                <div className="flex justify-between gap-2 pt-2">
                  <button onClick={() => setStep(2)} disabled={busy} className="text-xs font-bold uppercase px-4 py-2 rounded border border-border">Voltar</button>
                  <button
                    onClick={handleConfirm}
                    disabled={busy || !finalValid}
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase px-4 py-2 rounded bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Gift className="h-4 w-4" />
                    {busy ? "Processando..." : `Emitir ${brl(amount)}`}
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
