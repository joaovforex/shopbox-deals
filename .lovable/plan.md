# Emissão automática de nota fiscal (Focus NFe)

Integração com a **Focus NFe** para emitir **NFC-e** automaticamente em toda venda aprovada, com opção de **NF-e (modelo 55)** quando o cliente informar CPF/CNPJ do destinatário.

---

## 1. Banco de dados (migration única)

**Nova tabela `fiscal_config`** (singleton, 1 linha por loja):
- `cnpj`, `inscricao_estadual`, `razao_social`, `nome_fantasia`
- `regime_tributario` (`simples` | `presumido` | `real`)
- `endereco_*` (rua, número, bairro, cidade, UF, CEP, cód. município IBGE)
- `csc_id`, `csc_token` (para NFC-e — guardados criptografados)
- `ambiente` (`homologacao` | `producao`)
- `serie_nfce`, `serie_nfe`

**Novas colunas em `products`** (obrigatórias fiscalmente):
- `ncm` (8 dígitos), `cest` (opcional), `cfop` (default 5102/5405 conforme regime)
- `origem` (0–8), `cst_csosn` (Simples=CSOSN, outros=CST)
- `unidade_comercial` (default "UN"), `peso_liquido` (opcional)

**Novas colunas em `orders`**:
- `nfe_modelo` (`nfce` | `nfe`), `nfe_status` (`pending` | `processing` | `authorized` | `rejected` | `cancelled`)
- `nfe_ref` (nosso identificador enviado à Focus, ex.: `order_<uuid>`)
- `nfe_numero`, `nfe_serie`, `nfe_chave` (44 dígitos)
- `nfe_protocolo`, `nfe_authorized_at`
- `nfe_xml_url`, `nfe_danfe_url`
- `nfe_rejection_message`, `nfe_last_check_at`
- `destinatario_cpf_cnpj`, `destinatario_nome` (quando cliente quiser NF-e com dados)

---

## 2. Secrets

Via `add_secret`:
- `FOCUSNFE_TOKEN` — token de produção da Focus NFe
- `FOCUSNFE_TOKEN_HOMOLOG` — token de homologação (para testes)

Certificado A1 (.pfx) é **enviado direto no painel da Focus NFe** — não trafega pelo nosso app.

---

## 3. Helpers e server functions

**`src/lib/focusnfe.server.ts`** — cliente HTTP da Focus NFe:
- `emitirNFCe(payload)` — POST `/v2/nfce?ref=...`
- `emitirNFe(payload)` — POST `/v2/nfe?ref=...`
- `consultarNota(ref)` — GET `/v2/nfce/{ref}` ou `/v2/nfe/{ref}`
- `cancelarNota(ref, justificativa)` — DELETE
- `mapOrderToNotaPayload(order, items, config)` — monta JSON conforme layout da Focus

**`src/lib/nfe.functions.ts`** (server functions client-safe):
- `getMyOrderNota({ orderId })` — retorna URLs do XML/DANFE para `/meus-pedidos` e `/pedido/$id`
- `admin_emitirNotaManual({ orderId })` — reemissão manual pelo admin
- `admin_cancelarNota({ orderId, justificativa })`
- `admin_getFiscalConfig()` / `admin_updateFiscalConfig()` — tela de configuração

---

## 4. Trigger automático (pagamento confirmado → emite nota)

No **`src/routes/api/public/mp.webhook.ts`**, logo após `confirm_order_paid` retornar sucesso:

```
if (fiscal_config.ativo) {
  emitirNotaParaOrder(orderId).catch(logErrorButDontFail);
}
```

- Se `destinatario_cpf_cnpj` presente → **NF-e modelo 55**
- Senão → **NFC-e** (com CPF do cliente no campo consumidor)
- Falha na Focus **não bloqueia** o pedido (fica `nfe_status = 'pending'` para retry)

---

## 5. Rota pública de callback

**`src/routes/api/public/focusnfe/webhook.ts`** — a Focus NFe chama de volta quando o processamento assíncrono termina (autorizada/rejeitada). Verifica `ref`, atualiza `orders.nfe_status/nfe_chave/nfe_xml_url/nfe_danfe_url`. Como não há assinatura HMAC, valida o payload consultando novamente a Focus com o `ref` recebido.

---

## 6. Cron de reconciliação

**`src/routes/api/public/nfe/poll.ts`** (a cada 15 min):
- Pega pedidos com `nfe_status IN ('pending','processing')` das últimas 48h
- Consulta status na Focus e atualiza
- Faz **retry** de emissão quando `pending` há mais de 5 min sem `nfe_ref` gravado

Agendado via `pg_cron` + `pg_net`.

---

## 7. Frontend

**Checkout** (`/checkout`):
- Toggle opcional: "Quero nota com meu CPF/CNPJ" → mostra campos de destinatário
- Se marcado, `nfe_modelo = 'nfe'`, senão `nfce`

**Pedido / Meus Pedidos**:
- Quando `nfe_status = 'authorized'`: botão **"Baixar Nota Fiscal (PDF)"** e **"XML"**
- Enquanto `pending`/`processing`: badge "Nota fiscal em processamento"
- Se `rejected`: mostra o motivo

**Admin (`/admin/pedidos`)**:
- Coluna com badge do status fiscal
- Botão "Reemitir nota" (se falhou) e "Cancelar nota" (se autorizada, dentro do prazo legal)
- Link direto para o XML/DANFE

**Admin — nova tela `/admin/fiscal`**:
- Formulário completo do `fiscal_config`
- Toggle ambiente Homologação/Produção (começa em homologação)
- Instruções para upload do certificado no painel da Focus

**Admin — `ProductForm`**:
- Nova aba **"Fiscal"** com NCM, CFOP, CEST, origem, CST/CSOSN, unidade
- Validação de NCM (8 dígitos)
- Defaults sensatos por regime tributário

---

## 8. Fluxo de reembolso

Ao processar refund em `refunds.functions.ts`:
- Se `nfe_status = 'authorized'` e dentro do prazo legal de cancelamento (**24h para NFC-e, 24h para NF-e** em geral), chama `cancelarNota()`
- Fora do prazo, orienta emissão de **nota de devolução** (fase 2 — não incluída agora)

---

## Detalhes técnicos

- **Numeração**: Focus NFe cuida da numeração sequencial por série; guardamos o número retornado
- **Ambiente**: começa em `homologacao`. Admin troca para `producao` só depois de validar
- **Timeout HTTP**: 15s, retry 1x em erro de rede
- **CPF na NFC-e**: usa `orders.customer_cpf` (já existe); se ausente, emite "consumidor não identificado" (permitido)
- **Endereço na NF-e**: usa `shipping_*` do pedido quando `delivery_method = 'delivery'`
- **Item da nota**: monta a partir de `order_items` + join em `products` para pegar NCM/CFOP/CST
- **Cálculo de impostos**: Focus calcula automaticamente com base no regime + CST/CSOSN; não precisamos codar cálculo tributário
- **Idempotência**: `ref = 'order_<uuid>'` — se reprocessar o webhook, a Focus retorna a mesma nota

---

## Ordem de execução

1. Migration (fiscal_config + colunas em products/orders)
2. Solicitar `FOCUSNFE_TOKEN` + `FOCUSNFE_TOKEN_HOMOLOG`
3. Helpers Focus NFe + server functions
4. Tela `/admin/fiscal` para você preencher os dados da loja
5. Aba "Fiscal" no ProductForm + script para preencher NCM padrão nos 2.021 produtos existentes (você me passa o NCM mais comum ou eu uso `00000000` como placeholder até você revisar)
6. Hook no webhook MP para emitir automaticamente
7. Callback + cron de reconciliação
8. UI cliente (botões de download em pedido/meus-pedidos)
9. Cancelamento no fluxo de reembolso

**Teste**: começamos em ambiente de homologação, emitindo 1 pedido de teste, validando XML/DANFE, e só depois virando produção.

Aprova pra eu começar pela migration?
