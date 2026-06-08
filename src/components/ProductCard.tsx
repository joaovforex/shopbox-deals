import { Link } from "@tanstack/react-router";
import { brl, discountPct } from "@/lib/format";
import type { Product } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const off = discountPct(product.original_price, product.price);
  return (
    <Link
      to="/produto/$id"
      params={{ id: product.id }}
      className="group relative flex flex-col bg-card rounded-lg overflow-hidden border border-border hover:border-primary transition-all hover:shadow-deal"
    >
      <div className="aspect-square bg-muted overflow-hidden relative">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Sem imagem
          </div>
        )}
        {off > 0 && (
          <div className="absolute top-2 left-2 bg-deal text-deal-foreground text-xs font-black px-2 py-1 rounded shadow-lg">
            -{off}%
          </div>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <span className="bg-destructive text-destructive-foreground px-3 py-1 text-xs font-bold uppercase rounded">
              Esgotado
            </span>
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <h3 className="text-sm font-semibold line-clamp-2 min-h-[2.5rem]">{product.name}</h3>
        {product.original_price && product.original_price > product.price && (
          <span className="text-xs text-muted-foreground line-through">{brl(product.original_price)}</span>
        )}
        <div className="text-lg font-black text-price">{brl(product.price)}</div>
        <div className="text-[11px] text-muted-foreground">ou no Pix com desconto</div>
      </div>
    </Link>
  );
}
