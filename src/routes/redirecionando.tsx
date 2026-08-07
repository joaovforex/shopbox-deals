import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import logo from "@/assets/shopbox-logo.png";

export const Route = createFileRoute("/redirecionando")({
  head: () => ({ meta: [{ title: "Redirecionando para pagamento · shopbox" }] }),
  component: RedirectingPage,
});

function RedirectingPage() {
  const navigate = useNavigate();
  const [dots, setDots] = useState("");
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const to = typeof window !== "undefined" ? sessionStorage.getItem("mp_init_point") : null;
    if (!to) {
      navigate({ to: "/loja" });
      return;
    }
    setTarget(to);
    sessionStorage.removeItem("mp_init_point");
    // Redireciona imediatamente — delays atrasados são bloqueados por navegadores
    // in-app (WhatsApp/Instagram) e podem provocar "esta página não carregou".
    window.location.replace(to);
  }, [navigate]);

  useEffect(() => {
    const i = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full opacity-30 blur-3xl"
             style={{ background: "radial-gradient(circle, var(--primary), transparent 60%)" }} />
      </div>

      <img
        src={logo}
        alt="shopbox"
        className="relative z-10 w-[min(80vw,560px)] animate-float drop-shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
      />

      <div className="relative z-10 mt-10 text-center space-y-3">
        <h1 className="display text-2xl md:text-4xl">
          Redirecionando para o pagamento{dots}
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Estamos te levando ao checkout seguro da Asaas.
        </p>
        {target && (
          <p className="text-sm md:text-base">
            Se a página não abrir automaticamente,{" "}
            <a href={target} className="text-primary font-bold underline">
              clique aqui para continuar
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
