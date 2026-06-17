import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Printer, Truck, Download, MessageCircle, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { markLabelEvent } from "@/lib/labels.functions";
import { brl } from "@/lib/format";
import { openWhatsApp, orderReadyMessage } from "@/lib/whatsapp";
import { Barcode } from "@/components/Barcode";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import shopboxLogo from "@/assets/shopbox-logo.png";

export const Route = createFileRoute("/etiqueta/$id")({
  head: () => ({ meta: [{ title: "Etiqueta · shopbox" }] }),
  component: LabelPage,
});

function formatPhone(d: string | null) {
  if (!d) return "";
  const s = d.replace(/\D/g, "");
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return d;
}


function formatCep(z: string | null) {
  if (!z) return "";
  const d = z.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatCpf(c: string | null) {
  if (!c) return "";
  const d = c.replace(/\D/g, "").padStart(11, "0").slice(0, 11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const STORE = {
  name: "shopbox",
  street: "Rua Emílio Gleber",
  number: "1118",
  district: "Atuba",
  city: "Colombo",
  state: "PR",
  zip: "83405-000",
};

function barcodeValue(id: string) {
  return id.replace(/-/g, "").slice(0, 12).toUpperCase();
}

function LabelPage() {
  const { id } = Route.useParams();
  const markEvent = useServerFn(markLabelEvent);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["label", id],
    queryFn: async () => {
      const { data: order, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);
      return { order, items: items ?? [] };
    },
  });

  const labelRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const generatedOnce = useRef(false);

  // Mark "generated" the first time the label is opened by a team member.
  useEffect(() => {
    if (!data?.order || generatedOnce.current) return;
    generatedOnce.current = true;
    markEvent({ data: { order_id: id, event: "generated" } })
      .then(() => refetch());
  }, [data, id, markEvent, refetch]);

  // Detect actual print and record it.
  useEffect(() => {
    const onAfter = () => {
      markEvent({ data: { order_id: id, event: "printed" } })
        .then(() => refetch());
    };
    window.addEventListener("afterprint", onAfter);
    return () => window.removeEventListener("afterprint", onAfter);
  }, [id, markEvent, refetch]);


  if (isLoading) return <div className="p-10 text-center">Carregando etiqueta...</div>;
  if (!data?.order) return <div className="p-10 text-center">Pedido não encontrado.</div>;

  const o = data.order as any;
  const isPickup = o.delivery_method === "pickup";

  const handleDownloadPdf = async () => {
    if (!labelRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(labelRef.current, {
        backgroundColor: "#ffffff",
        scale: 3,
        useCORS: true,
      });
      const img = canvas.toDataURL("image/jpeg", 0.95);
      // Etiqueta de retirada: A6 (105x148 mm) colante; envio: 110x150 mm.
      const pdfFormat = isPickup ? "a6" : [110, 150];
      const pdf = new jsPDF({ unit: "mm", format: pdfFormat, orientation: "portrait" });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 2;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = canvas.width / canvas.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      pdf.addImage(img, "JPEG", (pageW - w) / 2, margin, w, h);
      pdf.save(`etiqueta-${isPickup ? "retirada" : "envio"}-${o.id.slice(0, 8)}.pdf`);
      await markEvent({ data: { order_id: id, event: "generated" } });
      refetch();
    } finally {
      setDownloading(false);
    }
  };

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

  return (
    <>
      <style>{`
        @page { size: ${isPickup ? "A6" : "110mm 150mm"}; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { width: ${isPickup ? "105mm" : "110mm"} !important; height: ${isPickup ? "148mm" : "150mm"} !important; background: white !important; color: black !important; margin: 0 !important; padding: 0 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          body * { visibility: hidden !important; }
          .label-doc, .label-doc * { visibility: visible !important; }
          .label-doc { position: fixed !important; left: 0 !important; top: 0 !important; width: ${isPickup ? "105mm" : "110mm"} !important; height: ${isPickup ? "148mm" : "150mm"} !important; padding: 3mm !important; margin: 0 !important; box-sizing: border-box !important; background: white !important; color: black !important; font-family: Arial, Helvetica, sans-serif !important; font-weight: 700 !important; overflow: hidden !important; page-break-after: avoid !important; page-break-inside: avoid !important; }
          .label-doc * { color: black !important; border-color: black !important; opacity: 1 !important; background: white !important; text-shadow: 0 0 0 black !important; -webkit-font-smoothing: none !important; }
          .label-doc .pickup-header { background: black !important; color: white !important; }
          .label-doc .pickup-header * { color: white !important; background: black !important; }
          .label-doc img { filter: none !important; }
          .label-doc svg { shape-rendering: crispEdges !important; }
        }
        .label-doc { font-family: Arial, Helvetica, sans-serif; font-weight: 600; width: ${isPickup ? "105mm" : "110mm"}; min-height: ${isPickup ? "148mm" : "150mm"}; margin: 0 auto; box-sizing: border-box; }
      `}</style>

      <div className="min-h-screen bg-muted py-6 px-4">
        <div className="max-w-md mx-auto space-y-3">
          <div className="no-print flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Etiqueta de {isPickup ? "retirada" : "envio (padrão Correios)"}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {isPickup && o.customer_phone && (
                <button
                  onClick={() => openWhatsApp(o.customer_phone, orderReadyMessage(o.customer_name, o.id))}
                  className="inline-flex items-center gap-1.5 bg-[#25D366] text-white font-bold text-xs uppercase tracking-wider px-3 py-2 rounded hover:opacity-90"
                  title="Avisar o cliente que o pedido está pronto para retirada"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Avisar cliente
                </button>
              )}
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 bg-secondary hover:bg-muted text-foreground font-bold text-xs uppercase tracking-wider px-3 py-2 rounded disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> {downloading ? "Gerando..." : "PDF"}
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider px-3 py-2 rounded"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </button>
            </div>
          </div>

          <div className="no-print bg-card border border-border rounded-md p-3 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-muted-foreground">Status da etiqueta</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                o.label_status === "printed" ? "bg-[#25D366]/20 text-[#25D366]" :
                o.label_status === "generated" ? "bg-accent/20 text-accent" :
                "bg-muted text-muted-foreground"
              }`}>
                {o.label_status === "printed" ? "Impressa" : o.label_status === "generated" ? "Gerada" : "Não gerada"}
              </span>
            </div>
            <div className="text-muted-foreground">
              <strong className="text-foreground">Gerada:</strong> {fmt(o.label_generated_at)}
              {o.label_generated_by_name ? ` por ${o.label_generated_by_name}` : ""}
            </div>
            <div className="text-muted-foreground">
              <strong className="text-foreground">Impressa:</strong> {fmt(o.label_printed_at)}
              {o.label_printed_by_name ? ` por ${o.label_printed_by_name}` : ""}
            </div>
          </div>

          <div ref={labelRef}>
            {isPickup ? <PickupLabel o={o} items={data.items} /> : <ShippingLabel o={o} items={data.items} />}
          </div>
        </div>
      </div>
    </>
  );
}

function LabelHeader({ logoOnly = false, title, subtitle, icon }: { logoOnly?: boolean; title?: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pb-2">
      <img src={shopboxLogo} alt="shopbox" className="h-12 w-auto" />
      {!logoOnly && (
        <div className="text-right">
          {icon}
          {title && <div className="font-black text-sm tracking-wider">{title}</div>}
          {subtitle && <div className="text-[10px] uppercase">{subtitle}</div>}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5 border-t-2 border-black">
      <div className="text-[11px] font-black uppercase tracking-wide mb-0.5">{label}</div>
      {children}
    </div>
  );
}

function ShippingLabel({ o, items }: { o: any; items: any[] }) {
  return (
    <div className="label-doc bg-white text-black p-3">
      <LabelHeader
        title="CORREIOS · ENVIO"
        subtitle="Encomenda · PAC"
        icon={<Truck className="h-5 w-5 inline" />}
      />

      <Row label="Código de rastreio">
        <div className="text-center">
          <div className="font-mono text-sm tracking-widest">BR{o.id.replace(/-/g, "").slice(0, 9).toUpperCase()}BR</div>
          <div className="flex justify-center mt-1">
            <Barcode value={barcodeValue(o.id)} height={34} width={1.7} fontSize={10} />
          </div>
          <div className="text-[10px] mt-0.5 font-bold">Escaneie para localizar o pedido</div>
        </div>
      </Row>

      <Row label="Destinatário">
        <div className="font-bold text-sm uppercase">{o.customer_name}</div>
        {o.customer_cpf && <div className="text-[10px]">CPF: {formatCpf(o.customer_cpf)}</div>}
        <div className="text-xs leading-tight mt-0.5">
          {o.shipping_street}, {o.shipping_number}
          {o.shipping_complement ? ` — ${o.shipping_complement}` : ""}
        </div>
        {o.shipping_district && <div className="text-xs leading-tight">Bairro: {o.shipping_district}</div>}
        <div className="text-xs leading-tight">{o.shipping_city} / {o.shipping_state}</div>
        <div className="text-base font-black tracking-widest mt-0.5">CEP: {formatCep(o.shipping_zip)}</div>
        {o.customer_phone && <div className="text-[10px] mt-0.5">Tel: {formatPhone(o.customer_phone)}</div>}
      </Row>

      <Row label="Remetente">
        <div className="font-black text-sm uppercase">{STORE.name}</div>
        <div className="text-xs leading-tight font-bold">{STORE.street}, {STORE.number} — {STORE.district}</div>
        <div className="text-xs leading-tight font-bold">{STORE.city} / {STORE.state}</div>
        <div className="text-xs font-black">CEP: {STORE.zip}</div>
      </Row>

      <Row label={`Conteúdo · Pedido #${o.id.slice(0, 8).toUpperCase()}`}>
        <ul className="text-xs leading-tight font-bold">
          {items.map((it: any, i: number) => (
            <li key={i}>
              • {it.quantity}x {it.product_name}
              {it.variant_color && <span> · {it.variant_color}</span>}
            </li>
          ))}
        </ul>
        <div className="text-[11px] mt-1 pt-1 border-t-2 border-dashed border-black flex justify-between font-bold">
          <span>Valor declarado: {brl(Number(o.total))}</span>
          <span>{new Date(o.created_at).toLocaleDateString("pt-BR")}</span>
        </div>
      </Row>
    </div>
  );
}

function PickupLabel({ o, items }: { o: any; items: any[] }) {
  return (
    <div className="label-doc bg-white text-black border-2 border-black p-4 space-y-3">
      <div className="pickup-header border-2 border-black p-2 flex items-center justify-between bg-black text-white">
        <div>
          <div className="font-black text-lg tracking-wider">RETIRADA NA LOJA</div>
          <div className="text-[10px] uppercase">Aguardar cliente</div>
        </div>
        <Store className="h-7 w-7" />
      </div>

      <div className="border border-black p-3 text-center">
        <div className="text-[10px] font-bold uppercase">Senha do pedido</div>
        <div className="font-black text-3xl tracking-[0.3em] mt-1">
          {o.id.slice(0, 6).toUpperCase()}
        </div>
        <div className="text-[10px] mt-1">Confira documento do cliente ao entregar</div>
      </div>

      <div className="border border-black p-2">
        <div className="text-[10px] font-bold uppercase border-b border-black mb-1 pb-0.5">Cliente</div>
        <div className="font-bold text-sm uppercase">{o.customer_name}</div>
        {o.customer_cpf && <div className="text-xs font-bold">CPF: {formatCpf(o.customer_cpf)}</div>}
        {o.customer_phone && <div className="text-xs mt-1">WhatsApp: {formatPhone(o.customer_phone)}</div>}
        {o.customer_email && <div className="text-[11px]">{o.customer_email}</div>}
      </div>

      <div className="border border-black p-2">
        <div className="text-[10px] font-bold uppercase border-b border-black mb-1 pb-0.5">
          Itens · Pedido #{o.id.slice(0, 8).toUpperCase()}
        </div>
        <ul className="text-sm leading-tight space-y-0.5">
          {items.map((it: any, i: number) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                <strong>{it.quantity}x</strong> {it.product_name}
                {it.variant_color && <span className="ml-1 text-[11px] font-black uppercase">· {it.variant_color}</span>}
              </span>
              <span className="text-[11px]">{brl(it.unit_price * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="text-xs mt-2 border-t border-dashed border-black pt-1 flex justify-between font-bold">
          <span>TOTAL PAGO</span>
          <span>{brl(Number(o.total))}</span>
        </div>
      </div>

      <div className="border border-black p-2 text-center">
        <div className="text-[10px] font-bold uppercase">Local de retirada</div>
        <div className="text-xs mt-1">
          {STORE.street}, {STORE.number} — {STORE.district}<br />
          {STORE.city} / {STORE.state} · Seg a Sáb · 9h às 18h · Dom · 10h às 16h
        </div>
      </div>

      <div className="text-[10px] text-center text-gray-600">
        Emitido em {new Date().toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

