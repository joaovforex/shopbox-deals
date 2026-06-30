import { Link } from "@tanstack/react-router";

export function AnnouncementBanner() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -top-6 -left-6 h-24 w-24 rounded-full bg-white/20" />
        <div className="absolute top-1/2 right-12 h-16 w-16 -translate-y-1/2 rounded-full bg-white/20" />
        <div className="absolute -bottom-4 right-1/3 h-20 w-20 rounded-full bg-white/20" />
      </div>
      <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
        <Link
          to="/loja"
          className="relative flex items-center justify-center gap-2 sm:gap-3 text-center text-xs sm:text-sm font-bold uppercase tracking-wide hover:opacity-90 transition-opacity"
        >
          <span className="hidden sm:inline">
            Agora você ganha 10% de cashback em todas as compras! Use em produtos e acumule vantagens.
          </span>
          <span className="sm:hidden">
            Ganhe 10% de cashback em todas as compras!
          </span>
        </Link>
      </div>
    </div>
  );
}
