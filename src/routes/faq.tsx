import { createFileRoute, Link } from "@tanstack/react-router";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MessageCircle } from "lucide-react";

const GROUP_URL = "https://shopboxonline.com/grupowhatsapp";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Perguntas frequentes · shopbox" },
      {
        name: "description",
        content:
          "Tire suas dúvidas sobre entrega, retirada, pagamento, cashback e produtos com avaria na shopbox.",
      },
      { property: "og:title", content: "Perguntas frequentes · shopbox" },
      {
        property: "og:description",
        content:
          "Dúvidas sobre entrega, retirada, pagamento e cashback? Confira as respostas mais comuns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FAQPage,
});

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Como funciona a entrega?",
    a: (
      <>
        Trabalhamos com <strong>frete fixo de R$ 12</strong> para Curitiba e região metropolitana e{" "}
        <strong>frete grátis para compras acima de R$ 80</strong>. Se preferir, você também pode
        retirar de graça na loja física em Colombo.
      </>
    ),
  },
  {
    q: "Onde retiro meu pedido?",
    a: (
      <>
        A retirada é feita na nossa loja em Colombo: <br />
        <strong>Rua Abel Scuissiato, 2996 · Colombo/PR</strong>.<br />
        Horário: <strong>Segunda a sábado, das 9h às 18h</strong> · <strong>Domingo das 10h às 16h</strong>.
      </>
    ),
  },
  {
    q: "Quais as formas de pagamento?",
    a: (
      <>
        Aceitamos <strong>Pix</strong> e <strong>cartões de crédito e débito</strong>, incluindo pagamento
        rápido por <strong>QR Code</strong> no caixa da loja.
      </>
    ),
  },
  {
    q: "Como funciona o cashback de 5%?",
    a: (
      <>
        A cada compra feita aqui no site você ganha <strong>5% de volta em cashback</strong> para usar
        como desconto nas próximas compras. O saldo fica salvo na sua conta e é aplicado
        automaticamente no checkout.
      </>
    ),
  },
  {
    q: "O que significa \"com avaria\"?",
    a: (
      <>
        Produtos marcados como <strong>“com avaria”</strong> são itens de{" "}
        <strong>mostruário ou vitrine</strong> que podem ter pequenos riscos, marcas ou detalhes
        estéticos — por isso o preço é menor. O <strong>funcionamento é totalmente normal</strong> e
        o detalhe da avaria é descrito e/ou mostrado na foto do anúncio.
      </>
    ),
  },
  {
    q: "Como entro no grupo de ofertas?",
    a: (
      <div className="space-y-3">
        <p>É rapidinho — clique no botão abaixo e você entra direto no nosso grupo do WhatsApp com as melhores ofertas do dia.</p>
        <a
          href={GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#25D366] text-black font-bold px-4 py-2.5 rounded-md hover:opacity-90"
        >
          <MessageCircle className="h-4 w-4" />
          Entrar no grupo de ofertas
        </a>
      </div>
    ),
  },
];

function FAQPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-10 flex-1">
        <h1 className="display text-3xl sm:text-4xl mb-2">Perguntas frequentes</h1>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Respondemos aqui as dúvidas mais comuns dos nossos clientes. Não achou o que precisava?{" "}
          <Link to="/" className="text-primary hover:underline">Fale com a gente pelo WhatsApp</Link>.
        </p>

        <Accordion type="single" collapsible className="max-w-3xl">
          {FAQS.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-base font-semibold">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-foreground/85 leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
