import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Printer, Download, AlertTriangle } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import shopboxLogo from "@/assets/shopbox-logo.png";

export const Route = createFileRoute("/etiqueta/fragil")({
  head: () => ({ meta: [{ title: "Etiqueta Frágil · shopbox" }] }),
  component: FragilPage,
});

function FragilPage() {
  const labelRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [qty, setQty] = useState(1);

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
      pdf.save(`etiqueta-fragil-x${qty}.pdf`);
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
          .label-doc .fragil-band { background: #E11D1D !important; color: #fff !important; }
          .label-doc .fragil-band * { color: #fff !important; }
        }
        .label-doc { font-family: 'Arial Black', Arial, Helvetica, sans-serif; font-weight: 900; width: 105mm; height: 148mm; margin: 0 auto; box-sizing: border-box; padding: 4mm; }
      `}</style>

      <div className="min-h-screen bg-muted py-6 px-4">
        <div className="max-w-md mx-auto space-y-3">
          <div className="no-print flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm text-muted-foreground">
              Etiqueta FRÁGIL · A6 (105×148 mm) — mesmo tamanho da colante de retirada
            </div>
            <div className="flex gap-2 items-center flex-wrap justify-end">
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
          </div>

          <div ref={labelRef}>
            <FragilLabel />
          </div>
        </div>
      </div>
    </>
  );
}

function FragilLabel() {
  return (
    <div className="label-doc bg-white text-black flex flex-col">
      <div className="flex items-center justify-between pb-1">
        <img src={shopboxLogo} alt="shopbox" className="h-7 w-auto" />
        <div className="text-[9px] font-black uppercase tracking-widest">Manuseio Especial</div>
      </div>

      <div
        className="fragil-band flex items-center justify-center gap-2 py-2 mt-1 rounded-sm"
        style={{ background: "#E11D1D", color: "#fff" }}
      >
        <AlertTriangle className="h-6 w-6" strokeWidth={3} />
        <span className="font-black text-4xl tracking-[0.15em] leading-none">FRÁGIL</span>
        <AlertTriangle className="h-6 w-6" strokeWidth={3} />
      </div>

      <div className="mt-2 border-4 border-black rounded-md flex-1 flex flex-col items-center justify-center px-2 py-2 text-center">
        <div className="text-[11px] font-black uppercase tracking-widest">Contém</div>
        <div className="font-black text-3xl tracking-widest leading-none mt-1">VIDRO</div>

        <div className="mt-3 flex items-end justify-center gap-4 w-full">
          {/* Copo quebrado - símbolo ISO 0621 (estilizado) */}
          <svg viewBox="0 0 64 80" className="h-20 w-16" fill="none" stroke="#000" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
            <path d="M14 10 L50 10 L46 70 L18 70 Z" />
            <path d="M22 20 L30 32 L26 42 L34 50 L28 62" />
          </svg>
          {/* Guarda-chuva - manter seco */}
          <svg viewBox="0 0 64 80" className="h-20 w-16" fill="none" stroke="#000" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
            <path d="M6 34 C 14 14, 50 14, 58 34" />
            <path d="M32 34 L32 66 C 32 72, 26 72, 26 66" />
            <path d="M14 34 C 18 26, 22 26, 24 34" />
            <path d="M40 34 C 42 26, 46 26, 50 34" />
            {/* gotas */}
            <path d="M12 8 l 2 4 -2 2 -2 -2 z" fill="#000" stroke="none" />
            <path d="M52 6 l 2 4 -2 2 -2 -2 z" fill="#000" stroke="none" />
            <path d="M32 2 l 2 4 -2 2 -2 -2 z" fill="#000" stroke="none" />
          </svg>
          {/* Seta este lado para cima */}
          <svg viewBox="0 0 64 80" className="h-20 w-16" fill="none" stroke="#000" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
            <path d="M32 6 L32 70" />
            <path d="M18 20 L32 6 L46 20" />
            <path d="M14 74 L50 74" />
          </svg>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 w-full text-[10px] font-black uppercase tracking-wider">
          <div>Não Quebre</div>
          <div>Mantenha Seco</div>
          <div>Este Lado ↑</div>
        </div>
      </div>

      <div
        className="fragil-band mt-2 py-1 text-center rounded-sm"
        style={{ background: "#E11D1D", color: "#fff" }}
      >
        <div className="font-black text-sm tracking-[0.2em]">MANUSEIE COM CUIDADO</div>
      </div>

      <div className="text-[9px] text-center mt-1 font-bold">
        shopbox · Não empilhar · Não jogar · Proteger de impactos
      </div>
    </div>
  );
}
