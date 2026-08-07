import { createFileRoute } from "@tanstack/react-router";
import { Header, Footer } from "@/components/Header";

export const Route = createFileRoute("/politica-privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade · shopbox" },
      { name: "description", content: "Política de Privacidade da shopbox — como coletamos, usamos e protegemos seus dados." },
      { property: "og:title", content: "Política de Privacidade · shopbox" },
      { property: "og:description", content: "Como a shopbox coleta, usa e protege seus dados." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="display text-3xl mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">
          shopbox · CNPJ 63.010.601/0002-86 · Última atualização: 02/07/2026
        </p>

        <div className="prose prose-invert space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-bold text-primary mb-2">1. Quem somos</h2>
            <p>
              A shopbox é uma loja de varejo situada na Rua Emílio Gleber, 1118 — Atuba, Colombo / PR,
              inscrita no CNPJ 63.010.601/0002-86. Esta política descreve como tratamos os dados dos
              clientes que utilizam nosso site e serviços, em conformidade com a Lei Geral de Proteção
              de Dados (LGPD - Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">2. Dados que coletamos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Cadastro:</strong> nome completo, e-mail e WhatsApp.</li>
              <li><strong>Checkout:</strong> CPF e endereço completo, exigidos exclusivamente para emissão de nota fiscal e entrega.</li>
              <li><strong>Pagamento:</strong> processado pela Asaas; não armazenamos dados de cartão.</li>
              <li><strong>Navegação:</strong> cookies essenciais para carrinho, sessão e melhoria da experiência.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">3. Como usamos seus dados</h2>
            <p>
              Utilizamos seus dados apenas para processar pedidos, emitir notas fiscais, realizar entregas,
              oferecer suporte, aplicar o programa de cashback e cumprir obrigações legais. Não vendemos e
              não compartilhamos seus dados com terceiros para fins de marketing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">4. Compartilhamento</h2>
            <p>
              Compartilhamos dados estritamente necessários com: Asaas (pagamentos), transportadoras
              e Mais Entregas (logística), e provedor de infraestrutura em nuvem para hospedagem segura.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">5. Seus direitos</h2>
            <p>
              Você pode solicitar acesso, correção, exclusão ou portabilidade dos seus dados a qualquer
              momento pelos canais de atendimento. Também pode revogar consentimentos e cancelar sua conta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">6. Segurança</h2>
            <p>
              Utilizamos criptografia HTTPS/SSL, autenticação segura e controles de acesso para proteger
              seus dados contra acesso não autorizado, perda ou vazamento.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-primary mb-2">7. Contato</h2>
            <p>
              Dúvidas sobre esta política ou solicitações relacionadas aos seus dados podem ser enviadas
              pelo WhatsApp disponível no rodapé do site ou pessoalmente em nossa loja.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
