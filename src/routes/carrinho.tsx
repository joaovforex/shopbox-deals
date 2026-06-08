import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, Minus, Plus, MessageCircle, ShoppingBag } from "lucide-react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { useCart } from "@/lib/cart";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/carrinho")({
  head: () => ({ meta: [{ title: "Carrinho · shopbox" }] }),
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove, total, clear } = useCart();

  const waMessage = `Olá! Quero finalizar este pedido na shopbox:\n\n${items
    .map((i) => `• ${i.quantity}x ${i.name} — ${brl(i.price * i.quantity)}`)
    .join("\n")}\n\n*Total: ${brl(total)}*\n\nForma de pagamento: (Pix / Cartão)`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-8">
          <h1 className="display text-4xl">Seu carrinho</h1>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 flex-1">
        {items.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-lg border border-border">
            <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="display text-2xl mb-2">Carrinho vazio</h2>
            <p className="text-muted-foreground mb-4">Adicione produtos para continuar.</p>
            <Link to="/loja" className="inline-flex bg-primary text-primary-foreground font-bold uppercase tracking-wider px-6 py-3 rounded-md">
              Ver ofertas
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1fr_360px] gap-8">
            <ul className="space-y-3">
              {items.map((i) => (
                <li key={i.id} className="flex gap-4 bg-card border border-border rounded-lg p-3">
                  <div className="h-24 w-24 rounded-md bg-muted overflow-hidden flex-shrink-0">
                    {i.image_url && <img src={i.image_url} alt={i.name} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <Link to="/produto/$id" params={{ id: i.id }} className="font-semibold hover:text-primary line-clamp-2">{i.name}</Link>
                    <div className="text-price font-black">{brl(i.price)}</div>
                    <div className="flex items-center gap-2 mt-auto">
                      <div className="inline-flex items-center bg-secondary rounded-md">
                        <button onClick={() => setQty(i.id, i.quantity - 1)} className="p-1.5 hover:bg-muted rounded-l-md" aria-label="Diminuir"><Minus className="h-3.5 w-3.5" /></button>
                        <span className="px-3 text-sm font-bold">{i.quantity}</span>
                        <button onClick={() => setQty(i.id, i.quantity + 1)} className="p-1.5 hover:bg-muted rounded-r-md" aria-label="Aumentar"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                      <button onClick={() => remove(i.id)} className="ml-auto text-destructive hover:bg-destructive/10 p-2 rounded-md" aria-label="Remover">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              <button onClick={clear} className="text-xs text-muted-foreground hover:text-destructive">Esvaziar carrinho</button>
            </ul>

            <aside className="bg-card border border-border rounded-lg p-5 h-fit lg:sticky lg:top-24 space-y-4">
              <h2 className="display text-xl">Resumo do pedido</h2>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{brl(total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Frete</span>
                <span className="font-semibold">A combinar</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between items-baseline">
                <span className="font-bold">Total</span>
                <span className="display text-2xl text-price">{brl(total)}</span>
              </div>
              <a
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 bg-[#25D366] text-black font-black uppercase tracking-wider px-4 py-3 rounded-md hover:opacity-90"
              >
                <MessageCircle className="h-5 w-5" /> Finalizar no WhatsApp
              </a>
              <p className="text-xs text-muted-foreground text-center">
                Pagamento via Pix, cartão ou parcelado direto com o vendedor.
              </p>
            </aside>
          </div>
        )}
      </section>

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
