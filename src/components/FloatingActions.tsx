import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Instagram, MapPin, MessageCircle, ChevronUp, X, Users } from "lucide-react";
import { useSiteSettings } from "@/lib/site-settings";

const WHATSAPP_MESSAGE = "Preciso de ajuda com a loja online.";
const INSTAGRAM_URL = "https://www.instagram.com/shopbox.colombo/";
// Endereço padrão sincronizado com src/lib/whatsapp.ts — o valor real vem de site_settings.store_address.
const DEFAULT_MAPS_ADDRESS = "Rua Emílio Gleber, 1118 — Atuba, Colombo / PR";
const GROUP_URL = "https://shopboxonline.com/grupowhatsapp";

const CONTACTS = [
  {
    label: "Juliana",
    description: "Produtos diversos",
    number: "5541995829892",
  },
];

function whatsappHref(number: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
}

export function FloatingActions() {
  const router = useRouterState();
  const path = router.location.pathname;
  const [whatsappOpen, setWhatsappOpen] = useState(false);

  const { data: settings } = useSiteSettings();
  const mapsAddress = settings?.store_address?.trim() || DEFAULT_MAPS_ADDRESS;

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

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsAddress)}`;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-3 items-end md:bottom-8 md:right-8">
      <a
        href={GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Entrar no grupo de ofertas do WhatsApp"
        className="group flex items-center gap-2 rounded-full bg-[#25D366] p-3 text-black shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold transition-all duration-300 group-hover:max-w-xs group-hover:px-2 md:inline">
          Grupo de Ofertas 🔥
        </span>
        <Users className="h-6 w-6" />
      </a>

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

      {whatsappOpen && (
        <div className="flex flex-col gap-2 items-end animate-in fade-in slide-in-from-bottom-2 duration-200">
          {CONTACTS.map((contact) => (
            <a
              key={contact.number}
              href={whatsappHref(contact.number)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Pedir ajuda no WhatsApp - ${contact.label} (${contact.description})`}
              className="group flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-white shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold transition-all duration-300 group-hover:max-w-xs group-hover:px-2 md:inline">
                {contact.label} · {contact.description}
              </span>
              <span className="text-sm font-bold md:hidden">{contact.label}</span>
              <MessageCircle className="h-5 w-5" />
            </a>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setWhatsappOpen((v) => !v)}
        aria-label={whatsappOpen ? "Fechar opções de WhatsApp" : "Abrir opções de ajuda no WhatsApp"}
        aria-expanded={whatsappOpen}
        className="flex items-center gap-2 rounded-full bg-green-500 px-4 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="text-sm font-bold">Ajuda</span>
        {whatsappOpen ? (
          <X className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
