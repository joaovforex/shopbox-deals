# Carrossel de banners administrável — proposta (NÃO implementada)

Status: **somente documentação**. Nenhuma migração, alteração de schema, política RLS,
bucket ou arquivo de aplicação foi executada/alterada para este documento.

## 1. Por que parou aqui

Leitura do banco confirmou que `public.site_settings` guarda **apenas**
`banner_desktop_url` e `banner_mobile_url` (text, linha única `id = 1`).
Isso comporta **um** par de imagens, não vários slides ordenáveis/ativáveis.
Um carrossel administrável exige nova tabela — mudança de schema — que só pode ser
feita com aprovação explícita. Por isso: auditar e documentar primeiro.

Hoje o consumo é feito por `src/components/AnnouncementBanner.tsx`, que lê
`useSiteSettings()` e cai nos assets locais
(`src/assets/cashback-banner-wide.jpg.asset.json` e `...-mobile...`) quando os campos
estão nulos.

## 2. Tabela recomendada: `public.site_banners`

Campos mínimos:

| Campo | Tipo | Observação |
| --- | --- | --- |
| `id` | uuid PK default `gen_random_uuid()` | |
| `desktop_url` | text NOT NULL | 1600x500 |
| `mobile_url` | text NOT NULL | 800x800 |
| `alt_text` | text NOT NULL | obrigatório para acessibilidade/SEO |
| `link_url` | text NULL | destino do clique; vazio = slide não clicável |
| `sort_order` | integer NOT NULL default 0 | ordenação ascendente |
| `is_active` | boolean NOT NULL default true | |
| `starts_at` | timestamptz NULL | janela opcional de exibição |
| `ends_at` | timestamptz NULL | janela opcional de exibição |
| `created_at` | timestamptz NOT NULL default now() | |
| `updated_at` | timestamptz NOT NULL default now() | trigger `set_updated_at` já existe |
| `updated_by` | uuid NULL | quem alterou por último |

Índice sugerido: `(is_active, sort_order)`.

Regras de janela devem ficar em **trigger de validação** (não em CHECK), porque
`now()` não é imutável — mesma convenção já usada no projeto.

## 3. Grants e RLS (a aplicar somente após aprovação)

Ordem obrigatória: CREATE TABLE → GRANT → ENABLE RLS → POLICIES.

- `GRANT SELECT ON public.site_banners TO anon, authenticated;`
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_banners TO authenticated;`
- `GRANT ALL ON public.site_banners TO service_role;`

Políticas:

- **Leitura pública** (`anon`, `authenticated`): apenas `is_active = true`
  E (`starts_at IS NULL OR starts_at <= now()`) E (`ends_at IS NULL OR ends_at > now()`).
- **Escrita** (insert/update/delete): apenas super admin, reutilizando o helper
  existente `public.has_role(auth.uid(), 'admin')` — o mesmo padrão já usado em
  `site_settings`. Nada de service role no navegador; toda escrita passa pela sessão
  do próprio administrador com RLS ativa.
- Nenhuma política deve depender de valores enviados pelo cliente para decidir papel.

## 4. Armazenamento das imagens

- Bucket já existente para assets do site (`site-assets`), mantendo o comportamento atual
  de URL do bucket usado hoje pelos campos de `site_settings`.
- Tamanhos mantidos: **desktop 1600x500** e **mobile 800x800**.
- Limite por arquivo: **5 MB**; formatos `jpg/png/webp`; conversão para WebP no upload,
  como já é feito no upload de produtos.
- Se o bucket for privado, as URLs continuam sendo geradas do mesmo modo que hoje
  (mesma função de URL usada pelo banner atual) — a proposta não muda a natureza do
  bucket nem expõe caminhos novos.
- Nomear objetos por `banners/<uuid>-<desktop|mobile>.webp` para evitar colisão e
  facilitar limpeza ao remover o slide.

## 5. Migração dos dados atuais

1. Criar a tabela vazia.
2. Inserir **um** slide a partir de `site_settings` quando ambos os campos existirem:
   `sort_order = 0`, `is_active = true`, `alt_text` com o texto atual do componente.
3. Se os campos estiverem nulos, **não** inserir nada — o frontend continua com os
   assets locais como fallback.
4. Manter `site_settings.banner_*` intactos por pelo menos um ciclo, como rede de
   segurança; só depois considerar depreciação.
5. Frontend passa a ler `site_banners`; com zero slides ativos, cai para
   `site_settings` e depois para os assets locais (fallback em três níveis).

## 6. Administração (tela)

Na área de configurações restrita a super admin:

- listar slides com miniatura desktop/mobile, ordem, status e janela;
- adicionar slide com upload **do par** desktop + mobile (bloquear salvar com só um);
- validar dimensões recomendadas e tamanho (5 MB), avisando sem bloquear se a proporção
  divergir levemente;
- `alt_text` obrigatório; `link_url` validado (relativo interno ou `https://`);
- reordenar por arrastar ou botões subir/descer (grava `sort_order`);
- ativar/desativar sem apagar; remover apaga o registro e os objetos do bucket;
- prévia lado a lado nas duas larguras antes de salvar;
- toda ação registrada no log de auditoria existente.

## 7. Frontend do carrossel

- Autoplay **5–7s**, pausando em `hover`, `focus-within` e quando a aba está oculta.
- Swipe no celular (scroll-snap nativo, sem biblioteca pesada).
- Setas e indicadores como `<button>` reais, com `aria-label` (“Banner 2 de 4”).
- Teclado: setas esquerda/direita quando o carrossel tem foco; ordem de tabulação sã.
- `aria-live="polite"` discreto anunciando o slide atual apenas em troca manual.
- `prefers-reduced-motion: reduce` → sem autoplay e sem transição animada.
- Sem layout shift: contêiner com `aspect-ratio` fixo por breakpoint e `width`/`height`
  nas imagens.
- Imagens responsivas com `<picture>` (mobile/desktop) e `srcset`; **primeiro slide
  `eager` + `fetchpriority=high`**, demais `lazy`.
- Um slide só (ou nenhum) renderiza sem setas/indicadores/autoplay.

## 8. Analytics

Usando a camada existente (`src/lib/analytics.ts`, `pushEvent`), sem dados pessoais:

- `banner_impression` — `{ banner_id, index, total }` ao entrar em viewport;
- `banner_click` — `{ banner_id, index, link_url }`;
- opcional: `banner_slide_change` com origem (`auto | arrow | dot | swipe`).

Nunca enviar e-mail, CPF, telefone, endereço ou id de usuário.

## 9. Critérios de aceite

1. Admin cria, reordena, ativa/desativa e remove slides; a home reflete em seguida.
2. Sem slides ativos, a home mostra o banner atual (fallback) sem quebrar.
3. Leitura pública devolve apenas slides ativos e dentro da janela; usuário comum não
   consegue escrever (teste direto contra a API).
4. 390px: swipe funciona, sem corte lateral, sem CLS perceptível.
5. Desktop: setas/indicadores acessíveis por teclado; autoplay pausa em hover/foco.
6. `prefers-reduced-motion` desliga o movimento.
7. Lighthouse: LCP do primeiro slide não pior que o banner atual.
8. Eventos disparam uma vez por impressão/clique, sem PII.

Testes: typecheck, testes existentes, navegação Playwright 390x844 e 1280px, verificação
de console e overflow, e checagem manual das policies com sessão não-admin.

## 10. Riscos e rollback

| Risco | Mitigação |
| --- | --- |
| Piora de LCP com múltiplas imagens | só o primeiro slide eager; demais lazy |
| Admin sobe imagem errada/pesada | validação de tamanho/dimensão + prévia |
| Policy mal escrita expondo escrita | revisar com o mesmo helper `has_role` já auditado |
| Carrossel rouba clique das ofertas | manter altura contida e ofertas logo abaixo |

Rollback: desativar todos os slides (`is_active = false`) devolve a home ao banner atual
imediatamente, sem deploy. Rollback completo = remover o componente de carrossel e voltar
a `AnnouncementBanner`; a tabela pode ficar órfã sem efeito colateral, pois
`site_settings.banner_*` continua intacto.

## 11. Estado

Nada foi executado: **sem migração, sem tabela, sem policy, sem bucket novo, sem
alteração de código de aplicação, sem publicação.** Este documento é o pedido formal de
aprovação da mudança de schema descrita no item 2.
