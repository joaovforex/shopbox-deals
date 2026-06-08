import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { fetchProducts } from "@/lib/products";
import { Search } from "lucide-react";

export const Route = createFileRoute("/loja")({
  head: () => ({
    meta: [
      { title: "Ofertas · shopbox" },
      { name: "description", content: "Catálogo completo da shopbox com todas as ofertas." },
    ],
  }),
  component: Loja,
});

function Loja() {
  const { data: products = [] } = useQuery({
    queryKey: ["products", "active"],
    queryFn: () => fetchProducts({ onlyActive: true }),
  });

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[],
    [products],
  );

  const filtered = products.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6 sm:py-10">
          <h1 className="display text-3xl sm:text-4xl md:text-5xl mb-1 sm:mb-2">Todas as ofertas</h1>
          <p className="text-muted-foreground text-sm">{products.length} produtos disponíveis</p>
        </div>
      </section>

      <section className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4 sm:mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full bg-input text-foreground rounded-md pl-10 pr-3 py-2.5 border border-border focus:outline-none focus:border-primary"
            />
          </div>
          {categories.length > 0 && (
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="bg-input rounded-md px-3 py-2.5 border border-border focus:outline-none focus:border-primary text-sm"
            >
              <option value="">Todas categorias</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 sm:py-20 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      <Footer />
      <MobileBottomNav />
    </div>
  );
}
