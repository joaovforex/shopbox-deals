import { useRouterState } from "@tanstack/react-router";
import { Instagram, MapPin, MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "5541995829892";
const WHATSAPP_MESSAGE = "Preciso de ajuda com a loja online.";
const INSTAGRAM_URL = "https://www.instagram.com/shopbox.colombo/";
const MAPS_ADDRESS = "Rua Abel Scuissiato, 2996";

export function FloatingActions() {
  const router = useRouterState();
  const path = router.location.pathname;

  // Não exibe em rotas de admin, pedidos autenticados, auth ou reset
  if (
    path.startsWith("/admin") ||
    path.startsWith("/meus-pedidos") ||
    path.startsWith("/perfil") ||
    path.startsWith("/auth") ||
    path.startsWith("/reset-password")
  ) {
    return null;
  }

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(MAPS_ADDRESS)}`;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-3 items-end md:bottom-8 md:right-8">
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram da shopbox"
        className="group flex items-center gap-2 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-3 text-white shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold transition-all duration-300 group-hover:max-w-xs group-hover:px-2 md:inline">
          Instagram
        </span>
        <Instagram className="h-6 w-6" />
      </a>

      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ver localização da loja no mapa"
        className="group flex items-center gap-2 rounded-full bg-destructive p-3 text-destructive-foreground shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold transition-all duration-300 group-hover:max-w-xs group-hover:px-2 md:inline">
          Localização
        </span>
        <MapPin className="h-6 w-6" />
      </a>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Pedir ajuda no WhatsApp"
        className="flex items-center gap-2 rounded-full bg-green-500 px-4 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="text-sm font-bold">Ajuda</span>
      </a>
    </div>
  );
}
