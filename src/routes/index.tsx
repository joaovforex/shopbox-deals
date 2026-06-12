import { createFileRoute, redirect } from "@tanstack/react-router";
import { pagedProductsQuery } from "@/lib/products";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // dispara prefetch da primeira página sem bloquear o redirect
    context.queryClient.prefetchInfiniteQuery(pagedProductsQuery({}));
    throw redirect({ to: "/loja" });
  },
});
