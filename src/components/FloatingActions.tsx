import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Instagram, MapPin, MessageCircle, X, Users } from "lucide-react";
import { useSiteSettings } from "@/lib/site-settings";

const WHATSAPP_MESSAGE = "Preciso de ajuda com a loja online.";
const INSTAGRAM_URL = "https://www.instagram.com/shopbox.colombo/";
// Endereço padrão sincronizado com src/lib/whatsapp.ts — o valor real vem de site_settings.store_address.
const DEFAULT_MAPS_ADDRESS = "Rua Emílio Gleber, 1118 — Atuba, Colombo / PR";
const GROUP_URL = "https://shopbox-grupos.vercel.app/";
const CONTACT = { label: "Juliana", description: "Produtos diversos", number: "5541995829892" };

function whatsappHref(number: string) {
  return `https://wa.me/${number}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
}

export function FloatingActions() {
  const router = useRouterState();
  const path = router.location.pathname;
  // No mobile o menu começa recolhido (só o botão "Ajuda") para não atrapalhar a navegação.
  const [open, setOpen] = useState(false);

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

  // Rótulo que só aparece no hover (desktop); no mobile aberto mostramos um rótulo estático.
  const hoverLabel =
    "hidden max-w-0 overflow-hidden whitespace-nowrap text-sm font-bold transition-all duration-300 group-hover:max-w-xs group-hover:px-2 md:inline";
  const mobileLabel = "text-sm font-bold whitespace-nowrap md:hidden";

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-3 items-end md:bottom-8 md:right-8">
      {/* Menu de contatos: recolhido no mobile (abre no botão), sempre visível no desktop */}
      <div
        className={`${open ? "flex" : "hidden"} md:flex flex-col gap-3 items-end animate-in fade-in slide-in-from-bottom-2 duration-200`}
      >
        <a
          href={GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Entrar no grupo de ofertas do WhatsApp"
          className="group flex items-center gap-2 rounded-full bg-[#25D366] px-3 py-3 text-black shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className={mobileLabel}>Grupo de Ofertas 🔥</span>
          <span className={hoverLabel}>Grupo de Ofertas 🔥</span>
          <Users className="h-6 w-6 shrink-0" />
        </a>

        <a
          href={whatsappHref(CONTACT.number)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Pedir ajuda no WhatsApp - ${CONTACT.label} (${CONTACT.description})`}
          className="group flex items-center gap-2 rounded-full bg-green-600 px-3 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className={mobileLabel}>{CONTACT.label} · WhatsApp</span>
          <span className={hoverLabel}>{CONTACT.label} · {CONTACT.description}</span>
          <MessageCircle className="h-6 w-6 shrink-0" />
        </a>

        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram da shopbox"
          className="group flex items-center gap-2 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 px-3 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className={mobileLabel}>Instagram</span>
          <span className={hoverLabel}>Instagram</span>
          <Instagram className="h-6 w-6 shrink-0" />
        </a>

        <a
          href={mapsHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver localização da loja no mapa"
          className="group flex items-center gap-2 rounded-full bg-destructive px-3 py-3 text-destructive-foreground shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span className={mobileLabel}>Localização</span>
          <span className={hoverLabel}>Localização</span>
          <MapPin className="h-6 w-6 shrink-0" />
        </a>
      </div>

      {/* Botão único no mobile: abre/fecha o menu. Escondido no desktop (lá o menu já é fixo). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Fechar ajuda e contatos" : "Abrir ajuda e contatos"}
        className="md:hidden flex items-center gap-2 rounded-full bg-green-500 px-4 py-3 text-white shadow-lg transition-transform hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-6 w-6" />}
        <span className="text-sm font-bold">{open ? "Fechar" : "Ajuda"}</span>
      </button>
    </div>
  );
}
