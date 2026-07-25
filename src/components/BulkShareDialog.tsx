import { useState } from "react";
import { Share2, X, Check, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import type { Product } from "@/lib/products";
import { buildShareText, shareProduct } from "@/lib/share-product";

const buildText = (p: Product) => buildShareText(p);
const shareOne = (p: Product) => shareProduct(p);


export function BulkShareDialog({
  products,
  onClose,
}: {
  products: Product[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const total = products.length;
  const current = products[idx];

  const handleShareCurrent = async () => {
    if (!current) return;
    await shareOne(current);
    setDone((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
    if (idx < total - 1) setIdx(idx + 1);
  };

  const handleCopyAll = async () => {
    const text = products.map(buildText).join("\n\n———\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${total} produtos copiados. Cole no grupo do WhatsApp.`);
    } catch {
      toast.error("Não foi possível copiar. Use o compartilhamento individual.");
    }
  };

  const handleOpenSingleWhatsApp = () => {
    // Fallback: abre wa.me com todos concatenados em uma mensagem
    const text = products.map(buildText).join("\n\n———\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (total === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-lg rounded-lg border border-border shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-black uppercase tracking-wider text-sm flex items-center gap-2">
              <Share2 className="h-4 w-4 text-[#25D366]" /> Compartilhar em massa
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {done.size} de {total} enviado{done.size === 1 ? "" : "s"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {current && (
            <div className="bg-secondary/40 rounded-lg p-3 mb-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">
                Próximo · {idx + 1}/{total}
              </div>
              <div className="flex gap-3">
                {current.image_url && (
                  <img src={current.image_url} alt="" className="h-20 w-20 object-cover rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{current.name}</div>
                  <div className="text-price font-bold">{brl(current.price)}</div>
                  {current.category && (
                    <div className="text-xs text-muted-foreground">{current.category}</div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleShareCurrent}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-[#25D366] text-white font-black uppercase tracking-wider px-4 py-3 rounded-md text-sm hover:opacity-90"
              >
                <Share2 className="h-4 w-4" />
                Compartilhar agora
                {idx < total - 1 && <ChevronRight className="h-4 w-4" />}
              </button>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                Escolha o grupo no WhatsApp. Ao voltar, clique novamente para o próximo.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            {products.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 text-xs p-2 rounded ${
                  i === idx ? "bg-primary/10" : ""
                }`}
              >
                <div className="w-5 flex justify-center">
                  {done.has(p.id) ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <span className="text-muted-foreground">{i + 1}</span>
                  )}
                </div>
                <span className={`flex-1 truncate ${done.has(p.id) ? "line-through text-muted-foreground" : ""}`}>
                  {p.name}
                </span>
                <span className="text-muted-foreground">{brl(p.price)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-border grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex items-center justify-center gap-2 bg-card border border-border font-bold uppercase tracking-wider px-3 py-2 rounded-md text-xs hover:bg-secondary"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar tudo
          </button>
          <button
            type="button"
            onClick={handleOpenSingleWhatsApp}
            className="inline-flex items-center justify-center gap-2 bg-secondary font-bold uppercase tracking-wider px-3 py-2 rounded-md text-xs hover:bg-secondary/80"
          >
            <Share2 className="h-3.5 w-3.5" /> 1 msg com todos
          </button>
        </div>
      </div>
    </div>
  );
}
