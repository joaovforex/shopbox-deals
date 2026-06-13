import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Store, Printer, Package, CheckCircle2, Clock, AlertTriangle, Filter, RotateCcw, Bell, CheckCheck, ScanLine, BellRing, XCircle, Hourglass } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { hasAnyRole } from "@/lib/products";
import { brl } from "@/lib/format";
import { openWhatsApp, orderReminderMessage, orderDeliveredMessage } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/admin/expedicao")({
  head: () => ({ meta: [{ title: "Expedição · Admin" }] }),
  component: FulfillmentPage,
});

type OrderRow = {
  id: string;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
  shipping_zip: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  delivery_method: string;
  payment_method: string;
  status: string;
  fulfillment_status: string;
  total: number;
  label_status?: string | null;
  label_generated_at?: string | null;
  label_generated_by_name?: string | null;
  label_printed_at?: string | null;
  label_printed_by_name?: string | null;
};

type ItemRow = {
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  preparing: "Em preparo",
  ready: "Pronto",
  shipped: "Enviado",
  completed: "Concluído",
};

function nextStatus(current: string, delivery: string): string {
  const flow = delivery === "pickup"
    ? ["pending", "preparing", "ready", "completed"]
    : ["pending", "preparing", "ready", "shipped", "completed"];
  const i = flow.indexOf(current);
  if (i < 0 || i >= flow.length - 1) return current;
  return flow[i + 1];
}

function hoursSince(iso?: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function isDelayed(o: OrderRow) {
  if (o.fulfillment_status === "completed") return false;
  // Pendente há mais de 2h
  if (o.fulfillment_status === "pending" && hoursSince(o.created_at) > 2) return true;
  // Etiqueta gerada mas não impressa há mais de 1h
  if (o.label_status === "generated" && hoursSince(o.label_generated_at) > 1) return true;
  // Sem etiqueta e não é retirada já pronta há mais de 4h
  if (!o.label_status && hoursSince(o.created_at) > 4) return true;
  return false;
}

function barcodeValue(id: string) {
  return id.replace(/-/g, "").slice(0, 12).toLowerCase();
}

function FulfillmentPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"pickup" | "delivery" | "done" | "notifications">("pickup");
  const [labelFilter, setLabelFilter] = useState<"all" | "none" | "generated" | "printed">("all");
  const qc = useQueryClient();

  useEffect(() => {
    hasAnyRole(["admin", "manager", "fulfillment"]).then(setAllowed);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["fulfillment-orders"],
    enabled: allowed === true,
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("*")
        .eq("delivery_method", "pickup")
        .eq("status", "paid")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (orders ?? []).map((o) => o.id);
      let items: ItemRow[] = [];
      if (ids.length) {
        const { data: it } = await supabase.from("order_items").select("order_id, product_name, quantity, unit_price").in("order_id", ids);
        items = (it ?? []) as ItemRow[];
      }
      return { orders: (orders ?? []) as OrderRow[], items };
    },
  });

  // Pedidos não concluídos (pendentes/cancelados) que NÃO chegaram à expedição
  const { data: notifData } = useQuery({
    queryKey: ["fulfillment-notifications"],
    enabled: allowed === true,
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, created_at, customer_name, customer_email, customer_phone, payment_method, delivery_method, status, total, mp_payment_id, stock_restored_at")
        .in("status", ["pending", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (orders ?? []) as Array<{
        id: string; created_at: string; customer_name: string; customer_email: string | null;
        customer_phone: string | null; payment_method: string; delivery_method: string;
        status: string; total: number; mp_payment_id: string | null; stock_restored_at: string | null;
      }>;
    },
    refetchInterval: 30000,
  });

  // Atualização em tempo real: novos pedidos + mudanças
  useEffect(() => {
    if (allowed !== true) return;
    const channel = supabase
      .channel("expedicao-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
          qc.invalidateQueries({ queryKey: ["fulfillment-notifications"] });
          if (payload.eventType === "INSERT") {
            const row = payload.new as { customer_name?: string; delivery_method?: string };
            if (row.delivery_method === "pickup") {
              toast.success(`Novo pedido de ${row.customer_name ?? "cliente"}`);
            }
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [allowed, qc]);

  const advance = async (o: OrderRow) => {
    const ns = nextStatus(o.fulfillment_status, o.delivery_method);
    if (ns === o.fulfillment_status) return;
    const { error } = await supabase.from("orders").update({ fulfillment_status: ns } as never).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success(`Status atualizado para "${STATUS_LABEL[ns]}"`);
    qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
  };

  const markDelivered = async (o: OrderRow) => {
    const { error } = await supabase.from("orders").update({ fulfillment_status: "completed" } as never).eq("id", o.id);
    if (error) return toast.error(error.message);
    openWhatsApp(o.customer_phone, orderDeliveredMessage(o.customer_name, o.id));
    toast.success("Pedido marcado como entregue. Mensagem de agradecimento aberta.");
    qc.invalidateQueries({ queryKey: ["fulfillment-orders"] });
  };

  const remindCustomer = (o: OrderRow) => {
    if (!o.customer_phone) return toast.error("Cliente sem telefone cadastrado.");
    openWhatsApp(o.customer_phone, orderReminderMessage(o.customer_name, o.id));
  };

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const it of data?.items ?? []) {
      const arr = map.get(it.order_id) ?? [];
      arr.push(it);
      map.set(it.order_id, arr);
    }
    return map;
  }, [data]);

  const orders = useMemo(() => {
    let list = (data?.orders ?? []).filter((o) => {
      if (tab === "done") return o.fulfillment_status === "completed";
      if (tab === "delivery") return o.fulfillment_status === "ready";
      return o.fulfillment_status !== "completed" && o.fulfillment_status !== "ready";
    });
    if (labelFilter !== "all") {
      list = list.filter((o) => {
        if (labelFilter === "none") return !o.label_status;
        if (labelFilter === "generated") return o.label_status === "generated";
        if (labelFilter === "printed") return o.label_status === "printed";
        return true;
      });
    }
    if (tab === "done") {
      return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list.sort((a, b) => {
      const da = isDelayed(a) ? -1 : 0;
      const db = isDelayed(b) ? -1 : 0;
      if (da !== db) return da - db;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [data, tab, labelFilter]);

  if (allowed === null) {
    return <Shell><div className="flex-1 flex items-center justify-center">Carregando...</div></Shell>;
  }
  if (!allowed) {
    return <Shell><div className="flex-1 flex items-center justify-center p-6 text-muted-foreground">Acesso restrito à equipe de Expedição.</div></Shell>;
  }

  const delayedCount = orders.filter(isDelayed).length;

  return (
    <Shell>
      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao admin
          </Link>
          <div className="text-xs uppercase tracking-widest text-accent font-bold">Departamento</div>
          <h1 className="display text-3xl md:text-4xl">Expedição</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe os pedidos de <strong>retirada na loja</strong>. Imprima a etiqueta, avise o cliente e marque como entregue.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 space-y-4">
        {tab === "delivery" && (
          <ScannerPanel orders={data?.orders ?? []} onDeliver={markDelivered} />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-secondary rounded-md p-1">
            <TabBtn active={tab === "pickup"} onClick={() => setTab("pickup")} icon={<Store className="h-4 w-4" />}>
              Em aberto ({(data?.orders ?? []).filter((o) => o.fulfillment_status !== "completed" && o.fulfillment_status !== "ready").length})
            </TabBtn>
            <TabBtn active={tab === "delivery"} onClick={() => setTab("delivery")} icon={<Package className="h-4 w-4" />}>
              Entrega ({(data?.orders ?? []).filter((o) => o.fulfillment_status === "ready").length})
            </TabBtn>
            <TabBtn active={tab === "done"} onClick={() => setTab("done")} icon={<CheckCircle2 className="h-4 w-4" />}>
              Entregues ({(data?.orders ?? []).filter((o) => o.fulfillment_status === "completed").length})
            </TabBtn>
            <TabBtn active={tab === "notifications"} onClick={() => setTab("notifications")} icon={<BellRing className="h-4 w-4" />}>
              Notificações ({(notifData ?? []).length})
            </TabBtn>
          </div>


          <div className="inline-flex items-center gap-1 bg-secondary rounded-md p-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground ml-2" />
            {(["all", "none", "generated", "printed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLabelFilter(f)}
                className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded ${
                  labelFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "Todas" : f === "none" ? "Não gerada" : f === "generated" ? "Gerada" : "Impressa"}
              </button>
            ))}
          </div>

          {delayedCount > 0 && (
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-3 py-1.5 rounded-md">
              <AlertTriangle className="h-3.5 w-3.5" />
              {delayedCount} pedido{delayedCount > 1 ? "s" : ""} atrasado{delayedCount > 1 ? "s" : ""}
            </div>
          )}
        </div>

        {tab === "notifications" ? (
          <NotificationsPanel rows={notifData ?? []} />
        ) : isLoading ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">Carregando...</div>
        ) : orders.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-primary" />
            Nenhum pedido em aberto nesta fila.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {orders.map((o) => {
              const items = itemsByOrder.get(o.id) ?? [];
              const labelType = o.delivery_method === "pickup" ? "retirada" : "envio";
              const delayed = isDelayed(o);
              return (
                <article key={o.id} className={`bg-card border rounded-lg p-4 flex flex-col gap-3 ${delayed ? "border-destructive ring-1 ring-destructive/30" : "border-border"}`}>
                  <header className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</div>
                      <div className="font-bold">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {delayed && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-destructive text-destructive-foreground">
                          <AlertTriangle className="h-3 w-3" /> Atrasado
                        </span>
                      )}
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${
                        o.fulfillment_status === "pending" ? "bg-muted text-muted-foreground" :
                        o.fulfillment_status === "preparing" ? "bg-accent/20 text-accent" :
                        o.fulfillment_status === "ready" ? "bg-primary/20 text-primary" :
                        "bg-[#25D366]/20 text-[#25D366]"
                      }`}>
                        <Clock className="inline h-3 w-3 mr-1" />
                        {STATUS_LABEL[o.fulfillment_status] ?? o.fulfillment_status}
                      </span>
                    </div>
                  </header>

                  <div className="text-xs text-muted-foreground border-y border-border py-2">
                    {o.delivery_method === "delivery" ? (
                      <>
                        <strong className="text-foreground">Endereço:</strong> {o.shipping_address}
                      </>
                    ) : (
                      <>
                        <strong className="text-foreground">Retirada:</strong> aguardando cliente · {o.customer_phone}
                      </>
                    )}
                  </div>

                  <ul className="text-sm space-y-1">
                    {items.map((it, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          {it.quantity}x {it.product_name}
                        </span>
                        <span className="font-semibold whitespace-nowrap">{brl(it.unit_price * it.quantity)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold text-price">{brl(Number(o.total))}</span>
                  </div>

                  <div className="text-[11px] text-muted-foreground bg-secondary/40 rounded px-2 py-1.5 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold uppercase tracking-wider text-[10px]">Etiqueta</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        o.label_status === "printed" ? "bg-[#25D366]/20 text-[#25D366]" :
                        o.label_status === "generated" ? "bg-accent/20 text-accent" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {o.label_status === "printed" ? "Impressa" : o.label_status === "generated" ? "Gerada" : "Não gerada"}
                      </span>
                    </div>
                    {o.label_generated_at && (
                      <div>Gerada {new Date(o.label_generated_at).toLocaleString("pt-BR")}{o.label_generated_by_name ? ` · ${o.label_generated_by_name}` : ""}</div>
                    )}
                    {o.label_printed_at && (
                      <div>Impressa {new Date(o.label_printed_at).toLocaleString("pt-BR")}{o.label_printed_by_name ? ` · ${o.label_printed_by_name}` : ""}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <a
                      href={`/etiqueta/${o.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs bg-secondary hover:bg-muted px-3 py-2 rounded font-bold uppercase tracking-wider"
                    >
                      <Printer className="h-3.5 w-3.5" /> {o.label_status === "generated" ? "Reimprimir" : "Etiqueta"} {labelType}
                    </a>
                    {o.label_status === "generated" && (
                      <a
                        href={`/etiqueta/${o.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs bg-accent/20 text-accent hover:bg-accent/30 px-3 py-2 rounded font-bold uppercase tracking-wider"
                        title="Abrir etiqueta novamente para reimpressão"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reimprimir
                      </a>
                    )}
                    {o.fulfillment_status !== "completed" && (
                      <button
                        onClick={() => advance(o)}
                        className="inline-flex items-center gap-1.5 text-xs bg-primary text-primary-foreground hover:opacity-90 px-3 py-2 rounded font-bold uppercase tracking-wider"
                      >
                        Avançar → {STATUS_LABEL[nextStatus(o.fulfillment_status, o.delivery_method)]}
                      </button>
                    )}
                    {o.fulfillment_status === "ready" && o.customer_phone && (
                      <button
                        onClick={() => remindCustomer(o)}
                        className="inline-flex items-center gap-1.5 text-xs bg-accent/20 text-accent hover:bg-accent/30 px-3 py-2 rounded font-bold uppercase tracking-wider"
                        title="Enviar lembrete via WhatsApp"
                      >
                        <Bell className="h-3.5 w-3.5" /> Lembrar cliente
                      </button>
                    )}
                    {o.fulfillment_status !== "completed" && (
                      <button
                        onClick={() => markDelivered(o)}
                        className="inline-flex items-center gap-1.5 text-xs bg-[#25D366] text-white hover:opacity-90 px-3 py-2 rounded font-bold uppercase tracking-wider"
                        title="Confirmar entrega ao cliente e enviar agradecimento"
                      >
                        <CheckCheck className="h-3.5 w-3.5" /> Entregue
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </Shell>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon} {children}
    </button>
  );
}

function ScannerPanel({ orders, onDeliver }: { orders: OrderRow[]; onDeliver: (o: OrderRow) => void }) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [last, setLast] = useState<{ id: string; name: string; ok: boolean } | null>(null);

  // Mantém o foco no campo para o leitor USB sempre digitar aqui
  useEffect(() => {
    const focus = () => {
      // Só refoca se o usuário não estiver digitando em outro input/textarea
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      inputRef.current?.focus();
    };
    focus();
    window.addEventListener("click", focus);
    return () => window.removeEventListener("click", focus);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = code.trim();
    setCode("");
    if (!raw) return;

    const norm = raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const match = orders.find(
      (o) => {
        const id = o.id.toLowerCase();
        const compact = o.id.replace(/-/g, "").toLowerCase();
        return id === norm || id.startsWith(norm) || compact === norm || compact.startsWith(norm) || barcodeValue(o.id) === norm;
      },
    );

    if (!match) {
      setLast({ id: raw, name: "—", ok: false });
      toast.error(`Pedido não encontrado para o código ${raw.slice(0, 12)}…`);
      return;
    }

    if (match.fulfillment_status === "completed") {
      setLast({ id: match.id, name: match.customer_name, ok: false });
      toast.info(`Pedido de ${match.customer_name} já está marcado como entregue.`);
      return;
    }

    onDeliver(match);
    setLast({ id: match.id, name: match.customer_name, ok: true });
  };

  return (
    <form
      onSubmit={submit}
      className="bg-card border-2 border-dashed border-primary/40 rounded-lg p-3 flex flex-wrap items-center gap-3"
    >
      <div className="flex items-center gap-2 text-primary">
        <ScanLine className="h-5 w-5" />
        <span className="font-bold uppercase tracking-wider text-xs">Leitor de código</span>
      </div>
      <input
        ref={inputRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Escaneie a etiqueta do pedido…"
        autoFocus
        className="flex-1 min-w-[220px] bg-secondary/60 border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="submit"
        className="text-xs font-bold uppercase tracking-wider bg-primary text-primary-foreground px-3 py-2 rounded hover:opacity-90"
      >
        Confirmar entrega
      </button>
      {last && (
        <div
          className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${
            last.ok ? "bg-[#25D366]/20 text-[#25D366]" : "bg-destructive/15 text-destructive"
          }`}
        >
          {last.ok ? "✓ Entregue" : "✗ Falhou"} · {last.name !== "—" ? last.name : last.id.slice(0, 8).toUpperCase()}
        </div>
      )}
      <div className="basis-full text-[11px] text-muted-foreground">
        Mantenha esta tela aberta. O leitor USB digita o código e confirma automaticamente.
      </div>
    </form>
  );
}


function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {children}
      <Footer />
    </div>
  );
}

type NotifRow = {
  id: string; created_at: string; customer_name: string; customer_email: string | null;
  customer_phone: string | null; payment_method: string; delivery_method: string;
  status: string; total: number; mp_payment_id: string | null; stock_restored_at: string | null;
};

function notifReason(o: NotifRow): { title: string; detail: string; tone: "warn" | "danger" | "info" } {
  const ageMin = (Date.now() - new Date(o.created_at).getTime()) / 60000;
  if (o.status === "pending") {
    if (ageMin > 30) {
      return {
        title: "Pagamento não concluído",
        detail: "Pedido criado há mais de 30 min sem confirmação do Mercado Pago. O cliente provavelmente abandonou o checkout ou o pagamento expirou.",
        tone: "danger",
      };
    }
    return {
      title: "Aguardando pagamento",
      detail: o.mp_payment_id
        ? "Mercado Pago ainda não confirmou o pagamento. Aguardando webhook."
        : "Cliente foi redirecionado ao Mercado Pago e ainda não finalizou o pagamento.",
      tone: "warn",
    };
  }
  // cancelled
  if (o.mp_payment_id) {
    return {
      title: "Pagamento recusado / cancelado",
      detail: "Mercado Pago retornou o pagamento como não aprovado (recusado, estornado ou cancelado pelo cliente). O pedido não seguiu para a expedição.",
      tone: "danger",
    };
  }
  if (o.stock_restored_at) {
    return {
      title: "Cancelado por falta de estoque",
      detail: "Quando o pagamento chegou, um dos itens estava sem estoque. O pedido foi cancelado automaticamente e o estoque foi devolvido.",
      tone: "danger",
    };
  }
  return {
    title: "Pedido expirado",
    detail: "O cliente não concluiu o pagamento dentro do prazo e o pedido foi cancelado automaticamente.",
    tone: "info",
  };
}

function NotificationsPanel({ rows }: { rows: NotifRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
        <BellRing className="h-10 w-10 mx-auto mb-2 text-primary" />
        Nenhum pedido pendente ou cancelado nas últimas atualizações.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Pedidos que <strong className="text-foreground">não chegaram à expedição</strong> — geralmente porque o pagamento não foi confirmado.
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map((o) => {
          const r = notifReason(o);
          const Icon = r.tone === "danger" ? XCircle : r.tone === "warn" ? Hourglass : AlertTriangle;
          const toneCls =
            r.tone === "danger" ? "border-destructive/40 bg-destructive/5" :
            r.tone === "warn" ? "border-accent/40 bg-accent/5" :
            "border-border bg-muted/30";
          const iconCls =
            r.tone === "danger" ? "text-destructive" :
            r.tone === "warn" ? "text-accent" :
            "text-muted-foreground";
          return (
            <article key={o.id} className={`border rounded-lg p-4 flex flex-col gap-2 ${toneCls}`}>
              <header className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[11px] text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</div>
                  <div className="font-bold">{o.customer_name}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${o.status === "cancelled" ? "bg-destructive text-destructive-foreground" : "bg-accent/20 text-accent"}`}>
                  {o.status === "cancelled" ? "Cancelado" : "Pendente"}
                </span>
              </header>
              <div className="flex items-start gap-2 border-t border-border/50 pt-2">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${iconCls}`} />
                <div className="text-sm">
                  <div className="font-bold">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.detail}</div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2">
                <span>{o.payment_method === "pix" ? "PIX" : "Cartão / MP"} · {o.delivery_method === "pickup" ? "Retirada" : "Entrega"}</span>
                <span className="font-bold text-foreground">{brl(Number(o.total))}</span>
              </div>
              {o.customer_phone && (
                <a
                  href={`https://wa.me/55${o.customer_phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider bg-[#25D366] text-white px-3 py-1.5 rounded hover:opacity-90"
                >
                  <Bell className="h-3.5 w-3.5" /> Falar com cliente
                </a>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
