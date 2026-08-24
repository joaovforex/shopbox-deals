// Server-only: monta o payload do Cielo Checkout a partir de um pedido.
import { maxInstallmentsFor } from "@/lib/installments";
import { createCheckout } from "@/lib/cielo.server";

export type CieloCheckoutArgs = {
  orderId: string;
  productsTotal: number;
  shippingFee: number;
  shipping: {
    zip: string;
    street: string;
    number: string;
    complement?: string | null;
    district?: string | null;
    city: string;
    state: string;
  } | null;
  customer: { name: string; email?: string; identity?: string; phone?: string };
  returnUrl: string;
};

/** Cria a página de pagamento na Cielo: 1 item com o total dos produtos + frete opcional. */
export async function buildCieloCheckout(args: CieloCheckoutArgs): Promise<string> {
  const shortId = args.orderId.slice(0, 8).toUpperCase();
  const totalForInstallments = args.productsTotal + args.shippingFee;
  const res = await createCheckout({
    orderNumber: args.orderId,
    softDescriptor: "SHOPBOX",
    items: [
      {
        name: `Pedido shopbox ${shortId}`,
        unitPriceCents: Math.round(args.productsTotal * 100),
        quantity: 1,
        sku: shortId,
      },
    ],
    shipping:
      args.shippingFee > 0 && args.shipping
        ? {
            type: "FixedAmount",
            priceCents: Math.round(args.shippingFee * 100),
            address: {
              street: args.shipping.street,
              number: String(args.shipping.number),
              complement: args.shipping.complement ?? null,
              district: args.shipping.district ?? null,
              city: args.shipping.city,
              state: (args.shipping.state || "PR").toUpperCase(),
              zipCode: args.shipping.zip.replace(/\D/g, ""),
            },
          }
        : { type: "WithoutShipping" },
    maxInstallments: maxInstallmentsFor(totalForInstallments),
    returnUrl: args.returnUrl,
    customer: args.customer,
  });
  return res.checkoutUrl;
}
