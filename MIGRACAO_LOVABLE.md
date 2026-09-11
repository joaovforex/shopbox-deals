# Saída controlada da Lovable

O objetivo é executar a loja pelo GitHub, Vercel e um Supabase pertencente à
empresa, sem depender de créditos Lovable.

## Arquitetura de destino

- aplicação SSR, APIs, webhooks e checkout: Vercel;
- banco, autenticação, storage, realtime e pg_cron: Supabase próprio;
- domínio canônico: `https://shopboxonline.com`;
- código e CI/CD: GitHub.

## Dependências Lovable que ainda impedem o desligamento

1. O build usa `@lovable.dev/vite-tanstack-config`.
2. A fila de e-mails usa `@lovable.dev/email-js` e `LOVABLE_API_KEY`.
3. A função opcional de descrição por IA usa o gateway da Lovable.
4. As rotas MCP usam `@lovable.dev/mcp-js`.
5. Alguns jobs do Supabase chamam URLs `lovable.app`.

Não cancele a Lovable enquanto esses cinco itens não forem removidos ou
substituídos e o ambiente paralelo não tiver passado pelos testes.

## Ordem de migração

1. Confirmar que o projeto Supabase indicado em `supabase/config.toml`
   aparece na conta da empresa. Se não aparecer, exportar schema, dados,
   usuários e objetos de Storage para um novo projeto.
2. Criar um projeto Vercel importando este repositório e configurar todas as
   variáveis listadas em `.env.example`, além das credenciais dos provedores.
3. Substituir e-mail e IA por provedores independentes e remover as rotas MCP
   caso não sejam necessárias ao negócio.
4. Implantar em um endereço temporário da Vercel e testar login, catálogo,
   carrinho, checkout, webhook, reconciliação, estorno, frete e administração.
5. Aplicar a migration de segurança incluída neste PR.
6. Executar manualmente `supabase/manual/post-lovable-cutover.sql` somente
   depois de `https://shopboxonline.com` apontar para a Vercel e responder.
7. Atualizar callbacks da Cielo, Asaas, Supabase Auth e Google Merchant.
8. Observar logs e pedidos por pelo menos 48 horas. Só então desconectar o
   projeto do GitHub na Lovable e cancelar o plano.

## Rollback

Durante a observação, mantenha a publicação Lovable intacta. Se checkout,
webhook ou autenticação falhar, restaure o DNS anterior e não execute o
cancelamento. As migrations históricas nunca devem ser editadas; correções são
sempre adicionadas em novos arquivos.
