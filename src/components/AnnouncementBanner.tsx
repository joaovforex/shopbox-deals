import { Link } from "@tanstack/react-router";
import bannerAsset from "@/assets/cashback-banner.jpg.asset.json";

export function AnnouncementBanner() {
  return (
    <Link
      to="/loja"
      className="block w-full bg-black hover:opacity-95 transition-opacity"
    >
      <img
        src={bannerAsset.url}
        alt="Compre no site e ganhe 5% de cashback para usar nas próximas compras"
        className="w-full h-auto max-h-[280px] sm:max-h-[360px] object-cover object-center"
        loading="eager"
        width={1677}
        height={640}
      />
    </Link>
  );
}
