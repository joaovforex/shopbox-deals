import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Truck, X } from "lucide-react";
import { toast } from "sonner";
import { createDeliveryUpgrade } from "@/lib/delivery-upgrade.functions";

/**
 * Botão + modal para converter um pedido de RETIRADA para ENTREGA
 * pagando R$10 de frete via Pix (Asaas).
 *
 * Exibido apenas quando o pedido está pago, ainda é retirada, e não foi
 * concluído/retirado.
 */
export function DeliveryUpgradeButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mt-2 bg-accent/10 border border-accent/30 rounded-lg px-3 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          <div className="font-bold text-accent uppercase tracking-wider mb-0.5 inline-flex items-center gap-1">
            <Truck className="h-3.5 w-3.5" /> Prefere receber em casa?
          </div>
          <div className="text-muted-foreground">
            Pague o frete por Pix e mudamos seu pedido para entrega.
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider text-xs px-4 py-2.5 rounded-md hover:bg-primary/90"
        >
          <Truck className="h-4 w-4" /> Converter para entrega
        </button>
      </div>
      {open && <DeliveryUpgradeDialog orderId={orderId} onClose={() => setOpen(false)} />}
    </>
  );
}

function DeliveryUpgradeDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useServerFn(createDeliveryUpgrade);
  const quote = useServerFn(quoteDelivery);
  const [loading, setLoading] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quoted, setQuoted] = useState<{ fee: number; etaMinutes?: number } | null>(null);
  const [form, setForm] = useState({
    zip: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "PR",
    recipient_name: "",
    recipient_phone: "",
  });

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await create({ data: { order_id: orderId, shipping: form } });
      if (res?.initPoint && typeof window !== "undefined") {
        sessionStorage.setItem("mp_init_point", res.initPoint);
        window.location.assign("/redirecionando");
      }
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível iniciar o pagamento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent font-bold">Converter para entrega</div>
            <h2 className="display text-xl">Endereço de entrega</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Frete pago por Pix. Entregamos apenas em Curitiba e região metropolitana.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="CEP *" required value={form.zip} onChange={update("zip")} maxLength={9} />
            <Field label="Estado *" required value={form.state} onChange={update("state")} maxLength={2} />
          </div>
          <Field label="Rua *" required value={form.street} onChange={update("street")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Número *" required value={form.number} onChange={update("number")} />
            <Field label="Complemento" value={form.complement} onChange={update("complement")} />
          </div>
          <Field label="Bairro" value={form.district} onChange={update("district")} />
          <Field label="Cidade *" required value={form.city} onChange={update("city")} placeholder="Ex.: Curitiba" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome do recebedor" value={form.recipient_name} onChange={update("recipient_name")} />
            <Field label="Telefone" value={form.recipient_phone} onChange={update("recipient_phone")} />
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="text-xs uppercase tracking-wider font-bold px-4 py-2.5 rounded-md bg-secondary text-foreground">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider text-xs px-4 py-2.5 rounded-md hover:bg-primary/90 disabled:opacity-60"
            >
              <Truck className="h-4 w-4" />
              {loading ? "Abrindo..." : "Pagar frete (Pix)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{label}</span>
      <input
        {...rest}
        className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
      />
    </label>
  );
}
