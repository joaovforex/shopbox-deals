export type VoucherReceipt = {
  voucherId: string;
  orderId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  orderTotal: number;
  amount: number;
  reason: string;
  operatorName: string;
  createdAt: string;
  items: { name: string; color: string | null; quantity: number; unitPrice: number; subtotal: number }[];
};

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printVoucherReceipt(r: VoucherReceipt) {
  const itemsHtml = r.items
    .map(
      (it) => `
        <li>
          <strong>${it.quantity}x</strong> ${escapeHtml(it.name)}
          ${it.color ? `<span class="muted"> · ${escapeHtml(it.color)}</span>` : ""}
          <span class="right">${brl(it.subtotal ?? it.unitPrice * it.quantity)}</span>
        </li>`,
    )
    .join("");

  const expiresAt = new Date(new Date(r.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Vale-Troca · #${r.voucherId.slice(0, 8).toUpperCase()}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: "Courier New", Courier, monospace;
    color: #000; background: #fff;
    font-weight: 700;
  }
  .receipt { width: 80mm; padding: 6mm 5mm; }
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
  .notice {
    border: 1.5px dashed #000; padding: 2mm; font-size: 8.5pt;
    margin: 2mm 0; text-align: center; line-height: 1.4;
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
    <h1>Vale-Troca</h1>
    <div class="sub">shopbox · Crédito em Cashback</div>

    <div class="hr"></div>
    <div class="row"><span class="lbl">Vale nº</span><span>#${r.voucherId.slice(0, 8).toUpperCase()}</span></div>
    <div class="row"><span class="lbl">Pedido</span><span>#${r.orderId.slice(0, 8).toUpperCase()}</span></div>
    <div class="row"><span class="lbl">Data</span><span>${new Date(r.createdAt).toLocaleString("pt-BR")}</span></div>

    <div class="hr"></div>
    <div class="block">
      <div class="ttl">Cliente</div>
      <div>${escapeHtml(r.customerName || "—")}</div>
      ${r.customerPhone ? `<div class="small">Tel: ${escapeHtml(r.customerPhone)}</div>` : ""}
      ${r.customerEmail ? `<div class="small">${escapeHtml(r.customerEmail)}</div>` : ""}
    </div>

    <div class="hr"></div>
    <div class="block">
      <div class="ttl">Produto(s) devolvido(s)</div>
      <ul>${itemsHtml || "<li>—</li>"}</ul>
    </div>

    <div class="hr"></div>
    <div class="row"><span class="lbl">Total do pedido</span><span>${brl(r.orderTotal)}</span></div>

    <div class="big">CRÉDITO ${brl(r.amount)}</div>

    <div class="notice">
      Uso exclusivo no site shopbox<br/>
      Válido até <strong>${expiresAt.toLocaleDateString("pt-BR")}</strong><br/>
      (30 dias a partir da emissão)
    </div>

    <div class="block">
      <div class="ttl">Motivo do vale-troca</div>
      <div class="reason">${escapeHtml(r.reason)}</div>
    </div>

    <div class="footer">
      <div class="small">Vale-troca emitido por</div>
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
    alert("Permita pop-ups para imprimir o vale-troca.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
