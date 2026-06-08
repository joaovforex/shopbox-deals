# Deploy na Vercel

Este projeto está configurado para deploy na Vercel usando o preset `vercel` do Nitro (Node serverless functions). O build gera a estrutura `.vercel/output` esperada pela Vercel automaticamente.

## Passos

1. Faça push do repositório para o GitHub/GitLab/Bitbucket.
2. Acesse https://vercel.com/new e importe o repositório.
3. **Framework Preset**: deixe como `Other` (o `vercel.json` já cuida do resto).
4. **Build Command**: `bun run build` (já no `vercel.json`).
5. **Output Directory**: deixe em branco (Nitro grava em `.vercel/output`).
6. Configure as variáveis de ambiente abaixo em **Settings → Environment Variables**.

## Variáveis de ambiente obrigatórias

Copie os valores do seu `.env` local (Lovable Cloud / Supabase):

### Client (build-time, prefixo `VITE_`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

### Server (runtime)
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` ⚠️ secreta — nunca exponha no client
- `LOVABLE_API_KEY` (se usar Lovable AI Gateway)

Aplique todas em **Production**, **Preview** e **Development**.

## Após o deploy

- A Vercel cuida do roteamento via `.vercel/output/config.json` gerado pelo Nitro.
- Cada push para `main` faz deploy em produção; outras branches viram previews automáticos.
