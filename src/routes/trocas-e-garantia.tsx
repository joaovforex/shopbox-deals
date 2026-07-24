import { createFileRoute } from "@tanstack/react-router";
import { Header, Footer, MobileBottomNav } from "@/components/Header";
import { MessageCircle, ShieldCheck, PackageCheck, AlertTriangle } from "lucide-react";

const WHATSAPP_ATENDIMENTO = "https://wa.me/5541995829892?text=Preciso%20de%20ajuda%20com%20uma%20troca%2Fgarantia";

export const Route = createFileRoute("/trocas-e-garantia")({
  head: () => ({
    meta: [
      { title: "Trocas e garantia · shopbox" },
      {
        name: "description",
        content:
          "Como solicitar troca ou garantia de produtos comprados na shopbox — prazos, condições e passo a passo.",
      },
      { property: "og:title", content: "Trocas e garantia · shopbox" },
      {
        property: "og:description",
        content:
          "Prazos, condições e passo a passo para trocar produtos ou acionar garantia na shopbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrocasPage,
});

/*
 * ⚠️ ATENÇÃO — CONTEÚDO PLACEHOLDER
 * Os prazos e condições abaixo são um rascunho amigável baseado no que costuma
 * ser praticado no varejo brasileiro (CDC art. 49 — arrependimento em 7 dias
 * para compras online, garantia legal de 90 dias para bens duráveis). João,
 * por favor revisar antes de publicar:
 *  - Prazo real de troca por arrependimento
 *  - Prazo real de troca por defeito / garantia
 *  - Condições específicas de produtos "com avaria"
 *  - Se aceitamos troca de produtos comprados na loja física ou só do site
 */
function TrocasPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-10 flex-1 max-w-3xl">
        <h1 className="display text-3xl sm:text-4xl mb-2">Trocas e garantia</h1>
        <p className="text-muted-foreground mb-8">
          Compramos, testamos e vendemos produtos que a gente mesmo usaria em casa. Se algo der
          errado, a gente resolve — abaixo estão as regras rápidas.
        </p>

        <section className="bg-card border border-border rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold mb-3">
            <PackageCheck className="h-5 w-5 text-primary" /> Prazo para troca
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-foreground/85">
            <li>
              <strong>Compras online:</strong> até <strong>7 dias corridos</strong> após o recebimento
              para arrependimento (direito garantido pelo Código de Defesa do Consumidor).
            </li>
            <li>
              <strong>Defeito de fabricação:</strong> até <strong>90 dias</strong> após a compra para
              produtos duráveis (garantia legal).
            </li>
            <li>Trocas por tamanho/cor dependem de disponibilidade de estoque.</li>
          </ul>
        </section>

        <section className="bg-card border border-border rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold mb-3">
            <ShieldCheck className="h-5 w-5 text-primary" /> Condições
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-foreground/85">
            <li>Produto <strong>sem uso</strong>, com etiqueta e na embalagem original.</li>
            <li>Apresentar a <strong>nota fiscal</strong> ou o número do pedido.</li>
            <li>Todos os acessórios/brindes que vieram junto devem ser devolvidos.</li>
          </ul>
        </section>

        <section className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="flex items-center gap-2 text-lg font-bold mb-3 text-amber-500">
            <AlertTriangle className="h-5 w-5" /> Produtos “com avaria”
          </h2>
          <p className="text-sm text-foreground/85">
            Itens marcados como <strong>“com avaria”</strong> são vendidos <strong>no estado descrito</strong>{" "}
            no anúncio (mostruário, vitrine ou pequenos detalhes estéticos), com preço reduzido por
            causa disso. Esses produtos <strong>não têm direito à troca por arrependimento estético</strong>{" "}
            — a avaria já está indicada nas fotos e na descrição antes da compra. A garantia legal
            de <strong>funcionamento</strong> continua valendo normalmente.
          </p>
        </section>

        <section className="bg-card border border-border rounded-xl p-5 sm:p-6 mb-6">
          <h2 className="text-lg font-bold mb-3">Como solicitar</h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-foreground/85">
            <li>Chame nosso atendimento no WhatsApp com o número do pedido em mãos.</li>
            <li>Mande foto ou vídeo do produto e do problema (quando for defeito).</li>
            <li>Combinamos com você a retirada na loja ou o envio pelos Correios.</li>
            <li>Assim que recebermos e conferirmos, fazemos a troca ou o estorno via Pix.</li>
          </ol>
          <a
            href={WHATSAPP_ATENDIMENTO}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 bg-[#25D366] text-black font-bold px-4 py-2.5 rounded-md hover:opacity-90"
          >
            <MessageCircle className="h-4 w-4" />
            Falar com o atendimento
          </a>
        </section>

        <p className="text-xs text-muted-foreground">
          Este texto é uma orientação geral. Para casos específicos, entre em contato com o nosso
          atendimento — a gente ajuda de verdade e sem burocracia.
        </p>
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
