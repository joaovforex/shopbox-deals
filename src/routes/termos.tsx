import { createFileRoute } from "@tanstack/react-router";
import { Header, Footer } from "@/components/Header";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso · shopbox" },
      { name: "description", content: "Termos de Uso da loja shopbox — regras para compras, cashback, trocas e devoluções." },
      { property: "og:title", content: "Termos de Uso · shopbox" },
      { property: "og:description", content: "Regras da loja shopbox: compras, cashback, trocas e devoluções." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="display text-3xl mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">
          shopbox · CNPJ 63.010.601/0002-86 · Última atualização: 02/07/2026
        </p>

        <div className="space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-bold text-primary mb-2">1. Sobre a shopbox</h2>
            <p>
              A shopbox é um comércio varejista situado na Rua Emílio Gleber, 1118 — Atuba, Colombo / PR,
              inscrita no CNPJ 63.010.601/0002-86. Ao utilizar o site, você concorda com estes Termos de Uso.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">2. Cadastro e conta</h2>
            <p>
              O cadastro é gratuito e requer apenas nome, e-mail e WhatsApp. O CPF é solicitado somente no
              checkout, para emissão de nota fiscal. Você é responsável pela veracidade dos dados informados
              e pela guarda da sua senha.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">3. Pedidos e pagamento</h2>
            <p>
              Os pagamentos são processados pelo Mercado Pago, aceitando Pix, cartão de crédito e parcelamento.
              O pedido só é confirmado após aprovação do pagamento. Preços e disponibilidade podem sofrer
              alterações sem aviso prévio.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">4. Entrega</h2>
            <p>
              As entregas são realizadas por transportadoras parceiras. Prazos são estimados no checkout,
              contados a partir da aprovação do pagamento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">5. Trocas, devoluções e cashback</h2>
            <p>
              Você tem 7 dias corridos após o recebimento para exercer o direito de arrependimento, conforme
              o Código de Defesa do Consumidor (art. 49). O cashback recebido em compras segue as regras
              divulgadas no site, com validade e condições próprias.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">6. Propriedade intelectual</h2>
            <p>
              Logotipo, marca, textos e imagens do site são de propriedade da shopbox ou licenciados a ela,
              proibida a reprodução sem autorização.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">7. Foro</h2>
            <p>
              Fica eleito o foro da Comarca de Colombo / PR para dirimir quaisquer controvérsias oriundas
              destes Termos, com renúncia expressa a qualquer outro.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
