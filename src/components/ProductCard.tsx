import { Link } from "@tanstack/react-router";
import { brl, discountPct } from "@/lib/format";
import type { Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const off = discountPct(product.original_price, product.price);
  const installments = product.price >= 50 ? Math.min(10, Math.floor(product.price / 20)) : 0;

  return (
    <Link
      to="/produto/$id"
      params={{ id: product.id }}
      className="group relative flex flex-col bg-card rounded-xl overflow-hidden border border-border hover:border-primary transition-all duration-300 hover:shadow-deal hover:-translate-y-1 active:scale-[0.98]"
    >
      <div className="aspect-square bg-muted overflow-hidden relative">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Sem imagem
          </div>
        )}

        {off > 0 && (
          <div className="absolute top-2 left-2 bg-deal text-deal-foreground text-[11px] font-black px-2 py-1 rounded-md shadow-lg -rotate-3">
            -{off}% OFF
          </div>
        )}

        {product.stock === 0 && (
          <div className="absolute inset-0 bg-background/85 flex items-center justify-center backdrop-blur-sm">
            <span className="bg-destructive text-destructive-foreground px-3 py-1 text-xs font-bold uppercase rounded">
              Esgotado
            </span>
          </div>
        )}

        {/* gradient overlay on hover */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="p-2.5 sm:p-3 flex-1 flex flex-col gap-1">
        <h3 className="text-xs sm:text-sm font-semibold line-clamp-2 min-h-[2.25rem] sm:min-h-[2.5rem] leading-snug">
          {product.name}
        </h3>
        {product.original_price && product.original_price > product.price && (
          <span className="text-[11px] text-muted-foreground line-through">
            {brl(product.original_price)}
          </span>
        )}
        <div className="text-base sm:text-lg font-black text-price leading-tight">
          {brl(product.price)}
        </div>
        <div className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight">
          {installments > 0 ? `${installments}x sem juros` : "ou no Pix com desconto"}
        </div>
      </div>
    </Link>
  );
}
