import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProducts from "./tools/search-products";
import getProduct from "./tools/get-product";
import listMyOrders from "./tools/list-my-orders";
import getOrder from "./tools/get-order";
import myCashback from "./tools/my-cashback";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "shopbox-deals",
  title: "Shopbox Deals",
  version: "0.1.0",
  instructions:
    "Ferramentas da loja shopbox. Use search_products/get_product para consultar o catálogo, list_my_orders/get_order para acompanhar pedidos do usuário conectado e get_my_cashback para o saldo de cashback.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchProducts, getProduct, listMyOrders, getOrder, myCashback],
});
