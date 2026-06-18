## Visão geral
1. Quando o cliente logado adicionar ao carrinho a **última peça em estoque** (ou a última de uma cor), o item fica reservado para ele por **5 minutos**. Durante esse tempo o produto aparece como **Esgotado** para os demais visitantes. Se não pagar em 5min, o estoque volta automaticamente.
2. Botão de **edição inline** na página `/produto/:id` para admin/catalog/manager, abrindo o mesmo formulário usado em `/admin`.

---

## Parte 1 — Reserva de carrinho (5 min)

### Banco de dados (migração)
- Nova tabela `public.cart_reservations`:
  - `user_id` (FK auth.users, cascade)
  - `product_id` (FK products, cascade)
  - `variant_color` (texto, opcional)
  - `quantity` (int)
  - `expires_at` (timestamptz)
  - índice único `(user_id, product_id, coalesce(variant_color,''))`
  - RLS: usuário só vê/gerencia suas próprias reservas; service_role acesso total
- Função `reserve_cart_last_stock(product_id, variant_color, quantity)`:
  - SECURITY DEFINER, lock na linha do produto
  - Calcula estoque restante (considerando variantes)
  - Se `restante == quantidade` → decrementa estoque, grava reserva com `expires_at = now() + 5min`, retorna `reserved`
  - Se `restante > quantidade` → não cria reserva, retorna `not_last` (cliente continua no carrinho normal)
  - Se `restante == 0` → `out_of_stock`
  - Se já existir reserva do próprio usuário → renova `expires_at` (até atingir quantidade pedida)
- Função `release_cart_reservation(product_id, variant_color)`:
  - Devolve o estoque e apaga o registro do próprio usuário
- Função `consume_cart_reservations_for_user(user_id, items jsonb)`:
  - Chamada por `create_pending_order` no início — devolve estoque das reservas e apaga os registros, antes do fluxo normal que vai re-reservar via pedido pendente
- Função `expire_cart_reservations()`:
  - Para cada registro expirado: devolve estoque e apaga
- Cron job (pg_cron) executando `expire_cart_reservations()` a cada 1 minuto

### Server functions (`src/lib/cart-reservations.functions.ts`)
- `reserveCartLastStock({ productId, variantColor, quantity })`
- `releaseCartReservation({ productId, variantColor })`
- `listMyActiveReservations()` (para a timer/contagem regressiva)
- Todas com `requireSupabaseAuth`

### Cliente (`src/lib/cart.tsx`)
- Adicionar campo `reserved_until` em `CartItem`
- `add()` passa a ser `async`:
  - Exige login (já é o caso na maioria dos call-sites, mas validar)
  - Chama `reserveCartLastStock`
  - Se `out_of_stock`: toast e não adiciona
  - Se `reserved`: salva `reserved_until` no item
  - Se `not_last`: adiciona normalmente
- `remove()`/`setQty(0)`: se item tinha `reserved_until`, chama `releaseCartReservation`
- `clear()`: solta todas as reservas
- Novo hook/efeito: a cada 30s revalidar reservas do servidor; se uma expirou, remover do carrinho e avisar via toast (`"Tempo de reserva expirou para X"`)

### UI
- Página `/carrinho`: badge "⏱ Reservado · MM:SS" em itens com reserva ativa, com contagem regressiva
- Mantém o ProductCard mostrando "Esgotado" quando `stock === 0` (já funciona, pois o estoque DB foi decrementado)

---

## Parte 2 — Edição inline na página do produto

### Extração
- Mover `ProductForm` e o helper `Input` de `src/routes/_authenticated/admin.tsx` para `src/components/ProductForm.tsx` (export nomeado). `admin.tsx` passa a importar de lá. Sem mudança de comportamento.

### Página do produto (`src/routes/produto.$id.tsx`)
- Detectar permissão via `getRoleSummary()` → `canEdit = isSuperAdmin || isManager || isCatalog`
- Botão flutuante "✏️ Editar produto" (visível só para `canEdit`) próximo ao topo da coluna direita
- Ao clicar, abre o mesmo `ProductForm` em modal sobre a página
- `onSaved`: invalidar `['product', id]` e fechar modal

---

## Detalhes técnicos
- A reserva via `cart_reservations` decrementa `products.stock` diretamente (igual ao que `create_pending_order` faz hoje), então a lógica de "Esgotado" no `ProductCard`/`/produto/:id` continua válida sem mudanças adicionais.
- `create_pending_order` recebe um novo bloco que libera as reservas do usuário antes do `FOR LOOP` de itens — evita decrementar o estoque duas vezes na transição carrinho → checkout.
- Cron job: `SELECT cron.schedule('expire-cart-reservations', '* * * * *', $$ SELECT public.expire_cart_reservations(); $$);`
- Para visitante não logado: tentar adicionar ao carrinho redireciona para `/auth` (já é o comportamento atual em `ProductCard`/`produto.$id.tsx`).
- Garantir que `release_cart_reservation` é chamado também no `useEffect` de unmount do carrinho? Não — manter por 5min ainda que ele saia da página. Só liberar em remoção explícita ou expiração.

## Arquivos afetados
- **Migração:** nova tabela + 4 funções + cron job
- **Novo:** `src/lib/cart-reservations.functions.ts`, `src/components/ProductForm.tsx`
- **Editar:** `src/lib/cart.tsx`, `src/routes/carrinho.tsx`, `src/routes/produto.$id.tsx`, `src/routes/_authenticated/admin.tsx` (passa a importar ProductForm), `create_pending_order` (libera reservas no início)
