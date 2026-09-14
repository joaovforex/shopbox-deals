# Deploy na Vercel (Supabase próprio, sem Lovable)

O build usa o preset `vercel` do Nitro (ativado automaticamente pela variável `VERCEL` que a Vercel injeta)
e gera `.vercel/output` (Build Output API v3). Não há passo de pós-build.

## Importar o projeto
1. https://vercel.com/new → importar `joaovforex/shopbox-deals`.
2. **Framework Preset**: `Other` (o `vercel.json` define `bun run build` / `bun install`).
3. **Output Directory**: em branco.
4. Cadastrar as variáveis abaixo em **Settings → Environment Variables** (Production + Preview).
5. Deploy → testar na URL `*.vercel.app` antes de apontar o domínio.

## Variáveis de ambiente
Valores do **Supabase novo** (`ivvghjzzhldcvzxaxwty`): Project Settings → API.

| Variável | Onde pegar | Obrigatória |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://ivvghjzzhldcvzxaxwty.supabase.co` | sim |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon / publishable key | sim |
| `VITE_SUPABASE_PROJECT_ID` | `ivvghjzzhldcvzxaxwty` | sim |
| `SUPABASE_URL` | mesma URL acima | sim |
| `SUPABASE_PUBLISHABLE_KEY` | mesma anon key | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (secret) — usada nas rotas de cron/webhook e admin | sim |
| `CIELO_MERCHANT_ID`, `CIELO_CLIENT_ID`, `CIELO_CLIENT_SECRET` | painel Cielo (mesmos valores usados na Lovable) | sim (pagamento) |
| `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN` | painel Asaas | se usar Asaas |
| `MAISENTREGAS_EMAIL`, `MAISENTREGAS_APIKEY`, `MAISENTREGAS_APP_ID`, `MAISENTREGAS_BASE_URL` | Mais Entregas | se usar entregas |
| `FOCUSNFE_TOKEN`, `FOCUSNFE_TOKEN_HOMOLOG` | Focus NFe | se emitir NF |

Na Lovable esses segredos ficam em Cloud → Secrets; copie os mesmos valores (não os cole em chat).

## No Supabase novo (uma vez)
- **Authentication → URL Configuration**: Site URL = URL do site (Vercel e depois `https://shopboxonline.com`);
  Redirect URLs: `https://<site>/**`.
- **Authentication → Providers → Email**: manter "Confirm email" igual ao ambiente antigo (na Lovable os
  cadastros eram confirmados automaticamente).
- **Authentication → SMTP**: configurar um SMTP próprio (ex.: Resend) — o SMTP padrão do Supabase tem limite
  baixíssimo e os clientes vão usar "Esqueci minha senha" após a migração.
- `app_secrets`: `cron_secret` e `cron_allowed_ips` (criados pelo script de migração).
- Crons (pg_cron) apontam para `APP_BASE_URL/api/public/...` — reagendar quando a URL final mudar
  (`python3 run_migration.py crons` no pacote de migração).

## O que foi removido do código na saída da Lovable
- Servidor MCP (`/mcp`, `/.well-known/oauth-protected-resource`, `src/lib/mcp`) — dependia de `cloudflare:workers`.
- Fila de e-mail `@lovable.dev/email-js` (`/lovable/email/queue/process`) — nunca foi usada (0 envios).
- `@lovable.dev/cloud-auth-js` (login social via Lovable) — não era usado; login é e-mail/senha do Supabase.
