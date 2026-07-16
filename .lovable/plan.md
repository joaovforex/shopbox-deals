
# Substituir Mercado Pago pela Cielo (Checkout hospedado)

Trocar o provedor de pagamento de **Mercado Pago** para **Cielo Checkout** (redirect), em **produção**, com **cartão de crédito (até 7x sem juros)**, **cartão de débito** e **Pix**. Todas as funções que existem hoje no fluxo MP continuam iguais: criação do pedido, redirect pro checkout, webhook confirmando pagamento, cashback, emissão de NFe, expedição, admin e venda manual.

---

## 1. Banco de dados (migration única)

**Renomear/adicionar colunas em `orders`** (mantém compatibilidade com pedidos MP antigos):
- Manter `mp_preference_id`, `mp_init_point`, `mp_payment_id`, `mp_status` **read-only** (histórico dos pedidos antigos)
- Adicionar:
  - `cielo_payment_id` (uuid da transação na Cielo)
  - `cielo_merchant_order_id` (nosso `order_id`, usado como referência)
  - `cielo_checkout_url` (equivalente ao `init_point`)
  - `cielo_status` (`created` | `paid` | `denied` | `voided` | `refunded` | `pending`)
  - `cielo_payment_method` (`credit_card` | `debit_card` | `pix`)
  - `cielo_installments` (int, 1–7)
  - `cielo_tid`, `cielo_authorization_code`, `cielo_return_code`, `cielo_return_message`
  - `payment_provider` (`mercadopago` | `cielo`) — default `cielo`

**Nova tabela `cielo_webhook_events`** (idempotência + auditoria):
- `id`, `payment_id`, `change_type` (int da Cielo), `raw_payload jsonb`, `processed_at`, `order_id`
- Unique em `(payment_id, change_type)` pra deduplicar

Grants + RLS: só `service_role` acessa `cielo_webhook_events`; `orders` mantém as policies atuais.

---

## 2. Helpers Cielo (server-only)

**`src/lib/cielo.server.ts`** — cliente HTTP:
- `getAccessToken()` — POST `https://cieloecommerce.cielo.com.br/api/public/v2/token` com `client_credentials` (Basic Auth com `CIELO_CLIENT_ID:CIELO_CLIENT_SECRET`); cache do token em memória até `expires_in`
- `createCheckout({ orderId, amount, items, customer, paymentMethods, maxInstallments, returnUrl })` — POST `/api/public/v1/orders` retorna `{ paymentId, settings.checkoutUrl }`
- `getOrder(paymentId)` — GET `/api/public/v1/orders/{paymentId}` (consulta status)
- `voidOrder(paymentId, amount?)` — POST estorno
- `mapCieloStatusToOrderStatus(cieloStatus)` — helper de mapeamento

Base URL de **produção**: `https://cieloecommerce.cielo.com.br`.

---

## 3. Server functions e rotas

**`src/lib/cielo.functions.ts`** (client-safe):
- `createCieloCheckout({ orderId })` — server fn autenticada; monta payload a partir do pedido + `order_items` + cliente, chama `createCheckout()`, grava `cielo_payment_id` / `cielo_checkout_url` / `payment_provider='cielo'` no pedido, retorna `{ checkoutUrl }`
- `admin_refundCielo({ orderId, amount? })` — usada pelo módulo de reembolsos

**`src/routes/api/public/cielo/webhook.ts`** — endpoint público que a Cielo chama:
- POST recebe `{ PaymentId, ChangeType }`
- Consulta a Cielo pelo `PaymentId` (fonte da verdade — a Cielo não assina o webhook, então sempre reconsultamos)
- Insere em `cielo_webhook_events` (idempotência via unique)
- Se `Status = 2` (paga) chama a RPC existente `confirm_order_paid(order_id, provider_payment_id)` — a **mesma** que o webhook do MP usa hoje, disparando cashback, e-mail e (quando `fiscal_config.ativo`) emissão de NFe
- Se `Status = 3` (negada) / `10/13` (cancelada/estornada), atualiza `orders.status`/`payment_status` de forma idempotente
- Retorna `200` sempre que o payload for válido (Cielo re-tenta em não-2xx)

**`src/routes/api/public/cielo/reconcile.ts`** — cron (equivalente ao `reconcile-orders.ts` do MP):
- Roda a cada 10 min via `pg_cron` + `pg_net`
- Pega pedidos `cielo_status IN ('created','pending')` das últimas 48h e reconsulta na Cielo — fecha race conditions caso um webhook falhe

---

## 4. Fluxo de checkout (frontend)

**`src/routes/checkout.tsx`** e **`src/lib/manual-sale.functions.ts`**:
- Trocar a chamada de criação da preferência MP por `createCieloCheckout({ orderId })`
- Antes de gerar o checkout, o cliente escolhe:
  - Meio de pagamento: **Crédito / Débito / Pix** (radio group)
  - Se crédito: seletor de parcelas **1x a 7x sem juros**
- Esses valores são enviados ao `createCieloCheckout` que restringe o `paymentMethodTypes` no payload da Cielo — assim a tela hospedada já mostra só o meio escolhido
- Continua salvando `mp_init_point` **e** `cielo_checkout_url` em `sessionStorage` sob a chave existente `mp_init_point` (a página `redirecionando.tsx` fica igual — só renomeamos internamente pra `payment_checkout_url` em passo seguinte, mas nada quebra)
- `back_urls` viram `returnUrl` no formato `${origin}/pedido/{orderId}`

**`src/routes/pedido.$id.tsx`** e **`src/routes/_authenticated/meus-pedidos.tsx`**:
- Já leem `status`/`payment_status` do pedido — nada muda visualmente
- Adiciona um badge do meio de pagamento (crédito 7x / Pix / débito) quando `payment_provider = 'cielo'`

---

## 5. Reembolsos e vale-troca

**`src/lib/refunds.functions.ts`**:
- Ramifica por `payment_provider`:
  - `mercadopago` → mantém o fluxo atual (pedidos antigos)
  - `cielo` → chama `voidOrder(cielo_payment_id, amount)` e grava resultado em `refunds`
- UI (`admin.reembolsos.tsx`) não muda

---

## 6. Admin

**`src/routes/_authenticated/admin.pedidos.tsx`**:
- Coluna "Pagamento" mostra o provider + meio + parcelas (`Cielo · Crédito 3x`, `Cielo · Pix`, ou `MP` pros antigos)
- Filtros por provider

**Venda manual** (`admin.venda-manual.tsx`): mesmo botão gera checkout Cielo com o meio escolhido.

---

## 7. Cron e deprecação MP

- Manter `api/public/mp.webhook.ts` e `reconcile-orders.ts` **ativos** até você confirmar que não há mais pedidos MP pendentes de webhook (histórico continua funcionando)
- Novo cron da Cielo entra em paralelo
- `MERCADO_PAGO_ACCESS_TOKEN` fica salvo mas sai de uso; removemos depois

---

## Detalhes técnicos

- **Auth Cielo**: OAuth2 client_credentials; token bearer com TTL ~20 min, cache in-memory por Worker
- **URL de webhook**: Cielo permite configurar no payload de criação do pedido via campo `Notification.url` → `https://project--{project-id}.lovable.app/api/public/cielo/webhook` (URL estável)
- **Idempotência**: unique `(payment_id, change_type)` em `cielo_webhook_events` + a RPC `confirm_order_paid` já é idempotente (checa `payment_status`)
- **Valor mínimo Pix Cielo**: R$ 0,01 (sem restrição prática)
- **Parcelamento 7x sem juros**: enviado no payload como `MaxNumberOfInstallments=7`, `Interest=ByMerchant`
- **Timeout HTTP**: 15s, retry 1x em erro de rede na criação de pedido
- **PCI**: N/A (tela hospedada Cielo)
- **Segurança do webhook**: como a Cielo não assina o payload, o handler sempre reconsulta o `PaymentId` na API antes de acreditar em qualquer status — impede spoofing

---

## Ordem de execução

1. **Migration** (colunas em `orders` + `cielo_webhook_events`)
2. `src/lib/cielo.server.ts` (client HTTP + auth)
3. `src/lib/cielo.functions.ts` (`createCieloCheckout`, `admin_refundCielo`)
4. `src/routes/api/public/cielo/webhook.ts` + `reconcile.ts` + cron
5. Frontend: seleção de meio/parcelas no `checkout.tsx` + `admin.venda-manual.tsx`
6. Ramificar `refunds.functions.ts` por provider
7. Ajustes de UI em `admin.pedidos.tsx`, `meus-pedidos.tsx`, `pedido.$id.tsx`
8. **Teste real**: 1 pedido de R$ 1,00 no crédito + 1 Pix, valida webhook + cashback + NFe
9. Só depois, tirar o MP dos caminhos ativos (mantendo leitura pra histórico)

Aprova pra eu começar pela migration?
