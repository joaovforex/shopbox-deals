# Integração Mais Entregas (entregas em Curitiba)

Adicionar opção de **entrega em domicílio** no checkout, em paralelo à retirada na loja que já existe. Frete grátis por enquanto (a loja absorve o custo).

---

## 1. Banco de dados

Novas colunas em `orders`:
- `delivery_method` (`pickup` | `delivery`) — já existe parcialmente
- `delivery_cep`, `delivery_street`, `delivery_number`, `delivery_complement`, `delivery_neighborhood`, `delivery_city`, `delivery_state`, `delivery_recipient_name`, `delivery_recipient_phone`
- `delivery_fee` (numeric, R$ — sempre 0 por enquanto)
- `maisentregas_order_id` (id retornado pela API)
- `maisentregas_status` (último status_text)
- `maisentregas_tracking_url` (link público de rastreio do cliente)
- `maisentregas_last_check_at` (timestamp do último poll)

Endereço de retirada da loja fica hardcoded em `src/lib/config.server.ts`:
- CEP 83408-290, Rua Emílio Gleber, 1118, Curitiba/PR

## 2. Secrets

Vou solicitar 2 secrets via formulário seguro:
- `MAISENTREGAS_EMAIL` — email da conta Mais Entregas do dono
- `MAISENTREGAS_APIKEY` — apikey gerada no painel deles

(O `APP_ID` fica fixo como `"shopbox"` no código.)

## 3. Server functions e rotas (TanStack)

Helper `src/lib/maisentregas.server.ts`:
- `auth()` — POST /auth, cache do JWT em memória até expirar
- `preconfirm(payload)` — cota de frete
- `confirm(payload)` — cria entrega real
- `getOrderStatus(id)` — busca status

Server functions client-safe (`src/lib/maisentregas.functions.ts`):
- `quoteDelivery({ cep })` — chamada do checkout para mostrar preço e validar CEP (mesmo que frete seja 0, valida cobertura)
- `getMyOrderTracking({ orderId })` — usado em `/meus-pedidos` (com `requireSupabaseAuth`)

Rotas públicas:
- `/api/public/maisentregas/poll` — cron a cada 10 min: pega pedidos com `maisentregas_order_id` cujo status não é final, atualiza status no banco

Trigger automático na confirmação de pagamento:
- Em `confirm_order_paid` (RPC) ou no webhook do MP, após marcar `paid`, se `delivery_method = 'delivery'` e ainda não tem `maisentregas_order_id`, chama `createDeliveryForOrder(orderId)` em background, que faz o POST /order/confirm na Mais Entregas e salva o id + tracking_url

## 4. Frontend — checkout

Na tela `/checkout`, adiciona um seletor:
- ( ) Retirar na loja — Grátis
- ( ) Receber em casa — Grátis (promoção de abertura)

Quando "Receber em casa" estiver marcado, mostra campos:
- CEP (com autocomplete via ViaCEP — já é API pública grátis)
- Rua, número, complemento, bairro (preenchidos do ViaCEP)
- Cidade trava em "Curitiba" (se ViaCEP retornar outra cidade, mostra erro: "Por enquanto entregamos apenas em Curitiba")
- Nome de quem recebe (default: o nome do cliente)
- Telefone de quem recebe (default: o WhatsApp do cliente)

Antes de "Pagar", chama `quoteDelivery` pra validar cobertura na Mais Entregas. Se falhar, mostra erro e bloqueia.

Salva todos os campos de entrega no `createMpPreference` (vou estender essa server fn).

## 5. Frontend — meus pedidos

Em `/meus-pedidos`, para cada pedido de delivery pago:
- Mostra status atual da entrega (`maisentregas_status`)
- Botão "Acompanhar entrega" → abre `maisentregas_tracking_url` em nova aba
- Endereço pra onde foi enviado

## 6. Frontend — admin

Em `/admin/expedicao`:
- Coluna mostrando se é Retirada ou Entrega
- Para entregas, mostra status atual da Mais Entregas + link de rastreio
- Em `/admin/pedidos`, mostra os dados completos de endereço

## 7. Integração com fluxo existente

- **Reservas de estoque**: continuam idênticas, não muda nada
- **Webhook MP** (`mp.webhook.ts`): após `confirm_order_paid` retornar sucesso, se for delivery, dispara `createDeliveryForOrder` (em background, com try/catch — se a Mais Entregas falhar, o pedido continua pago e a gente loga pra retry manual; vou adicionar isso ao cron de reconciliação também)
- **Reembolsos**: ao reembolsar um pedido com `maisentregas_order_id`, tenta cancelar a entrega na Mais Entregas se ela ainda não saiu

## Detalhes técnicos

- Cache do JWT da Mais Entregas em variável de módulo no Worker, com refresh quando faltar < 5 min pra expirar
- Toda chamada externa tem timeout de 10s e retry simples (1x) em erros de rede
- Endereço na Mais Entregas: `address[0]` = loja (pickup), `address[1]` = cliente (delivery), conforme docs
- `payment.modality = "sender"` (a loja paga o frete), `payment.method = "billed"` (cobrança via fatura mensal da Mais Entregas)
- Status finais que param o polling: `entregue`, `cancelado`, `devolvido`
- ViaCEP via `fetch("https://viacep.com.br/ws/{cep}/json/")` — sem secret

## Ordem de execução

1. Migration (colunas novas em `orders`)
2. Pedir os 2 secrets
3. Helpers da Mais Entregas + server functions
4. UI do checkout (seletor + endereço + CEP)
5. Hook no webhook MP pra criar entrega
6. UI em `/meus-pedidos` e `/admin/expedicao`
7. Cron de polling de status
8. Cancelamento de entrega no fluxo de reembolso
