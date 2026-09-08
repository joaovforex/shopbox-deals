# Auditoria da área do cliente + plano de redesign (mobile-first)

Base auditada: `0f56f1513aa1c0a7b66821999a7c035adc493680`. Nada foi alterado nem publicado.

## O que existe hoje

| Área | Onde está | Como busca os dados |
| --- | --- | --- |
| Pedidos (lista) | `src/routes/_authenticated/meus-pedidos.tsx` | consulta direta à tabela de pedidos do próprio cliente + atualização em tempo real |
| Pedido (detalhe) | `src/routes/pedido.$id.tsx` (rota **pública**) | `getPublicOrder` em `src/lib/orders.functions.ts` |
| Cashback | banner dentro de pedidos e perfil | `getMyCashback` em `src/lib/cashback.functions.ts` |
| Perfil + endereço | `src/routes/_authenticated/perfil.tsx` | `updateMyProfile` em `src/lib/profile.functions.ts` |
| Login / senha | `src/routes/auth.tsx`, `src/routes/reset-password.tsx` | login por e-mail/senha e recuperação por e-mail |
| Porta de entrada | `src/routes/_authenticated/route.tsx` | exige sessão e envia para `/auth` |
| Navegação | `src/components/Header.tsx` | menu topo/lateral + barra inferior no celular |

Permissões: as regras do banco já limitam corretamente cada cliente aos próprios pedidos, itens, cashback e perfil. As funções de servidor sensíveis usam autenticação obrigatória. Nenhuma falha de permissão foi encontrada.

## Problemas encontrados (evidências)

1. **Não existe uma "Minha conta".** Só há duas telas soltas (pedidos e perfil), sem página inicial da conta.
2. **A barra inferior do celular não tem acesso à conta** — `Header.tsx` linhas 296-332 têm apenas Início, Ofertas, Buscar e Carrinho. No celular, o cliente só chega à conta pelo menu sanduíche.
3. **O detalhe do pedido mostra dados propositalmente censurados ao próprio dono.** `orders.functions.ts` mascara nome, e-mail e telefone e devolve só cidade/UF, porque a rota é pública. Resultado: quem está logado vê menos do que deveria — sem endereço completo, sem cor/variante dos itens, sem frete e cashback separados.
4. **Itens do pedido não trazem cor/variante nem o produto de origem**, embora esses campos existam no banco — nem na lista nem no detalhe.
5. **Não existe recompra** ("comprar novamente"): a busca no projeto inteiro não encontrou nada.
6. **Cashback sem extrato**: só mostramos saldo e a próxima validade. Não há histórico de quanto entrou, de qual pedido veio, o que já foi usado e o que expirou.
7. **Estados de erro ausentes**: falhas ao carregar pedidos, perfil ou cashback são silenciosas (o cashback é engolido por um `catch` vazio). Só existe "Carregando...", sem esqueleto visual.
8. **A lista de pedidos carrega tudo de uma vez**, sem paginação — quem tem muitos pedidos paga o custo no celular.
9. **Código duplicado no perfil**: máscaras de CEP e lista de cidades atendidas repetidas ali, em vez de usar `src/lib/delivery-area.ts`. Risco de divergir do checkout.
10. **Segurança/sessão**: não há troca de senha para quem já está logado (só recuperação por e-mail), nem visão/encerramento de sessão dentro da conta.
11. **Frase fixa não garantida** em pedidos: "Você tem até 5 dias para retirar" — não achei regra no sistema que sustente esse prazo; precisa ser confirmada por você ou removida.

## Como testar sem pagamento real

- O ambiente já tem sessão de cliente disponível para testes automatizados de navegação logada.
- Já existe geração de pedido de teste pago (usada só por Super Admin) e concessão manual de cashback pelo admin — dá para montar cenários completos (pendente, pago, pronto, entregue, cancelado, com cashback) sem passar por cartão.
- Nada de teste toca Cielo/Asaas reais.

## Plano de implementação (só frontend + leitura, sem mexer em pagamentos nem no banco)

1. **Nova "Minha conta"** (`/minha-conta`): saudação, saldo de cashback com validade, último pedido em andamento com status, atalhos para pedidos, endereço, ajuda e sair.
2. **Navegação consistente**: trocar "Buscar" ou acrescentar um item "Conta" na barra inferior do celular e unificar os atalhos do menu, para que conta, pedidos e cashback sejam alcançáveis em um toque.
3. **Detalhe do pedido para o dono**: nova função de servidor autenticada que devolve o pedido completo do próprio cliente (endereço, itens com cor, frete, cashback usado, forma de pagamento). A tela pública de confirmação continua como está, censurada, para links compartilhados.
4. **Recompra segura**: botão "Comprar novamente" que reconsulta preço, estoque e variante atuais de cada item, adiciona ao carrinho pela mesma função existente (que já reserva estoque) e avisa claramente o que não pôde ser repetido.
5. **Cashback real**: tela de extrato com saldo, o que expira e quando, e histórico por pedido — usando uma nova função de leitura autenticada sobre os dados já existentes.
6. **Perfil e endereço**: reaproveitar a busca de CEP e a lista de cidades compartilhadas, separar "dados pessoais" de "endereço de entrega", e mostrar salvamento/erros com clareza.
7. **Estados e mobile**: esqueletos de carregamento, mensagens de erro com "tentar de novo", listas com paginação, alvos de toque confortáveis e nenhuma informação sensível exposta além do necessário.
8. **Segurança**: troca de senha para quem está logado (pedindo a senha atual) e um "sair" seguro que limpa os dados em cache.

## Precisa de banco?

Não para os itens 1-8. Tudo se apoia em tabelas, regras de acesso e funções que já existem; as novidades são duas leituras autenticadas novas (pedido do dono e extrato de cashback) e telas. Só exigiriam banco, e ficam fora deste plano: múltiplos endereços salvos, lista de desejos e histórico de sessões/dispositivos.

## Pendências para você decidir

- O prazo de "5 dias para retirar" é real? Mantenho, ajusto ou removo?
- Na barra inferior do celular, prefere substituir "Buscar" por "Conta" ou passar para cinco itens?
