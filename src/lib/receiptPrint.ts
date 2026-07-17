// Impressão de comprovante simples para impressoras térmicas 80mm
// (padrão Elgin i9 Full e similares). Abre uma janela auxiliar, injeta
// HTML com CSS otimizado para 80mm e dispara window.print().

import { brl } from "./format";

export type ReceiptItem = { title: string; unit_price: number; quantity: number };

export type ReceiptData = {
  chargeId: string;
  items: ReceiptItem[];
  total: number;
  paidAt?: string | null;
  operator?: string | null;
  paymentMethod?: string | null;
  note?: string | null;
};

const STORE_NAME = "SHOPBOX";
const STORE_TAG = "Comprovante de venda (não fiscal)";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function methodLabel(id?: string | null): string {
  if (!id) return "—";
  const m = id.toLowerCase();
  if (m.includes("pix")) return "PIX";
  if (m.includes("visa")) return "Cartão · Visa";
  if (m.includes("master")) return "Cartão · Master";
  if (m.includes("elo")) return "Cartão · Elo";
  if (m.includes("amex")) return "Cartão · Amex";
  if (m.includes("hiper")) return "Cartão · Hipercard";
  if (m.includes("bolbradesco") || m.includes("boleto")) return "Boleto";
  if (m.includes("account_money")) return "Saldo Mercado Pago";
  return id;
}

export function buildReceiptHtml(data: ReceiptData): string {
  const dt = data.paidAt ? new Date(data.paidAt) : new Date();
  const dateStr = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
  const rows = data.items
    .map((it) => {
      const line = it.unit_price * it.quantity;
      return `
      <div class="row">
        <div class="row-title">${esc(it.title)}</div>
        <div class="row-info">
          <span>${it.quantity} x ${esc(brl(it.unit_price))}</span>
          <span>${esc(brl(line))}</span>
        </div>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Comprovante ${esc(data.chargeId.slice(0, 8))}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    font-family: "Courier New", Menlo, monospace;
    width: 80mm;
    padding: 4mm 3mm 6mm;
    font-size: 12px;
    line-height: 1.35;
  }
  .center { text-align: center; }
  .brand { font-size: 20px; font-weight: 900; letter-spacing: 2px; }
  .tag { font-size: 11px; margin-top: 2px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .kv { display: flex; justify-content: space-between; font-size: 11px; }
  .row { margin-bottom: 4px; }
  .row-title { font-weight: 700; word-break: break-word; }
  .row-info { display: flex; justify-content: space-between; font-size: 11px; }
  .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; }
  .foot { font-size: 10px; text-align: center; margin-top: 4px; }
  .id { font-size: 10px; text-align: center; word-break: break-all; }
  @media print { body { padding: 2mm; } }
</style></head>
<body>
  <div class="center brand">${esc(STORE_NAME)}</div>
  <div class="center tag">${esc(STORE_TAG)}</div>
  <div class="sep"></div>
  <div class="kv"><span>Data</span><span>${esc(dateStr)}</span></div>
  <div class="kv"><span>Pagamento</span><span>${esc(methodLabel(data.paymentMethod))}</span></div>
  ${data.operator ? `<div class="kv"><span>Operador</span><span>${esc(data.operator)}</span></div>` : ""}
  <div class="sep"></div>
  ${rows}
  <div class="sep"></div>
  <div class="total"><span>TOTAL</span><span>${esc(brl(data.total))}</span></div>
  ${data.note ? `<div class="sep"></div><div class="foot">${esc(data.note)}</div>` : ""}
  <div class="sep"></div>
  <div class="id">Ref: ${esc(data.chargeId)}</div>
  <div class="foot">Obrigado pela preferência!</div>
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 150);
    });
    window.addEventListener("afterprint", function () { window.close(); });
  </script>
</body></html>`;
}

export function printReceipt(data: ReceiptData): void {
  const html = buildReceiptHtml(data);
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) {
    // Popup bloqueado — abre em nova aba com data URL
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
