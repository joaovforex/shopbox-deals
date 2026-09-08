# Área do cliente + home simplificada — validação executada

Ambiente: preview local (`localhost:8080`), sessão de teste já injetada no ambiente.
Nada foi publicado. Nenhum pedido, pagamento ou cashback foi criado/alterado.

## 1. Typecheck e testes

- `bunx tsgo --noEmit -p tsconfig.json` → **exit 0, sem erros**.
- `bun test` → **5 testes, 14 verificações, 0 falhas** (`src/lib/__tests__/cashback-config.test.ts`).
  Os testes importam `bun:test`; rodar com `bun test`, não com vitest.

## 2. Navegação real (Playwright, sessão injetada)

Rodado em 390x844 (celular) e 1280x1800 (desktop).

| Rota | 390px | 1280px |
| --- | --- | --- |
| `/` (home nova) | H1 “Super descontos todos os dias”, sem overflow | idem |
| `/loja` | “Ofertas shopbox”, sem overflow | idem |
| `/faq` | carregou, sem overflow | idem |
| `/minha-conta` | “Olá, Joao!”, sem overflow | idem |
| `/meus-pedidos` | carregou, sem overflow | idem |
| `/cashback` | carregou, sem overflow | idem |
| `/perfil` | carregou, sem overflow | idem |

Console: **nenhum erro no desktop**. No celular apareceram apenas `TypeError: Failed to fetch`
do cliente de dados durante navegações encadeadas rápidas (requisição abortada ao trocar de
página no script), com fallback já existente no catálogo; as telas renderizaram normalmente.
Captura da home em `/tmp/browser/home/home_m.png` (ambiente temporário de teste).

## 3. Revisão da área do cliente (commit atual)

- Única mudança server-side: tratamento de erro em `getMyCashback` (`src/lib/cashback.functions.ts`),
  que agora falha com mensagem genérica em vez de virar R$ 0,00. RPCs e formato de sucesso intactos.
- `src/lib/account.functions.ts` **não existe** — as leituras privadas usam
  `src/lib/account-queries.ts` com cliente autenticado, RLS e filtro explícito por `user_id`.
- Chaves de cache privadas incluem o id do usuário e só habilitam após a sessão
  (`minha-conta`, `meus-pedidos`, `cashback`).
- Troca de senha própria **removida**: `/perfil` agora só dispara o link de recuperação já
  existente (`resetPasswordForEmail` → `/reset-password`).
- Recompra: exige escolha na página do produto quando há variante nova/ausente, informa itens
  indisponíveis, sucesso parcial e agora também **redução de quantidade** por estoque.

## 4. Home simplificada

`src/routes/index.tsx`: hero compacto (título, subtítulo, busca, uma ação principal), vitrine
única “Ofertas de hoje” (até 12 produtos reais em estoque, maior desconto primeiro), faixa de
confiança e um bloco curto de cashback/retirada. Saíram: grade de categorias, segunda vitrine
“Mais ofertas”, CTA final duplicado e o `<AnnouncementBanner />` de imagem alta, para que a busca
e as ofertas apareçam cedo. SEO (title/description/OG/canonical/JSON-LD Store) e a taxa de
cashback dinâmica foram preservados. Nenhuma urgência, escassez ou prazo inventado.

### 4.1 Banner restaurado por solicitação do usuário

- `src/routes/index.tsx`: o `<AnnouncementBanner />` foi **restaurado** logo após o `<Header />`,
  a pedido explícito do usuário. A remoção anterior (registrada nesta seção) não se aplica mais.
  O componente segue intacto em `src/components/AnnouncementBanner.tsx`, com imagens
  desktop/mobile dinâmicas via `site_settings` (fallback para os assets locais).

### 4.2 Topo mobile simplificado

- `src/components/Header.tsx`: no mobile, o topo direito mostra apenas três controles diretos,
  com toque uniforme (h-10 w-10) e aria-labels: **carrinho** (com badge de quantidade), **tema**
  e **perfil/conta** (vai para `/minha-conta` autenticado ou `/auth` deslogado).
- `OnlineCounter` ficou exclusivo do desktop (`hidden md:block`).
- O botão “Sair” solto e o menu hamburger foram removidos do topo mobile. A navegação principal
  mobile continua na barra inferior (início, ofertas, busca, carrinho, conta); categorias seguem
  acessíveis pelos filtros da loja.
- Saída de conta no mobile: nova seção “Sessão” em `src/routes/_authenticated/perfil.tsx`
  (`SignOutSection`), que reutiliza a mesma limpeza do Header (cache de papéis, carrinho local,
  `supabase.auth.signOut()` e reload completo), com feedback de erro.
- Desktop inalterado: contador online, “Minha conta”, “Admin”, carrinho, tema e sair continuam
  no topo como antes.

### 4.3 Validação (Playwright, após 4.1 e 4.2)

- 390x844 anônimo: sem overflow, banner presente, topo com Carrinho / tema / Entrar.
- 390x844 autenticado: sem overflow, banner presente, topo com Carrinho / tema / Minha conta;
  `/perfil` exibe a seção “Sessão” com o botão “Sair da conta” (não clicado — sem logout real).
- 1280x1800 anônimo: sem overflow, navegação desktop completa preservada, banner presente.
- Console sem erros nas três execuções. Typecheck (`tsgo`) e `bun test` (5 testes, 14 expect) OK.

## 5. Não testado de ponta a ponta

- Conclusão de recompra até o carrinho com reserva de estoque em produto real.
- Falha proposital das RPCs de cashback (validada por leitura de código e tipagem).
- Salvamento do perfil de um cliente real e envio real do e-mail de troca de senha.
- Troca de conta/logout com duas contas reais distintas.
