
## 1. Erro "FAILED" no cadastro

**Investigação rápida + correção:**
- Ler `src/routes/auth.tsx` para ver como o `signUp` está sendo chamado e como o erro é exibido (provavelmente está fazendo `toast(error.message)` e o Supabase retorna `"Failed to fetch"` ou erro genérico).
- Corrigir o tratamento de erro: mapear erros comuns (e-mail já cadastrado, senha fraca, CPF/telefone inválidos vindos do trigger `handle_new_user`) para mensagens em português claras.
- Garantir `emailRedirectTo: window.location.origin` no `signUp` (evita link de confirmação quebrado, que é causa comum de "Failed").
- Validar com Zod no cliente antes de enviar (nome ≥ 3, e-mail, telefone 10-11 dígitos, CPF 11 dígitos, senha ≥ 6) — hoje a validação está só no banco e qualquer falha vira "FAILED".

## 2. Variações de cor com estoque por cor

**Schema (migration):**
- Nova coluna em `products`: `color_variants jsonb default '[]'::jsonb` — array de `{ color: string, hex: string, stock: int }`.
- Quando o array está vazio, o produto funciona como hoje (estoque único na coluna `stock`).
- Quando tem variantes, o `stock` total do produto vira a soma das variantes (atualizado por trigger), e o cliente é obrigado a escolher uma cor.
- Atualizar `place_order`, `create_pending_order` e `confirm_order_paid` para aceitar `color` em cada item e debitar do `color_variants[i].stock` correto.
- Nova coluna em `order_items`: `variant_color text null`.

**Frontend:**
- Tela de edição do produto (admin): seção "Cores disponíveis" com lista editável (cor + nome + estoque).
- Página do produto: se houver variantes, mostrar swatches de cor; estoque/botão de comprar reagem à cor selecionada; cor vai junto no carrinho.
- Carrinho: exibir a cor escolhida; cada combinação produto+cor é uma linha separada.
- Etiqueta: incluir a cor abaixo do nome do produto.

## 3. Contador "online / acessos diários" no rodapé

**Backend:**
- Nova tabela `site_visits (id, session_id, visited_on date)` com índice único `(session_id, visited_on)` para contar acesso único por dia.
- RPC `record_visit(session_id text)` que insere ignorando duplicata e retorna `count(*) where visited_on = today`.
- Realtime presence channel `site-online` para contar abas conectadas no momento.

**Frontend:**
- Componente `<OnlineCounter />` no `Footer`: bolinha verde pulsante (`animate-pulse`), à esquerda o total do dia, à direita o online agora. Formato: `500 • 🟢 30`.
- Hook que entra no canal de presença ao montar, faz `record_visit` uma vez por sessão (sessionStorage) e mostra os dois números.
- Cuidado com SSR: renderiza só no cliente (`useEffect` + estado) para evitar hydration mismatch.

## 4. Atualizar horário de funcionamento

Novos horários: **Seg-Sáb 09:00-18:00 · Dom 10:00-16:00**

Buscar todas as ocorrências de horário atual e atualizar:
- Página inicial / rodapé
- `etiqueta.$id.tsx`
- Mensagens de WhatsApp (`src/lib/whatsapp.ts` e usos em produto/carrinho)
- Meta description e `__root.tsx` se houver
- Qualquer texto institucional ("Atendimento", "Horário")

## 5. Mega Ofertas (>30% off) no topo da loja

- Componente `MegaOffersCarousel` (reaproveitar `DiscountCarousel` existente se for compatível) renderizado no topo de `src/routes/loja.tsx`, antes da grid.
- Filtragem client-side a partir dos produtos já carregados pelo loader: `discountPct = (original_price - price) / original_price` e mantém só `>= 30%`.
- Lazy-load das imagens (`loading="lazy"`, `decoding="async"`) e limite de ~12 itens para não pesar.
- Visual: faixa horizontal scrollável, badge "% OFF" grande, riscado do preço original, CTA. Só aparece se houver pelo menos 1 produto qualificado.

## Ordem de execução

1. Migration única com: coluna `color_variants`, coluna `variant_color` em `order_items`, tabela `site_visits` + RPC, atualização das funções `place_order` / `create_pending_order` / `confirm_order_paid`.
2. Após aprovação da migration, ajustar frontend de cadastro, produto/carrinho/checkout/etiqueta para variantes, footer com contador, textos de horário e carrossel de mega ofertas.

Quer que eu siga com a migration e depois o frontend?
