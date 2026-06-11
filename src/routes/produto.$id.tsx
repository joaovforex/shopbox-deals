import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Share2, MessageCircle, Minus, Plus, ArrowLeft, Copy } from "lucide-react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { ProductCarousel } from "@/components/ProductCarousel";
import { brl, discountPct } from "@/lib/format";
import { fetchProduct, isAdmin, productImages, type Product } from "@/lib/products";
import { getRequestOrigin } from "@/lib/origin.functions";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/produto/$id")({
  loader: async ({ params, context }) => {
    const [product, origin] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["product", params.id],
        queryFn: () => fetchProduct(params.id),
      }),
      getRequestOrigin(),
    ]);
    if (!product) throw notFound();
    return { product, origin };
  },
  head: ({ loaderData }) => {
    const { product, origin } = loaderData as { product: Product; origin: string };
    const imgs = productImages(product);
    const rawImage = imgs[0] ?? "";
    const image = rawImage.startsWith("http") ? rawImage : rawImage ? `${origin}${rawImage}` : "";
    const off = discountPct(product.original_price, product.price);
    const hasDiscount = !!(product.original_price && product.original_price > product.price);
    const priceLine = hasDiscount
      ? `De ${brl(product.original_price!)} Por ${brl(product.price)}${off > 0 ? ` (${off}% OFF)` : ""}`
      : `Por ${brl(product.price)}`;
    const descBody = product.description ? `\n\n${product.description}` : "";
    const ogDescription = `${priceLine}${descBody}`;
    return {
      meta: [
        { title: `${product.name} — Shopbox` },
        { name: "description", content: priceLine + (product.description ? ` — ${product.description}` : "") },
        { property: "og:title", content: product.name },
        { property: "og:description", content: ogDescription },
        { property: "og:image", content: image },
        { property: "og:image:secure_url", content: image },
        { property: "og:image:url", content: image },
        { property: "og:image:type", content: "image/jpeg" },
        { property: "og:image:alt", content: product.name },
        { property: "og:image:width", content: "1080" },
        { property: "og:image:height", content: "1080" },
        { property: "og:type", content: "product" },
        { property: "og:site_name", content: "Shopbox" },
        { property: "og:url", content: `${origin}/produto/${product.id}` },
        { property: "product:price:amount", content: String(product.price) },
        { property: "product:price:currency", content: "BRL" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: product.name },
        { name: "twitter:description", content: ogDescription },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: ProductPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-muted-foreground">Erro ao carregar produto: {error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="display text-4xl mb-2">Produto não encontrado</h1>
          <Link to="/loja" className="text-primary hover:underline">Voltar para a loja</Link>
        </div>
      </div>
      <Footer />
    </div>
  ),
});

function ProductPage() {
  const { id } = Route.useParams();
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const p = await fetchProduct(id);
      if (!p) throw notFound();
      return p;
    },
  });
  const { data: admin = false } = useQuery({
    queryKey: ["is-admin"],
    queryFn: isAdmin,
    staleTime: 60_000,
  });
  const { add } = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);

  if (isLoading || !product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="container mx-auto px-4 py-10 grid md:grid-cols-2 gap-8">
          <div className="aspect-square bg-card rounded-lg animate-pulse" />
          <div className="space-y-4">
            <div className="h-8 bg-card rounded animate-pulse" />
            <div className="h-12 bg-card rounded animate-pulse w-1/2" />
            <div className="h-32 bg-card rounded animate-pulse" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const off = discountPct(product.original_price, product.price);
  const url = typeof window !== "undefined" ? window.location.href : "";
  const installments = product.price >= 50 ? Math.min(10, Math.floor(product.price / 20)) : 0;
  const hasDiscount = !!(product.original_price && product.original_price > product.price);
  const shareText = [
    product.name,
    "",
    hasDiscount ? `DE ~${brl(product.original_price!)}~` : null,
    `POR ${brl(product.price)}${off > 0 ? ` (${off}% OFF)` : ""}`,
    installments > 0 ? `Em ate ${installments}x de ${brl(product.price / installments)} sem juros` : null,
    product.description ? "" : null,
    product.description ?? null,
    "",
    `🔗 ${url}`,
  ].filter((l) => l !== null).join("\n");
  const waShare = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não consegui copiar o link");
    }
  };

  const fetchImageFile = async (): Promise<File | null> => {
    const src = productImages(product)[0];
    if (!src) return null;
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const ext = (blob.type.split("/")[1] || "jpg").split("+")[0];
      const safe = product.name.replace(/[^\w]+/g, "-").toLowerCase().slice(0, 40) || "produto";
      return new File([blob], `${safe}.${ext}`, { type: blob.type || "image/jpeg" });
    } catch {
      return null;
    }
  };

  const shareWithImage = async () => {
    const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
    if (nav?.share) {
      const file = await fetchImageFile();
      try {
        if (file && nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], text: shareText, title: product.name });
          return;
        }
        await nav.share({ title: product.name, text: shareText, url });
        return;
      } catch {}
    }
    window.open(waShare, "_blank", "noopener,noreferrer");
  };

  const nativeShare = shareWithImage;

  const addToCart = () => {
    add({ id: product.id, name: product.name, price: product.price, image_url: product.image_url }, qty);
    toast.success(`Adicionado ao carrinho (${qty}x)`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="container mx-auto px-4 py-6">
        <Link to="/loja" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft className="h-4 w-4" /> Voltar para a loja
        </Link>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="relative">
            <ProductCarousel images={productImages(product)} alt={product.name} />
            {off > 0 && (
              <div className="absolute top-4 left-4 z-10 bg-deal text-deal-foreground px-4 py-2 rounded-lg font-black text-xl shadow-lg -rotate-6">
                -{off}%
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {product.category && (
              <span className="text-xs font-bold uppercase tracking-widest text-accent">{product.category}</span>
            )}
            <h1 className="display text-3xl md:text-4xl leading-tight">{product.name}</h1>

            <div className="bg-card rounded-xl p-5 border border-border">
              {product.original_price && product.original_price > product.price && (
                <div className="text-sm text-muted-foreground line-through">
                  De {brl(product.original_price)}
                </div>
              )}
              <div className="flex items-baseline gap-3">
                <span className="text-5xl display text-price">{brl(product.price)}</span>
                {off > 0 && <span className="text-deal font-black">-{off}%</span>}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                ou no Pix com desconto · cartão em até 12x
              </div>
            </div>

            {product.description && (
              <div>
                <h3 className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-2">Descrição</h3>
                <p className="text-sm whitespace-pre-line text-foreground/90">{product.description}</p>
              </div>
            )}

            <div className="text-sm">
              {product.stock > 0 ? (
                <span className="text-primary font-semibold">Em estoque ({product.stock} disponiveis)</span>
              ) : (
                <span className="text-destructive font-semibold">Esgotado</span>
              )}
            </div>

            {product.stock > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="inline-flex items-center bg-secondary rounded-md">
                    <button
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="p-2 hover:bg-muted rounded-l-md"
                      aria-label="Diminuir"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="px-4 font-bold">{qty}</span>
                    <button
                      onClick={() => setQty((q) => Math.min(product.stock, q + 1))}
                      className="p-2 hover:bg-muted rounded-r-md"
                      aria-label="Aumentar"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={addToCart}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-secondary text-foreground px-6 py-3 rounded-md font-black uppercase tracking-wider hover:bg-muted transition-colors"
                  >
                    Adicionar
                  </button>
                </div>
                <button
                  onClick={() => {
                    add({ id: product.id, name: product.name, price: product.price, image_url: productImages(product)[0] ?? null }, qty);
                    navigate({ to: "/checkout" });
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-md font-black uppercase tracking-wider hover:scale-[1.02] transition-transform shadow-deal"
                >
                  Comprar agora
                </button>
              </div>
            )}

            {admin && (
              <div className="border-t border-border pt-4">
                <h3 className="font-bold uppercase text-xs tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <Share2 className="h-4 w-4" /> Compartilhar (admin)
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={shareWithImage}
                    className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-black font-bold px-3 py-3 rounded-md hover:opacity-90 text-sm"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </button>
                  <button
                    onClick={nativeShare}
                    className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-3 py-3 rounded-md hover:opacity-90 text-sm"
                  >
                    <Share2 className="h-4 w-4" /> Compartilhar
                  </button>
                  <button
                    onClick={copyLink}
                    className="inline-flex items-center justify-center gap-2 bg-secondary font-bold px-3 py-3 rounded-md hover:bg-muted text-sm"
                  >
                    <Copy className="h-4 w-4" /> Copiar link
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
