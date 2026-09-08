# Área do cliente — auditoria e implementação

## Rotas e arquivos

| Rota | Arquivo | O que faz |
| --- | --- | --- |
| `/minha-conta` | `src/routes/_authenticated/minha-conta.tsx` | Resumo: saudação, saldo de cashback, últimos 2 pedidos, atalhos |
| `/meus-pedidos` | `src/routes/_authenticated/meus-pedidos.tsx` | Lista paginada (10 por vez), realtime, recompra |
| `/pedido/$id` | `src/routes/pedido.$id.tsx` | Acompanhamento público mascarado + bloco privado do dono |
| `/cashback` | `src/routes/_authenticated/cashback.tsx` | Saldo, validade, extrato e como usar |
| `/perfil` | `src/routes/_authenticated/perfil.tsx` | Dados pessoais + endereço salvo único |

Suporte:
- `src/lib/account-queries.ts` — consultas autenticadas (Supabase do navegador, RLS + filtro
  explícito por `user_id`): `currentUserId`, `fetchMyOrder`, `fetchMyCashbackLedger`,
  `fetchCashbackRate`, `buildRepurchasePlan`.
- `src/components/RepurchaseButton.tsx` — recompra usando preço/estoque/variantes ATUAIS.
- `src/lib/delivery-area.ts` — CEP/ViaCEP/cobertura RMC compartilhado com o checkout.

## Permissões (verificadas no banco, sem alterações)

- `orders`, `order_items`: leitura apenas do dono (ou admin).
- `cashback_entries`: leitura apenas do dono (ou admin).
- `profiles`: leitura/edição apenas de `auth.uid() = id`.
- `site_settings`: leitura pública (usado só para exibir a taxa vigente de cashback).

Nenhuma consulta nova usa acesso privilegiado; nenhuma server function nova foi criada.

## Problemas encontrados e corrigidos

1. Chaves de cache sem o id do usuário (`["my-orders", limit]`, `["cashback-balance"]`) —
   podiam exibir dados da conta anterior por instantes ao trocar de conta. Agora todas as
   chaves privadas incluem o id e só rodam depois da sessão.
2. Falha de serviço no cashback aparecia como “R$ 0,00”. Agora aparece “Saldo indisponível
   agora”, com nova tentativa. No backend, `getMyCashback` passou a verificar separadamente
   as falhas de saldo e de validade e lança mensagem genérica (única alteração de backend
   autorizada; RPCs, regras e formato de sucesso inalterados).
3. `/perfil` ficava “Carregando...” para sempre se a leitura falhasse. Agora tem erro claro
   e botão de tentar de novo.
4. E-mail do cadastro era confundido com o e-mail de login. Agora há aviso explícito de que
   alterar o contato não muda a credencial de acesso.
5. Acompanhamento público anunciava etapa/sucesso mesmo sem pedido carregado. Agora separa
   carregando / erro / pedido não encontrado, e blocos de retirada e entrega só aparecem
   quando o pedido existe.
6. Recompra inexistente. Agora relê preço, atividade, estoque e variantes atuais; item que
   exige escolha de cor leva à página do produto; sucesso parcial é informado item a item.
7. Taxa de cashback fixa em texto (“5%”) na área do cliente — passou a usar a taxa vigente
   de `site_settings` onde é exibida.

## Fora de escopo / precisa de backend

- Múltiplos endereços: o perfil suporta apenas um endereço (schema atual).
- Gestão de sessões ativas (listar/encerrar dispositivos): exigiria backend novo.
- Troca de senha com verificação da senha atual: não implementada; a recuperação de senha
  existente continua sendo o caminho.
