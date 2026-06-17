export type RefundReceipt = {
  orderId: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  paymentMethod: string | null;
  orderTotal: number;
  refundedAmount: number;
  isFull: boolean;
  reason: string;
  operatorName: string;
  refundedAt: string;
  mpRefundId: string;
  items: { name: string; color: string | null; quantity: number; unitPrice: number }[];
};

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function paymentLabel(m: string | null | undefined): string {
  if (!m) return "—";
  const s = m.toLowerCase();
  if (s.includes("pix")) return "PIX";
  if (s.includes("credit") || s.includes("credito") || s.includes("crédito")) return "Cartão de Crédito";
  if (s.includes("debit") || s.includes("debito") || s.includes("débito")) return "Cartão de Débito";
  if (s.includes("boleto") || s.includes("ticket")) return "Boleto";
  if (s.includes("money") || s.includes("dinheiro")) return "Dinheiro";
  return m.toUpperCase();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printRefundReceipt(r: RefundReceipt) {
  const itemsHtml = r.items
    .map(
      (it) => `
        <li>
          <strong>${it.quantity}x</strong> ${escapeHtml(it.name)}
          ${it.color ? `<span class="muted"> · ${escapeHtml(it.color)}</span>` : ""}
          <span class="right">${brl(it.unitPrice * it.quantity)}</span>
        </li>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Comprovante de Estorno · #${r.orderId.slice(0, 8).toUpperCase()}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: "Courier New", Courier, monospace;
    color: #000; background: #fff;
    font-weight: 700;
  }
  .receipt {
    width: 80mm;
    padding: 6mm 5mm;
  }
  h1 {
    font-size: 14pt; text-align: center; margin: 0 0 2mm 0;
    letter-spacing: 2px; text-transform: uppercase;
  }
  .sub {
    text-align: center; font-size: 9pt; margin-bottom: 3mm;
    text-transform: uppercase; letter-spacing: 1px;
  }
  .hr { border-top: 2px dashed #000; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; font-size: 9pt; padding: 0.5mm 0; gap: 4mm; }
  .row .lbl { text-transform: uppercase; }
  .block { font-size: 9pt; padding: 1mm 0; line-height: 1.35; }
  .block .ttl { font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; }
  ul { list-style: none; padding: 0; margin: 0; font-size: 9pt; }
  ul li { padding: 0.5mm 0; position: relative; padding-right: 18mm; }
  ul li .right { position: absolute; right: 0; }
  .muted { opacity: 0.7; }
  .big {
    text-align: center;
    font-size: 16pt;
    font-weight: 900;
    padding: 2mm 0;
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    margin: 2mm 0;
    letter-spacing: 1px;
  }
  .reason {
    border: 1.5px solid #000; padding: 2mm; font-size: 9pt;
    min-height: 12mm; white-space: pre-wrap; word-break: break-word;
  }
  .footer {
    margin-top: 4mm; padding-top: 2mm;
    border-top: 2px solid #000; text-align: center;
    font-size: 9pt;
  }
  .footer .by { font-size: 10pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
  .small { font-size: 7.5pt; opacity: 0.8; }
  @media print {
    html, body { background: #fff !important; }
    .receipt { padding: 4mm 4mm; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <h1>Comprovante de Estorno</h1>
    <div class="sub">shopbox · ${r.isFull ? "Reembolso Total" : "Reembolso Parcial"}</div>

    <div class="hr"></div>
    <div class="row"><span class="lbl">Pedido</span><span>#${r.orderId.slice(0, 8).toUpperCase()}</span></div>
    <div class="row"><span class="lbl">Data</span><span>${new Date(r.refundedAt).toLocaleString("pt-BR")}</span></div>
    ${r.mpRefundId ? `<div class="row"><span class="lbl">Estorno MP</span><span>${escapeHtml(r.mpRefundId)}</span></div>` : ""}

    <div class="hr"></div>
    <div class="block">
      <div class="ttl">Cliente</div>
      <div>${escapeHtml(r.customerName || "—")}</div>
      ${r.customerPhone ? `<div class="small">Tel: ${escapeHtml(r.customerPhone)}</div>` : ""}
      ${r.customerEmail ? `<div class="small">${escapeHtml(r.customerEmail)}</div>` : ""}
    </div>

    <div class="hr"></div>
    <div class="block">
      <div class="ttl">Produto(s)</div>
      <ul>${itemsHtml || "<li>—</li>"}</ul>
    </div>

    <div class="hr"></div>
    <div class="row"><span class="lbl">Total do pedido</span><span>${brl(r.orderTotal)}</span></div>
    <div class="row"><span class="lbl">Forma de pagamento</span><span>${escapeHtml(paymentLabel(r.paymentMethod))}</span></div>

    <div class="big">ESTORNADO ${brl(r.refundedAmount)}</div>

    <div class="block">
      <div class="ttl">Motivo do estorno</div>
      <div class="reason">${escapeHtml(r.reason)}</div>
    </div>

    <div class="footer">
      <div class="small">Estorno realizado por</div>
      <div class="by">${escapeHtml(r.operatorName || "—")}</div>
      <div class="small" style="margin-top:2mm">Documento emitido automaticamente — guardar com a contabilidade</div>
    </div>
  </div>
  <script>
    window.addEventListener("load", function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 150);
    });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    alert("Permita pop-ups para imprimir o comprovante de estorno.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
