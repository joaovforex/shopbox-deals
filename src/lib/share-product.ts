import { toast } from "sonner";
import { brl, discountPct } from "@/lib/format";
import { optimizedImage } from "@/lib/image-url";
import { installmentLabel } from "@/lib/installments";

export type ShareableProduct = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  original_price?: number | null;
  stock?: number | null;
  image_url?: string | null;
  cashback_percent?: number | null;
};

export function buildShareText(p: ShareableProduct): string {
  const url = `${window.location.origin}/produto/${p.id}`;
  const off = discountPct(p.original_price ?? null, p.price);
  const lines: (string | null)[] = [`🔥 *${p.name}*`];

  if (p.original_price && p.original_price > p.price) {
    lines.push(`De ~${brl(p.original_price)}~ por *${brl(p.price)}*${off > 0 ? ` (${off}% OFF!)` : ""}`);
  } else {
    lines.push(`Por *${brl(p.price)}*${off > 0 ? ` (${off}% OFF!)` : ""}`);
  }

  const installment = installmentLabel(p.price);
  if (installment) {
    lines.push(`💳 *${installment}*`);
  }

  if (typeof p.cashback_percent === "number" && p.cashback_percent > 0) {
    lines.push(`💸 ${p.cashback_percent}% de cashback pra usar na próxima compra`);
  }

  if (p.description) {
    lines.push("");
    lines.push(p.description);
  }

  lines.push("");
  if (typeof p.stock === "number") {
    lines.push(
      p.stock > 0
        ? `📦 ${p.stock} ${p.stock === 1 ? "peça" : "peças"} em estoque`
        : "❌ Sem estoque no momento",
    );
  }
  lines.push("");
  lines.push("COMPRE NO LINK ABAIXO:");
  lines.push(`👇 ${url}`);

  return lines.filter((l) => l !== null).join("\n");
}

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

async function fetchImageFile(p: ShareableProduct): Promise<File | null> {
  if (!p.image_url) return null;
  const candidates = [
    optimizedImage(p.image_url, { width: 1200, quality: 80 }),
    p.image_url,
  ];
  for (const src of candidates) {
    try {
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.size) continue;
      const type = blob.type || "image/jpeg";
      const ext = (type.split("/")[1] || "jpg").split("+")[0];
      const safe =
        p.name.replace(/[^\w]+/g, "-").toLowerCase().slice(0, 40) || "produto";
      return new File([blob], `${safe}.${ext}`, { type });
    } catch {
      // tenta próximo
    }
  }
  return null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Converte qualquer imagem para PNG (formato aceito pela área de transferência). */
async function toPngBlob(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  }
}

/**
 * Copia foto + texto juntos: um único ClipboardItem com image/png e text/plain.
 * No WhatsApp Web o primeiro Ctrl+V anexa a foto e o segundo (na legenda) cola o texto.
 */
async function copyImageWithText(file: File, text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    const png = await toPngBlob(file);
    if (!png) return false;
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": png,
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

function triggerImageDownload(file: File) {
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {}
}

/**
 * Compartilha produto com foto sempre que possível.
 * - Mobile: Web Share API com arquivo de imagem (Canal aparece na sheet).
 * - Desktop: baixa a imagem + copia o texto e abre WhatsApp Web
 *   (WhatsApp Web NÃO anexa foto via URL — o admin arrasta a imagem baixada).
 * Retorna true se o fluxo foi concluído (mesmo que via fallback), false se cancelado.
 */
export async function shareProduct(p: ShareableProduct): Promise<boolean> {
  const text = buildShareText(p);
  const url = `${window.location.origin}/produto/${p.id}`;
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as unknown as {
          share?: (data: ShareData) => Promise<void>;
          canShare?: (data: ShareData) => boolean;
        })
      : null;

  const file = await fetchImageFile(p);

  // 1) Tenta Web Share com arquivo (celular = Canal aparece na sheet)
  if (nav?.share && file) {
    const payload: ShareData = { files: [file], text, title: p.name };
    const canShareFiles = nav.canShare ? nav.canShare({ files: [file] }) : true;
    if (canShareFiles) {
      try {
        await nav.share(payload);
        return true;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return false;
      }
    }
  }

  // 2) Web Share sem arquivo (mobile sem suporte a files)
  if (nav?.share && isMobile()) {
    try {
      await nav.share({ title: p.name, text, url });
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
    }
  }

  // 3) Desktop: copia foto + texto juntos (mesmo conteúdo do celular, em um só item)
  if (file) {
    const bundled = await copyImageWithText(file, text);
    if (bundled) {
      toast.success(
        "Foto e texto copiados juntos. No WhatsApp Web: Ctrl+V para anexar a foto e Ctrl+V de novo na legenda para o texto.",
        { duration: 9000 },
      );
      try {
        window.open(`https://web.whatsapp.com/`, "_blank", "noopener,noreferrer");
      } catch {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
      }
      return true;
    }
  }

  // 4) Último recurso: baixa a foto + copia o texto
  const copied = await copyText(text);
  if (file) triggerImageDownload(file);

  if (file && copied) {
    toast.success(
      "Baixamos a imagem e copiamos o texto — arraste a imagem para o Canal e cole o texto na legenda.",
      { duration: 9000 },
    );
  } else if (file) {
    toast.info(
      "Imagem baixada. Arraste para o Canal do WhatsApp e cole o texto do produto.",
      { duration: 8000 },
    );
  } else if (copied) {
    toast.info("Texto copiado. Cole no Canal do WhatsApp.", { duration: 6000 });
  } else {
    toast.info("Abrindo o WhatsApp Web...", { duration: 4000 });
  }

  try {
    window.open(`https://web.whatsapp.com/`, "_blank", "noopener,noreferrer");
  } catch {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }
  return true;
}
