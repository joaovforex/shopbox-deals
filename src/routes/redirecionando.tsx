import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import logoCircle from "@/assets/shopbox-circle.jpeg.asset.json";
import logo3d from "@/assets/shopbox-3d.jpeg.asset.json";

export const Route = createFileRoute("/redirecionando")({
  head: () => ({ meta: [{ title: "Redirecionando para pagamento · shopbox" }] }),
  component: RedirectingPage,
});

function RedirectingPage() {
  const navigate = useNavigate();
  const [dots, setDots] = useState("");

  useEffect(() => {
    const to = typeof window !== "undefined" ? sessionStorage.getItem("mp_init_point") : null;
    if (!to) {
      navigate({ to: "/checkout" });
      return;
    }
    const t = setTimeout(() => {
      sessionStorage.removeItem("mp_init_point");
      window.location.href = to;
    }, 2200);
    return () => clearTimeout(t);
  }, [navigate]);

  useEffect(() => {
    const i = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 overflow-hidden relative">
      {/* glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, var(--primary), transparent 60%)" }} />
      </div>

      <div className="relative flex items-center gap-6 md:gap-10 z-10">
        <img
          src={logoCircle.url}
          alt="shopbox"
          className="w-28 h-28 md:w-40 md:h-40 rounded-full shadow-deal animate-[spin_6s_linear_infinite]"
        />
        <img
          src={logo3d.url}
          alt="shopbox 3d"
          className="w-40 md:w-60 animate-float drop-shadow-2xl"
        />
      </div>

      <div className="relative z-10 mt-12 text-center space-y-3">
        <h1 className="display text-2xl md:text-4xl">
          Redirecionando para o pagamento{dots}
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Estamos te levando ao checkout seguro do Mercado Pago.
        </p>

        {/* progress bar */}
        <div className="mx-auto mt-6 h-1.5 w-64 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent"
            style={{ animation: "redirect-progress 2.2s ease-out forwards" }}
          />
        </div>
      </div>

      <style>{`
        @keyframes redirect-progress {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>
    </div>
  );
}
