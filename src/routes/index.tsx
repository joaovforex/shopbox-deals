import { createFileRoute, redirect } from "@tanstack/react-router";
import { activeProductsQuery } from "@/lib/products";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // dispara prefetch sem bloquear o redirect
    context.queryClient.prefetchQuery(activeProductsQuery());
    throw redirect({ to: "/loja" });
  },
});
