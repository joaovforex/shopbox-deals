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
        className="w-full h-auto max-h-[480px] sm:max-h-[600px] object-contain object-center"
        loading="eager"
        width={1448}
        height={1086}
      />
    </Link>
  );
}
