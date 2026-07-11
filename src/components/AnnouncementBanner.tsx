import { Link } from "@tanstack/react-router";
import desktopAsset from "@/assets/cashback-banner-wide.jpg.asset.json";
import mobileAsset from "@/assets/cashback-banner-mobile.jpg.asset.json";
import { useSiteSettings, formatCashbackLabel } from "@/lib/site-settings";

export function AnnouncementBanner() {
  const { data } = useSiteSettings();
  const desktopUrl = data?.banner_desktop_url || desktopAsset.url;
  const mobileUrl = data?.banner_mobile_url || mobileAsset.url;
  const label = formatCashbackLabel(data?.cashback_rate ?? 0.05);

  return (
    <Link
      to="/loja"
      className="block w-full bg-black hover:opacity-95 transition-opacity"
    >
      <picture>
        <source media="(min-width: 768px)" srcSet={desktopUrl} />
        <img
          src={mobileUrl}
          alt={`Compre no site e ganhe ${label} de cashback para usar nas próximas compras`}
          className="w-full h-auto object-contain"
          loading="eager"
          width={1600}
          height={950}
        />
      </picture>
    </Link>
  );
}
