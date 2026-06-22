import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Printer, Truck, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { markLabelEvent } from "@/lib/labels.functions";
import { brl } from "@/lib/format";
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
      // Etiqueta de retirada: A6 (105x148 mm) colante; envio: 100x150 mm.
      const pdfFormat = isPickup ? "A6" : [100, 150];
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
        @page { size: ${isPickup ? "A6" : "100mm 150mm"}; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { width: ${isPickup ? "105mm" : "100mm"} !important; height: ${isPickup ? "148mm" : "150mm"} !important; background: white !important; color: #000 !important; margin: 0 !important; padding: 0 !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
          body * { visibility: hidden !important; }
          .label-doc, .label-doc * { visibility: visible !important; }
          .label-doc { position: fixed !important; left: 0 !important; top: 0 !important; width: ${isPickup ? "105mm" : "100mm"} !important; height: ${isPickup ? "148mm" : "150mm"} !important; padding: 2mm !important; margin: 0 !important; box-sizing: border-box !important; background: white !important; color: #000 !important; font-family: 'Arial Black', Arial, Helvetica, sans-serif !important; font-weight: 900 !important; overflow: hidden !important; overflow-wrap: break-word !important; page-break-after: avoid !important; page-break-inside: avoid !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
          .label-doc * { color: #000 !important; border-color: #000 !important; opacity: 1 !important; background: white !important; text-shadow: none !important; -webkit-font-smoothing: none !important; font-weight: 900 !important; text-rendering: geometricPrecision !important; }
          .label-doc .pickup-header { background: #000 !important; color: #fff !important; }
          .label-doc .pickup-header * { color: #fff !important; background: #000 !important; }
          .label-doc img, .label-doc svg { filter: none !important; image-rendering: pixelated !important; shape-rendering: crispEdges !important; }
        }
        .label-doc { font-family: 'Arial Black', Arial, Helvetica, sans-serif; font-weight: 700; width: ${isPickup ? "105mm" : "100mm"}; min-height: ${isPickup ? "148mm" : "150mm"}; margin: 0 auto; box-sizing: border-box; overflow-wrap: break-word; }
      `}</style>

      <div className="min-h-screen bg-muted py-6 px-4">
        <div className="max-w-md mx-auto space-y-3">
          <div className="no-print flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Etiqueta de {isPickup ? "retirada" : "envio (padrão Correios)"}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
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

function ShippingLabel({ o }: { o: any; items: any[] }) {
  const orderCode = o.id.slice(0, 8).toUpperCase();
  return (
    <div className="label-doc bg-white text-black p-3">
      <LabelHeader
        title="ENTREGA EM DOMICÍLIO"
        subtitle="Pedido shopbox"
        icon={<Truck className="h-5 w-5 inline" />}
      />

      <div className="border-2 border-black rounded-md p-2 mt-1 text-center">
        <div className="text-[10px] font-black uppercase tracking-widest">Nº do Pedido</div>
        <div className="font-black text-2xl tracking-[0.2em] leading-tight">#{orderCode}</div>
        <div className="flex justify-center mt-1">
          <Barcode value={barcodeValue(o.id)} height={40} width={1.9} fontSize={10} />
        </div>
        <div className="text-[9px] mt-0.5 font-bold uppercase">Informe este número ao retirar / entregar</div>
      </div>

      <Row label="Destinatário">
        <div className="font-black text-base uppercase leading-tight">{o.customer_name}</div>
        {o.customer_phone && (
          <div className="text-sm font-bold mt-1">📱 {formatPhone(o.customer_phone)}</div>
        )}
      </Row>

      <Row label="Endereço de entrega">
        <div className="text-sm leading-snug font-bold">
          {o.shipping_street}, {o.shipping_number}
        </div>
        {o.shipping_complement && (
          <div className="text-sm leading-snug font-bold">Compl.: {o.shipping_complement}</div>
        )}
        {o.shipping_district && (
          <div className="text-sm leading-snug font-bold">Bairro: {o.shipping_district}</div>
        )}
        <div className="text-sm leading-snug font-bold">
          {o.shipping_city} / {o.shipping_state}
        </div>
        <div className="text-lg font-black tracking-widest mt-1">CEP: {formatCep(o.shipping_zip)}</div>
      </Row>

      <div className="text-[10px] text-center mt-2 pt-1 border-t-2 border-dashed border-black font-bold">
        Pedido #{orderCode} · Emitido em {new Date(o.created_at).toLocaleDateString("pt-BR")} · shopbox
      </div>
    </div>
  );
}

function PickupLabel({ o, items }: { o: any; items: any[] }) {
  const fullCode = o.id.replace(/-/g, "").slice(0, 14).toUpperCase();
  const shortCode = o.id.slice(0, 6).toUpperCase();
  return (
    <div className="label-doc bg-white text-black p-3">
      <div className="pb-1">
        <img src={shopboxLogo} alt="shopbox" className="h-8 w-auto" />
      </div>

      <div className="border-t-2 border-black pt-2">
        <div className="text-[10px] font-bold uppercase">Senha do pedido</div>
        <div className="text-center">
          <div className="font-black text-3xl tracking-[0.25em] mt-0.5">{shortCode}</div>
          <div className="flex justify-center mt-1">
            <Barcode value={barcodeValue(o.id)} height={38} width={1.7} fontSize={10} />
          </div>
          <div className="text-[10px] mt-0.5">{fullCode}</div>
        </div>
        <div className="text-[11px] mt-1 font-bold">Escaneie na expedição para confirmar a entrega</div>
        <div className="text-[11px] font-bold">Confira documento do cliente ao entregar</div>
      </div>

      <div className="border-t-2 border-black pt-1 mt-2">
        <div className="text-[11px] font-black uppercase tracking-wide">Cliente</div>
        <div className="font-bold text-sm uppercase">{o.customer_name}</div>
        {o.customer_cpf && <div className="text-xs font-bold">CPF: {formatCpf(o.customer_cpf)}</div>}
        {o.customer_phone && <div className="text-xs">WhatsApp: {formatPhone(o.customer_phone)}</div>}
        {o.customer_email && <div className="text-[11px]">{o.customer_email}</div>}
      </div>

      <div className="border-t-2 border-black pt-1 mt-2">
        <div className="text-[11px] font-black uppercase tracking-wide">
          Itens · Pedido #{o.id.slice(0, 8).toUpperCase()}
        </div>
        <ul className="text-xs leading-tight">
          {items.map((it: any, i: number) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                <strong>{it.quantity}x</strong> {it.product_name}
                {it.variant_color && <span className="ml-1 text-[10px] font-black uppercase">· {it.variant_color}</span>}
              </span>
              <span className="text-[11px] whitespace-nowrap">{brl(it.unit_price * it.quantity)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t-2 border-black pt-1 mt-1 flex justify-between font-black text-sm">
        <span>TOTAL PAGO</span>
        <span>{brl(Number(o.total))}</span>
      </div>

      <div className="border-t-2 border-black pt-1 mt-2">
        <div className="text-[11px] font-black uppercase tracking-wide">Local de retirada</div>
        <div className="text-xs font-bold mt-0.5">
          {STORE.street}, {STORE.number} — {STORE.district}, {STORE.city} / {STORE.state}
        </div>
        <div className="text-xs font-bold">Seg a Sáb · 9h às 18h · Dom · 10h às 16h</div>
      </div>

      <div className="text-[10px] text-center mt-2">
        Emitido em {new Date().toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

