# Auditoria de conversão e UX — somente leitura

Base: commit atual do preview. **Nenhum arquivo de aplicação, banco, pagamento,
autenticação, estoque, webhook ou configuração foi alterado por esta auditoria.**
Nada foi publicado.

Escopo lido: `src/routes/index.tsx`, `src/routes/loja.tsx`, `src/components/ProductCard.tsx`,
`src/routes/produto.$id.tsx`, `src/routes/carrinho.tsx`, `src/routes/checkout.tsx`,
`src/routes/_authenticated/*`, `src/components/AnnouncementBanner.tsx`,
`src/components/RelatedProducts.tsx`, `src/components/RepurchaseButton.tsx`,
`src/lib/analytics.ts`, `src/lib/cart.tsx`.

Sem invenção de urgência, escassez, prazos, avaliações ou promessas. Nenhuma recomendação
depende de expor dado pessoal.

---

## P0 — fricção e erros a corrigir primeiro

### P0.1 "Comprar" no cartão ignora a escolha de variante
- **Problema:** em `ProductCard.tsx`, `buyNow()` chama `add(cartItem, 1)` com o produto
  cru, sem `variant_color`. Produtos com `color_variants` exigem escolha na página do
  produto; pelo cartão o item pode entrar sem variante definida e o cliente descobre
  o problema depois (ou o operador recebe pedido ambíguo).
- **Mudança:** quando o produto tiver variantes, o botão do cartão deve levar à página do
  produto ("Escolher") em vez de adicionar. O `ProductCardData` já precisa carregar um
  sinalizador leve de "tem variantes" (campo já disponível na consulta ou booleano
  derivado), sem criar consulta por cartão.
- **Impacto:** menos pedidos errados, menos troca/cancelamento, menos suporte.
- **Medir:** taxa de pedidos com variante ausente; contatos de troca por variante.

### P0.2 `add_to_cart` não dispara no cartão
- **Problema:** `trackAddToCart` existe na página de produto, relacionados e recompra,
  mas **não** no `ProductCard`. O caminho mais usado (grade da loja/home) fica fora do
  funil, subestimando adições e inflando o abandono aparente.
- **Mudança:** disparar o mesmo evento no `buyNow()` do cartão, com os mesmos campos e
  sem dado pessoal.
- **Impacto:** funil confiável; decisões de otimização deixam de ser cegas.
- **Medir:** razão `add_to_cart / view_item_list` antes e depois.

### P0.3 Uma consulta de avaliações por cartão (N+1)
- **Problema:** `ProductCard` chama `useQuery(reviewsSummaryQuery(product.id))` — numa
  grade de 12–24 produtos são 12–24 requisições paralelas por página, no celular.
- **Mudança:** buscar o resumo em lote por lista de ids (uma consulta) ou incluir
  média/contagem na consulta de listagem; manter o cartão sem consulta própria.
- **Impacto:** menos travamento no 4G, LCP/INP melhores, menos carga no backend.
- **Medir:** número de requisições por navegação na loja; INP no celular.

### P0.4 Carrinho exige login só para ser visto
- **Problema:** `carrinho.tsx` redireciona para login quando `user === null`. Quem ainda
  não tem conta perde o carrinho de vista e o incentivo para concluir.
- **Mudança:** permitir visualizar o carrinho deslogado (o carrinho já é local) e exigir
  conta apenas ao ir para o checkout, preservando as regras de reserva server-side.
- **Impacto:** menos abandono no topo do funil.
- **Medir:** `begin_checkout / add_to_cart`; saídas na rota `/carrinho`.

### P0.5 Imagens do carrinho sem otimização nem dimensões
- **Problema:** `carrinho.tsx` usa `i.image_url` direto, sem `optimizedImage`, `srcSet`,
  `width`/`height` ou `loading`. Peso alto e deslocamento de layout.
- **Mudança:** reaproveitar `optimizedImage`/`optimizedSrcSet` (já usados em cartão e
  carrosséis) e fixar dimensões.
- **Impacto:** carrinho abre rápido; CLS quase zero.
- **Medir:** CLS e peso da rota.

---

## P1 — ganhos fortes de conversão

### P1.1 Hierarquia da home: banner, busca e produtos
- **Problema:** o banner (restaurado a pedido) é alto no celular e empurra busca e
  "Ofertas de hoje" para baixo. O primeiro contato é institucional, não comercial.
- **Mudança:** limitar a altura do banner por `aspect-ratio` no celular e manter a busca
  visível logo em seguida; ofertas devem começar dentro da primeira rolagem curta.
  Alternativa: banner logo abaixo do hero com busca.
- **Impacto:** mais cliques em produto por sessão.
- **Medir:** cliques em produto vindos da home; profundidade de rolagem até a primeira
  oferta.

### P1.2 Densidade e consistência dos cartões
- **Problema:** o cartão tem categoria, nome, estrelas, preço riscado, preço, selo `-x%`
  duplicado (imagem + rodapé) e botão. Informação repetida disputa atenção; a área
  reservada às estrelas ocupa espaço mesmo sem avaliações.
- **Mudança:** um único selo de desconto, altura reservada só quando houver avaliação
  real, e parcelamento (já calculado em `installments.ts`) no lugar da repetição.
- **Impacto:** leitura mais rápida, mais cliques em produto.
- **Medir:** CTR do cartão por posição.

### P1.3 Frete e retirada mais cedo
- **Problema:** a estimativa de entrega existe e é robusta (ViaCEP + RMC compartilhado +
  `quoteDelivery` server-side), mas só na página do produto. No carrinho não há nenhuma
  indicação de frete/retirada antes do checkout.
- **Mudança:** mostrar no resumo do carrinho o CEP já salvo e o resultado da mesma
  cotação server-side (sem duplicar lógica), com opção de retirada. Sem prometer prazo
  que a transportadora não devolveu.
- **Impacto:** menos surpresa no checkout, menos abandono na etapa de frete.
- **Medir:** abandono entre `begin_checkout` e pagamento.

### P1.4 Confiança e política de troca visíveis onde a decisão acontece
- **Problema:** `TrustBar` está na home; a página de produto e o checkout não repetem
  troca/garantia, CNPJ e endereço de retirada de forma compacta.
- **Mudança:** bloco curto e factual (dados já existentes em `/trocas-e-garantia`,
  `/faq` e `site_settings.store_address`) próximo ao botão de compra e no resumo do
  checkout.
- **Impacto:** reduz hesitação em compra de primeira vez.
- **Medir:** conversão de visitantes novos.

### P1.5 Carrinho: resumo pegajoso e cashback
- **Problema:** o resumo fica na coluna lateral; no celular o cliente rola até o fim para
  achar o botão. Cashback disponível não aparece antes do checkout.
- **Mudança:** barra fixa inferior com total e "Ir para pagamento" no celular; exibir
  saldo real de cashback (consulta já existente, com RLS) e como será aplicado.
- **Impacto:** mais avanços ao checkout e uso de cashback (recompra).
- **Medir:** cliques em "Ir para pagamento"; pedidos com cashback aplicado.

### P1.6 Checkout longo em página única
- **Problema:** `checkout.tsx` tem ~800 linhas em uma tela; endereço, entrega, cashback e
  pagamento competem pela atenção.
- **Mudança:** manter uma página, mas em blocos colapsáveis com estado claro
  (Identificação → Entrega/Retirada → Pagamento), resumo sempre visível e erros por
  bloco. **Sem tocar em cálculo, provedores ou fluxo de pagamento.**
- **Impacto:** menos erro de preenchimento e menos abandono.
- **Medir:** tempo até pagamento; erros de validação por campo.

### P1.7 Recompra mais visível
- **Problema:** `RepurchaseButton` já trata variante, estoque e sucesso parcial, mas vive
  dentro do detalhe/lista de pedidos.
- **Mudança:** atalho "Comprar de novo" no resumo de `/minha-conta`, com os mesmos
  cuidados atuais (preço atual, estoque atual, escolha de variante).
- **Impacto:** aumenta a frequência de compra da base já convertida.
- **Medir:** pedidos originados de recompra.

---

## P2 — refinamentos e testes A/B

- **P2.1 Ordenação na loja** (relevância, maior desconto, menor/maior preço) se a consulta
  paginada suportar sem refatorar backend. Medir: uso do seletor e CTR por ordem.
- **P2.2 Teste A/B do banner** (com carrossel, quando aprovado): home com banner alto vs.
  banner contido. Medir: cliques em produto por sessão.
- **P2.3 Rótulo do botão** do cartão ("Comprar" vs. "Ver produto") por variação. Medir: CTR
  e conversão final, não só o clique.
- **P2.4 Grade 2 vs. 1 coluna no celular** em telas estreitas.
- **P2.5 Blocos de avaliação** só quando houver volume real; nunca sintetizar nota.
- **P2.6 Estado "sem resultados"** já existe na loja — testar sugestões por categoria mais
  vendida (dado real) em vez de lista fixa.

---

## Velocidade / Core Web Vitals

- **LCP:** o banner é o maior elemento no celular; garantir `eager` + `fetchpriority=high`
  só nele e dimensões fixas. As ofertas já usam `priority` nos dois primeiros cartões.
- **INP:** os principais ofensores são as consultas por cartão (P0.3) e o intervalo de 1s
  do contador de reserva no carrinho, que re-renderiza a lista inteira — isolar o timer
  no próprio selo (hoje já é um componente, mas roda um `setInterval` por item; um relógio
  compartilhado bastaria).
- **CLS:** imagens do carrinho (P0.5) e a altura reservada das estrelas (P1.2).
- **Rede:** avaliações em lote e imagens WebP já otimizadas nas grades.

## Acessibilidade

- Botão "Comprar" dentro de um `<Link>` que envolve o cartão inteiro: funciona por causa
  do `preventDefault`, mas gera controle interativo aninhado. Preferir cartão com link no
  título/imagem e botão irmão.
- `aria-label` existem no cabeçalho e nos cartões — manter esse padrão em qualquer novo
  controle.
- Alvos de toque ≥44px já respeitados na área do cliente; replicar nos controles de
  quantidade do carrinho.
- Contraste dos textos `text-[10px]` em `muted-foreground` está no limite; subir um passo
  de tamanho/contraste nos rótulos de categoria.

## Eventos existentes e funil

Implementados hoje (`src/lib/analytics.ts`, sem PII):
`view_item` (produto), `view_item_list` (loja), `add_to_cart` (produto, relacionados,
recompra), `begin_checkout` (checkout), `purchase` (pedido pago, deduplicado).

Lacunas do funil:
1. `add_to_cart` ausente no cartão da grade (P0.2) — maior distorção atual.
2. `view_item_list` não cobre a vitrine da home.
3. Sem eventos de `remove_from_cart`, `view_cart` e de aplicação de cashback.
4. Sem eventos de banner (previstos em `docs/banner-carousel-plan.md`).

Com 1–3 fechados, o funil view → list → add → checkout → purchase fica auditável ponta a
ponta, sem enviar e-mail, CPF, telefone, endereço ou identificador de usuário.

---

## Ordem sugerida de execução

1. P0.1 e P0.2 (mesma função, um único ajuste no cartão).
2. P0.3 (avaliações em lote).
3. P0.4 e P0.5 (carrinho).
4. P1.1, P1.2, P1.3, P1.5.
5. P1.4, P1.6, P1.7.
6. P2 depois de haver dados confiáveis do funil.

Nada acima foi implementado nesta auditoria.
