import { ShieldCheck, CreditCard, Store, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";

const items = [
  {
    icon: ShieldCheck,
    title: "Compra segura",
    desc: "Pagamento processado por gateway certificado",
  },
  {
    icon: CreditCard,
    title: "Pix e cartão",
    desc: "Aprovação rápida e parcelamento disponível",
  },
  {
    icon: Store,
    title: "Retirada em Colombo",
    desc: "Retire na loja física sem custo de entrega",
  },
  {
    icon: RefreshCw,
    title: "Trocas e garantia",
    desc: "Regras claras na página de trocas",
  },
];

/** Barra de confiança usada na home. Só afirma o que já existe na operação. */
export function TrustBar() {
  return (
    <section aria-label="Vantagens da shopbox" className="border-y border-border bg-card">
      <div className="container mx-auto px-4 py-5 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {items.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex min-w-0 items-start gap-3">
            <span className="shrink-0 grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
              <Icon className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold leading-tight">{title}</p>
              <p className="hidden sm:block text-xs text-muted-foreground leading-snug">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Bloco compacto de confiança para a página de produto (próximo aos CTAs). */
export function ProductTrustBlock() {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Compra segura</span> — pagamento
          processado por gateway certificado.
        </p>
      </div>
      <div className="flex items-start gap-2.5">
        <CreditCard className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Pix e cartão</span> — parcelamento
          disponível no checkout.
        </p>
      </div>
      <div className="flex items-start gap-2.5">
        <Store className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Retirada em Colombo</span> — retire na
          loja física sem custo de entrega.
        </p>
      </div>
      <div className="flex items-start gap-2.5">
        <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          <Link to="/trocas-e-garantia" className="font-semibold text-foreground hover:text-primary underline underline-offset-2">
            Trocas e garantia
          </Link>{" "}
          — veja as condições antes de comprar.
        </p>
      </div>
    </div>
  );
}
