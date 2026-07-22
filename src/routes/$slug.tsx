import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/$slug")({
  head: () => ({
    meta: [
      { title: "Redirecionando… · shopbox" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ShortLinkRedirect,
});

function ShortLinkRedirect() {
  const { slug } = Route.useParams();
  const [state, setState] = useState<"loading" | "not-found" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("resolve_short_link", { _slug: slug });
        if (cancelled) return;
        if (error) {
          console.error("[short-link]", error);
          setState("error");
          return;
        }
        const url = data as string | null;
        if (url && /^https?:\/\//i.test(url)) {
          window.location.replace(url);
        } else {
          setState("not-found");
        }
      } catch (e) {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        {state === "loading" && (
          <>
            <div className="mx-auto h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Redirecionando…</p>
          </>
        )}
        {state === "not-found" && (
          <>
            <h1 className="text-2xl font-black uppercase tracking-wider">Link não encontrado</h1>
            <p className="text-sm text-muted-foreground">
              O link <span className="font-mono">/{slug}</span> não existe ou foi desativado.
            </p>
            <Link
              to="/"
              className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm"
            >
              Ir para a loja
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="text-2xl font-black uppercase tracking-wider">Erro ao abrir link</h1>
            <p className="text-sm text-muted-foreground">Tente novamente em instantes.</p>
          </>
        )}
      </div>
    </div>
  );
}
