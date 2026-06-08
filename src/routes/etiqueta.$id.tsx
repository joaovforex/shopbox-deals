import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Printer, Truck, Store, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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

const STORE = {
  name: "shopbox",
  street: "Rua Principal",
  number: "2996",
  district: "Centro",
  city: "Colombo",
  state: "PR",
  zip: "83405-000",
};

function LabelPage() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["label", id],
    queryFn: async () => {
      const { data: order, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);
      return { order, items: items ?? [] };
    },
  });

  useEffect(() => {
    if (data?.order) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (isLoading) return <div className="p-10 text-center">Carregando etiqueta...</div>;
  if (!data?.order) return <div className="p-10 text-center">Pedido não encontrado.</div>;

  const o = data.order as any;
  const isPickup = o.delivery_method === "pickup";
  const labelRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

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
      // A6: 105 x 148 mm
      const pdf = new jsPDF({ unit: "mm", format: "a6", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 6;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = canvas.width / canvas.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      pdf.addImage(img, "JPEG", (pageW - w) / 2, margin, w, h);
      pdf.save(`etiqueta-${isPickup ? "retirada" : "envio"}-${o.id.slice(0, 8)}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A6; margin: 8mm; }
          body { background: white !important; }
        }
        .label-doc { font-family: 'Courier New', 'Monaco', monospace; }
      `}</style>

      <div className="min-h-screen bg-muted py-6 px-4">
        <div className="max-w-md mx-auto">
          <div className="no-print mb-4 flex items-center justify-between gap-2">
            <div className="text-sm text-muted-foreground">
              Etiqueta de {isPickup ? "retirada" : "envio (padrão Correios)"}
            </div>
            <div className="flex gap-2">
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

          <div ref={labelRef}>
            {isPickup ? <PickupLabel o={o} items={data.items} /> : <ShippingLabel o={o} items={data.items} />}
          </div>
        </div>
      </div>
    </>
  );
}

function ShippingLabel({ o, items }: { o: any; items: any[] }) {
  return (
    <div className="label-doc bg-white text-black border-2 border-black p-4 space-y-3">
      <div className="border-2 border-black p-2 flex items-center justify-between">
        <div>
          <div className="font-black text-lg tracking-wider">CORREIOS</div>
          <div className="text-[10px] uppercase">Encomenda · PAC</div>
        </div>
        <div className="text-right">
          <Truck className="h-6 w-6 inline" />
          <div className="text-[10px] font-bold">ENVIO</div>
        </div>
      </div>

      <div className="border border-black px-2 py-3 text-center">
        <div className="text-[10px] font-bold">CÓDIGO DE RASTREIO</div>
        <div className="font-mono text-sm tracking-widest">BR{o.id.replace(/-/g, "").slice(0, 9).toUpperCase()}BR</div>
        <div className="flex items-end justify-center gap-px h-8 mt-1">
          {Array.from({ length: 60 }).map((_, i) => (
            <span
              key={i}
              className="bg-black"
              style={{ width: ((i * 7) % 3) + 1, height: "100%" }}
            />
          ))}
        </div>
      </div>

      <div className="border border-black p-2">
        <div className="text-[10px] font-bold uppercase border-b border-black mb-1 pb-0.5">Destinatário</div>
        <div className="font-bold text-sm uppercase">{o.customer_name}</div>
        <div className="text-xs leading-tight mt-1">
          {o.shipping_street}, {o.shipping_number}
          {o.shipping_complement ? ` — ${o.shipping_complement}` : ""}
        </div>
        {o.shipping_district && <div className="text-xs leading-tight">Bairro: {o.shipping_district}</div>}
        <div className="text-xs leading-tight">
          {o.shipping_city} / {o.shipping_state}
        </div>
        <div className="text-base font-black tracking-widest mt-1">
          CEP: {formatCep(o.shipping_zip)}
        </div>
        {o.customer_phone && (
          <div className="text-[10px] mt-1">Tel: {formatPhone(o.customer_phone)}</div>
        )}
      </div>

      <div className="border border-black p-2">
        <div className="text-[10px] font-bold uppercase border-b border-black mb-1 pb-0.5">Remetente</div>
        <div className="font-bold text-xs uppercase">{STORE.name}</div>
        <div className="text-[11px] leading-tight">
          {STORE.street}, {STORE.number} — {STORE.district}
        </div>
        <div className="text-[11px] leading-tight">{STORE.city} / {STORE.state}</div>
        <div className="text-[11px] font-bold">CEP: {STORE.zip}</div>
      </div>

      <div className="border border-black p-2">
        <div className="text-[10px] font-bold uppercase mb-1">Conteúdo · Pedido #{o.id.slice(0, 8).toUpperCase()}</div>
        <ul className="text-[11px] leading-tight">
          {items.map((it: any, i: number) => (
            <li key={i}>• {it.quantity}x {it.product_name}</li>
          ))}
        </ul>
        <div className="text-[10px] mt-1 border-t border-dashed border-black pt-1 flex justify-between">
          <span>Valor declarado: {brl(Number(o.total))}</span>
          <span>{new Date(o.created_at).toLocaleDateString("pt-BR")}</span>
        </div>
      </div>
    </div>
  );
}

function PickupLabel({ o, items }: { o: any; items: any[] }) {
  return (
    <div className="label-doc bg-white text-black border-2 border-black p-4 space-y-3">
      <div className="border-2 border-black p-2 flex items-center justify-between bg-black text-white">
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
        {o.customer_phone && (
          <div className="text-xs mt-1">WhatsApp: {formatPhone(o.customer_phone)}</div>
        )}
        {o.customer_email && (
          <div className="text-[11px]">{o.customer_email}</div>
        )}
      </div>

      <div className="border border-black p-2">
        <div className="text-[10px] font-bold uppercase border-b border-black mb-1 pb-0.5">
          Itens · Pedido #{o.id.slice(0, 8).toUpperCase()}
        </div>
        <ul className="text-sm leading-tight space-y-0.5">
          {items.map((it: any, i: number) => (
            <li key={i} className="flex justify-between gap-2">
              <span><strong>{it.quantity}x</strong> {it.product_name}</span>
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
          {STORE.city} / {STORE.state} · Seg a Sáb · 9h às 18h
        </div>
      </div>

      <div className="text-[10px] text-center text-gray-600">
        Emitido em {new Date().toLocaleString("pt-BR")}
      </div>
    </div>
  );
}
