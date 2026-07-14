import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Printer, Download, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import shopboxLogo from "@/assets/shopbox-logo.png";

export const Route = createFileRoute("/etiqueta/qrcode")({
  head: () => ({ meta: [{ title: "Etiqueta QR Code · shopbox" }] }),
  component: QrCodeLabelPage,
});

function QrCodeLabelPage() {
  const labelRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [qty, setQty] = useState(1);

  const defaultUrl = useMemo(() => {
    if (typeof window === "undefined") return "https://shopboxonline.com/loja";
    return `${window.location.origin}/loja`;
  }, []);
  const [url, setUrl] = useState(defaultUrl);
  const [title, setTitle] = useState("Visite nossa loja");
  const [subtitle, setSubtitle] = useState("Aponte a câmera do celular");

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
      const pdf = new jsPDF({ unit: "mm", format: "a6", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 2;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const ratio = canvas.width / canvas.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      for (let i = 0; i < qty; i++) {
        if (i > 0) pdf.addPage("a6", "portrait");
        pdf.addImage(img, "JPEG", (pageW - w) / 2, margin, w, h);
      }
      pdf.save(`etiqueta-qrcode-x${qty}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <style>{`
        @page { size: A6; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { width: 105mm !important; height: 148mm !important; background: white !important; color: #000 !important; margin: 0 !important; padding: 0 !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
          body * { visibility: hidden !important; }
          .label-doc, .label-doc * { visibility: visible !important; }
          .label-doc { position: fixed !important; left: 0 !important; top: 0 !important; width: 105mm !important; height: 148mm !important; padding: 4mm !important; margin: 0 !important; box-sizing: border-box !important; background: white !important; color: #000 !important; font-family: 'Arial Black', Arial, Helvetica, sans-serif !important; font-weight: 900 !important; overflow: hidden !important; page-break-after: avoid !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
        }
        .label-doc { font-family: 'Arial Black', Arial, Helvetica, sans-serif; font-weight: 900; width: 105mm; height: 148mm; margin: 0 auto; box-sizing: border-box; padding: 4mm; }
      `}</style>

      <div className="min-h-screen bg-muted py-6 px-4">
        <div className="max-w-md mx-auto space-y-3">
          <div className="no-print space-y-2 bg-card border border-border rounded-md p-3">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <QrCode className="h-3.5 w-3.5" /> Etiqueta QR Code · A6 (105×148 mm)
            </div>
            <label className="block text-xs">
              <span className="font-bold uppercase tracking-wider">URL de destino</span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1 w-full border border-border rounded px-2 py-1 text-sm"
                placeholder="https://sua-loja.com/loja"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="font-bold uppercase tracking-wider">Título</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full border border-border rounded px-2 py-1 text-sm"
                />
              </label>
              <label className="block text-xs">
                <span className="font-bold uppercase tracking-wider">Subtítulo</span>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="mt-1 w-full border border-border rounded px-2 py-1 text-sm"
                />
              </label>
            </div>
          </div>

          <div className="no-print flex items-center justify-end gap-2 flex-wrap">
            <label className="text-xs font-bold uppercase tracking-wider">
              Qtd:
              <input
                type="number"
                min={1}
                max={50}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="ml-1 w-14 border border-border rounded px-2 py-1 text-sm"
              />
            </label>
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

          <div ref={labelRef}>
            <QrLabel url={url} title={title} subtitle={subtitle} />
          </div>
        </div>
      </div>
    </>
  );
}

function QrLabel({ url, title, subtitle }: { url: string; title: string; subtitle: string }) {
  const displayUrl = url.replace(/^https?:\/\//, "");
  return (
    <div className="label-doc bg-white text-black flex flex-col">
      <div className="flex items-center justify-between pb-1">
        <img src={shopboxLogo} alt="shopbox" className="h-7 w-auto" />
        <div className="text-[9px] font-black uppercase tracking-widest">Acesse & Compre</div>
      </div>

      <div className="mt-1 border-4 border-black rounded-md flex-1 flex flex-col items-center justify-center px-2 py-3 text-center">
        <div className="font-black text-lg tracking-wider leading-tight uppercase">{title}</div>
        <div className="text-[10px] font-bold uppercase tracking-widest mt-0.5">{subtitle}</div>

        <div className="mt-2 bg-white p-2 border-2 border-black rounded">
          <QRCodeSVG
            value={url || "https://shopboxonline.com/loja"}
            size={240}
            level="H"
            marginSize={0}
            fgColor="#000000"
            bgColor="#ffffff"
          />
        </div>

        <div className="mt-2 text-[10px] font-black uppercase tracking-widest break-all px-2">
          {displayUrl}
        </div>
      </div>

      <div
        className="mt-2 py-1 text-center rounded-sm"
        style={{ background: "#000", color: "#fff" }}
      >
        <div className="font-black text-sm tracking-[0.2em]">shopbox online</div>
      </div>

      <div className="text-[9px] text-center mt-1 font-bold">
        Aponte a câmera · Toque no link · Compre em segundos
      </div>
    </div>
  );
}
