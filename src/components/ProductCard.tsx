import { Link } from "@tanstack/react-router";
import { ShoppingCart, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { brl, discountPct } from "@/lib/format";
import { productImages, useHasTeamRole, type Product, type ProductCard as ProductCardData } from "@/lib/products";
import { useCart } from "@/lib/cart";
import { useAuthUser, loginRedirectHref } from "@/lib/useAuthUser";
import { optimizedImage, optimizedSrcSet } from "@/lib/image-url";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRatingCompact } from "@/components/StarRating";
import { reviewsSummaryQuery } from "@/lib/reviews";
import { trackAddToCart, toAnalyticsItem } from "@/lib/analytics";

/** Produto exige escolha de cor/variante antes de ir ao carrinho? */
export function requiresVariantChoice(
  product: Pick<Product | ProductCardData, "color_variants">,
): boolean {
  const variants = product.color_variants;
  return Array.isArray(variants) && variants.length > 0;
}

export function ProductCard({ product, priority = false }: { product: Product | ProductCardData; priority?: boolean }) {
  const off = discountPct(product.original_price, product.price);
  const imgs = productImages(product);
  const cover = imgs[0];
  const { add } = useCart();
  const user = useAuthUser();
  const isTeam = useHasTeamRole();
  const ageDays = (Date.now() - new Date(product.created_at).getTime()) / 86_400_000;
  const stale = isTeam && product.stock > 0 && ageDays > 5;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErrored, setImgErrored] = useState(false);
  const [adding, setAdding] = useState(false);
  const { data: reviews } = useQuery(reviewsSummaryQuery(product.id));

  const needsVariant = requiresVariantChoice(product);

  const cartItem = {
    id: product.id,
    name: product.name,
    price: product.price,
    image_url: cover ?? null,
    unidade_id: product.unidade_id ?? null,
  };

  const addToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.stock === 0 || needsVariant || adding) return;
    // A reserva de estoque exige sessão: preserva o retorno atual para o carrinho.
    if (!user) {
      toast.info("Crie sua conta ou entre para continuar");
      window.location.href = loginRedirectHref("/carrinho");
      return;
    }
    setAdding(true);
    try {
      const result = await add(cartItem, 1);
      if (result === "ok") {
        // Evento só após sucesso real da adição/reserva.
        trackAddToCart(
          toAnalyticsItem(
            { id: product.id, name: product.name, price: product.price, category: product.category },
            1,
          ),
        );
        toast.success("Adicionado ao carrinho");
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="group relative flex flex-col bg-card rounded-xl overflow-hidden border border-border hover:border-foreground/30 transition-colors">
      <Link
        to="/produto/$id"
        params={{ id: product.id }}
        aria-label={product.name}
        className="block aspect-[4/5] bg-muted overflow-hidden relative"
      >
        {cover && !imgErrored ? (
          <>
            {!imgLoaded && (
              <Skeleton
                aria-hidden
                className="absolute inset-0 rounded-none bg-gradient-to-r from-muted via-muted-foreground/10 to-muted"
              />
            )}
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
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgErrored(true)}
              className={`w-full h-full object-cover group-hover:scale-[1.03] transition-all duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            Sem imagem
          </div>
        )}

        {off > 0 && (
          <div className="absolute top-2 left-2 bg-deal text-deal-foreground text-sm font-bold px-2.5 py-1 rounded-md shadow-sm">
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
        {product.category && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate">
            {product.category}
          </span>
        )}

        <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem] leading-snug">
          {product.name}
        </h3>

        <div className="min-h-[1.25rem]">
          {reviews && reviews.count > 0 && (
            <StarRatingCompact average={reviews.average} count={reviews.count} />
          )}
        </div>

        <div className="mt-auto pt-1">
          <span className="block h-4 text-xs text-muted-foreground line-through">
            {product.original_price && product.original_price > product.price
              ? brl(product.original_price)
              : "\u00a0"}
          </span>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-lg sm:text-xl font-black text-price leading-tight">
              {brl(product.price)}
            </span>
            {off > 0 && (
              <span className="text-[11px] font-black uppercase tracking-wider text-deal">
                -{off}%
              </span>
            )}
          </div>
        </div>

        {product.stock > 0 && (
          <button
            type="button"
            onClick={buyNow}
            className="mt-3 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider py-2.5 rounded-md shadow-sm hover:opacity-90 transition-opacity"
            aria-label={`Comprar ${product.name}`}
          >
            <ShoppingCart className="h-4 w-4" aria-hidden />
            Comprar
          </button>
        )}
      </div>
    </Link>
  );
}
