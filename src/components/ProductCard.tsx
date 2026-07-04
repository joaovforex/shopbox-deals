import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { brl, discountPct } from "@/lib/format";
import { productImages, useHasTeamRole, type Product, type ProductCard as ProductCardData } from "@/lib/products";
import { useCart } from "@/lib/cart";
import { useAuthUser, loginRedirectHref } from "@/lib/useAuthUser";
import { optimizedImage, optimizedSrcSet } from "@/lib/image-url";

export function ProductCard({ product, priority = false }: { product: Product | ProductCardData; priority?: boolean }) {
  const off = discountPct(product.original_price, product.price);
  const imgs = productImages(product);
  const cover = imgs[0];
  const { add } = useCart();
  const navigate = useNavigate();
  const user = useAuthUser();
  const isTeam = useHasTeamRole();
  const ageDays = (Date.now() - new Date(product.created_at).getTime()) / 86_400_000;
  const stale = isTeam && product.stock > 0 && ageDays > 5;

  const cartItem = {
    id: product.id,
    name: product.name,
    price: product.price,
    image_url: cover ?? null,
  };

  const requireLogin = (target: "/carrinho" | "/checkout") => {
    if (user) return false;
    toast.info("Crie sua conta ou entre para continuar");
    window.location.href = loginRedirectHref(target);
    return true;
  };

  const buyNow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.stock === 0) return;
    if (requireLogin("/checkout")) return;
    const result = await add(cartItem, 1);
    if (result === "ok") navigate({ to: "/checkout" });
  };

  return (
    <Link
      to="/produto/$id"
      params={{ id: product.id }}
      className="group relative flex flex-col bg-card rounded-xl overflow-hidden border border-border hover:border-foreground/30 transition-colors"
    >
      <div className="aspect-[4/5] bg-muted overflow-hidden relative">
        {cover ? (
          <img
            src={optimizedImage(cover, { width: 480, quality: 70 })}
            srcSet={optimizedSrcSet(cover, 480, 70)}
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            alt={product.name}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            width={480}
            height={600}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Sem imagem
          </div>
        )}

        {off > 0 && (
          <div className="absolute top-2 left-2 bg-deal text-deal-foreground text-[11px] font-semibold px-2 py-0.5 rounded">
            -{off}%
          </div>
        )}

        {stale && (
          <div className="absolute top-2 right-2 bg-background/90 text-destructive text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" title="Cadastrado há mais de 5 dias">
            +5d
          </div>
        )}

        {product.stock === 0 && (
          <div className="absolute inset-0 bg-background/85 flex items-center justify-center backdrop-blur-sm">
            <span className="bg-foreground text-background px-3 py-1 text-xs font-semibold uppercase rounded">
              Esgotado
            </span>
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4 flex-1 flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem] leading-snug">
          {product.name}
        </h3>

        <div className="mt-auto pt-1">
          {product.original_price && product.original_price > product.price && (
            <span className="block text-xs text-muted-foreground line-through">
              {brl(product.original_price)}
            </span>
          )}
          <div className="text-lg font-semibold text-foreground leading-tight">
            {brl(product.price)}
          </div>
        </div>

        {product.stock > 0 && (
          <button
            type="button"
            onClick={buyNow}
            className="mt-3 inline-flex items-center justify-center gap-2 bg-background border border-border hover:border-foreground hover:bg-foreground hover:text-background text-foreground text-xs font-medium uppercase tracking-wider py-2.5 rounded-md transition-colors"
            aria-label="Comprar"
          >
            <ShoppingCart className="h-4 w-4" />
            Comprar
          </button>
        )}
      </div>
    </Link>
  );
}
