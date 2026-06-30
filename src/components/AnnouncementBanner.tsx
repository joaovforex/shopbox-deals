import { Link } from "@tanstack/react-router";
import desktopAsset from "@/assets/cashback-banner-wide.jpg.asset.json";
import mobileAsset from "@/assets/cashback-banner-mobile.jpg.asset.json";

export function AnnouncementBanner() {
  return (
    <Link
      to="/loja"
      className="block w-full bg-black hover:opacity-95 transition-opacity"
    >
      <picture>
        <source media="(min-width: 768px)" srcSet={desktopAsset.url} />
        <img
          src={mobileAsset.url}
          alt="Compre no site e ganhe 5% de cashback para usar nas próximas compras"
          className="w-full h-auto object-contain"
          loading="eager"
          width={1600}
          height={950}
        />
      </picture>
    </Link>
  );
}
