# Segurança do painel — checklist manual

Este documento reúne itens de segurança que **precisam ser feitos no painel
do backend (Lovable Cloud / Supabase)** porque não podem ser garantidos apenas
por código:

1. **Proteção contra senhas vazadas**
   - Ativar "Leaked password protection" (banco de senhas comprometidas do
     HaveIBeenPwned) no painel de Autenticação. Bloqueia senhas conhecidas
     publicamente na criação/troca de senha.

2. **MFA obrigatório para contas admin/manager**
   - Ativar TOTP (aplicativo autenticador) para todos os usuários com papel
     `admin` ou `manager`. Recomendado exigir MFA também para `catalog`.

3. **Rotação de segredos**
   - `cron_secret`, `MERCADO_PAGO_WEBHOOK_SECRET`, `MERCADO_PAGO_ACCESS_TOKEN`,
     `CIELO_MERCHANT_KEY` — girar periodicamente e após saída de qualquer
     pessoa com acesso ao painel.
   - `cron_allowed_ips` deve estar populado (CSV de IPs / CIDRs) para que
     o `enforceCronIpAllowlist` deixe de operar em modo "fail-open".

4. **Preferir variáveis de ambiente a `app_secrets`**
   - Segredos de gateway de pagamento (Mercado Pago, Cielo) devem viver em
     Project Settings → Secrets, não em `public.app_secrets`. Mantemos apenas
     `cron_secret` e `cron_allowed_ips` na tabela porque precisam ser lidos
     dentro do banco (pg_cron) e por rotas que ainda não têm binding direto
     de env — migrar para env quando possível.

5. **Buckets de storage**
   - `product-images` e `site-assets` são somente-leitura pública (via política
     RLS de `SELECT` em `storage.objects`). Escrita restrita a admin/manager/
     catalog. Não trocar para `public: true` no nível do bucket.

6. **Webhook Cielo**
   - A Cielo não assina o payload. O handler `/api/public/cielo/webhook`
     SEMPRE reconsulta a Cielo (`getOrder` / `getOrderByOrderNumber`) antes
     de marcar um pedido como pago — nunca confie em `payment_status` do
     corpo. Toda confirmação vira registro em `admin_audit_log`.
