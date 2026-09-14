import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * Modal de confirmação para exclusão DEFINITIVA de pedido.
 * Exige digitar os 8 caracteres finais do ID para habilitar o botão.
 * Ação separada visualmente do "Estornar" — botão em vermelho sólido.
 */
export function DeleteOrderDialog({
  orderId,
  busy,
  onClose,
  onConfirm,
}: {
  orderId: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const short = orderId.slice(0, 8).toUpperCase();
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toUpperCase() === short;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border-2 border-destructive/60 rounded-lg max-w-md w-full shadow-xl">
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="bg-destructive text-destructive-foreground rounded-md p-2">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="display text-lg text-destructive">Excluir pedido</h3>
              <p className="text-[11px] text-muted-foreground">
                Ação irreversível — registro financeiro será removido
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded hover:bg-secondary text-muted-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm">
            Você está prestes a <strong>apagar definitivamente</strong> o pedido{" "}
            <span className="font-mono font-bold text-destructive">#{short}</span>.
            Isso não pode ser desfeito.
          </p>
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-800 dark:text-amber-300">
            💡 Se o cliente quer o dinheiro de volta, use <strong>Estornar</strong> em vez de excluir.
            Excluir remove apenas o registro do pedido — não devolve o valor.
          </div>
          <label className="block text-xs font-bold uppercase tracking-wider text-destructive">
            Para confirmar, digite <span className="font-mono">{short}</span>:
          </label>
          <input
            type="text"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            placeholder={short}
            className="w-full px-3 py-2 rounded border border-destructive/40 bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-destructive uppercase"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 p-4 border-t border-border bg-secondary/40">
          <button
            onClick={onClose}
            disabled={busy}
            className="min-h-11 px-4 py-2 rounded border border-border bg-card text-sm font-bold hover:bg-secondary disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!ok || busy}
            className="min-h-11 px-4 py-2 rounded bg-destructive text-destructive-foreground text-sm font-semibold uppercase tracking-wide hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Excluindo…" : "Excluir definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}
