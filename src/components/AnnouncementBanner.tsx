import { Link } from "@tanstack/react-router";
import bannerAsset from "@/assets/cashback-banner-wide.jpg.asset.json";

export function AnnouncementBanner() {
  return (
    <Link
      to="/loja"
      className="block w-full bg-black hover:opacity-95 transition-opacity"
    >
      <img
        src={bannerAsset.url}
        alt="Compre no site e ganhe 5% de cashback para usar nas próximas compras"
        className="w-full h-auto max-h-[140px] sm:max-h-[180px] md:max-h-[220px] object-cover object-center"
        loading="eager"
        width={1920}
        height={512}
      />
    </Link>
  );
}
