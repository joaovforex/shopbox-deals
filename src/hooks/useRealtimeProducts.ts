import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on public.products and invalidates
 * product-related queries so the UI reflects stock/availability changes
 * instantly (e.g. when another customer reserves the last item).
 */
export function useRealtimeProducts(productId?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`products-realtime-${productId ?? "all"}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          ...(productId ? { filter: `id=eq.${productId}` } : {}),
        },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["products"] });
          const id =
            (payload.new as { id?: string } | null)?.id ??
            (payload.old as { id?: string } | null)?.id;
          if (id) qc.invalidateQueries({ queryKey: ["product", id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, productId]);
}
