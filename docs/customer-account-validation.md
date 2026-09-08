# Área do cliente — validação executada

Ambiente: preview local (`localhost:8080`), sessão de teste já injetada no ambiente.
Nada foi publicado. Nenhum pedido, pagamento ou cashback foi criado/alterado.

## 1. Typecheck

`bunx tsgo --noEmit -p tsconfig.json` → **exit 0, sem erros**.

## 2. Testes automatizados

`bun test` → **5 testes, 14 verificações, 0 falhas** (`src/lib/__tests__/cashback-config.test.ts`).
Observação: os testes importam `bun:test`; devem ser rodados com `bun test`, não com vitest.

## 3. Navegação real (Playwright, 390x844, sessão injetada)

| Rota | Resultado |
| --- | --- |
| `/minha-conta` | carregou — “Olá, Joao!”, saldo R$ 74,00 com validade em 23 dias, 2 últimos pedidos com botão Comprar novamente |
| `/meus-pedidos` | carregou — “Meus pedidos” |
| `/cashback` | carregou — “Meu cashback” |
| `/perfil` | carregou — “Meu perfil” |

Erros de console: **nenhum**. Overflow horizontal: **nenhum** nas quatro telas.
Capturas em `/tmp/browser/conta_*.png` (ambiente temporário de teste).

## 4. O que é real e o que não foi testado de ponta a ponta

Real: leitura de conta autenticada, saldo/validade de cashback, lista e resumo de pedidos,
renderização e responsividade das telas.

**Não testado com execução real** (por decisão de não tocar em dados de clientes nem em
pagamento):
- Conclusão de recompra até o carrinho com reserva de estoque em um produto real.
- Falha proposital das RPCs de cashback (o novo tratamento de erro foi validado por leitura
  de código e tipagem, não por indisponibilidade forçada do banco).
- Salvamento do perfil de um cliente real.
- Troca de conta/logout com duas contas reais distintas; a proteção foi implementada pelas
  chaves de cache com id do usuário e `enabled` após a sessão.
