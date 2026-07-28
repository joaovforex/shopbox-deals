# LEVA 1 — Melhorias no Painel Admin

Escopo estritamente de UI/UX + proteções + audit log. Nenhuma alteração em pagamento, checkout, webhooks, reconciliação, RPCs fiscais, ou lógica de pedidos além de proteger a rota de exclusão.

## 1. Skeletons de carregamento (todas as telas admin)

Padrão único:
- Enquanto `isLoading`/`isPending` → renderiza `<AdminSkeleton />` (linhas/cards cinza pulsando).
- Só mostra estado vazio ("Nenhum produto ainda") quando `isSuccess && data.length === 0`.
- Novo componente `src/components/admin/AdminSkeleton.tsx` com variantes `table`, `cards`, `form`.

Aplicar em: `admin.tsx` (produtos), `admin.pedidos.tsx`, `admin.configuracoes.tsx`, `admin.expedicao.tsx`, `admin.fiscal.tsx`, `admin.reembolsos.tsx`, `admin.vale-troca.tsx`, `admin.venda-manual.tsx`, `admin.caixa-qr.tsx`, `admin.agendador-canal.tsx`, `admin.links.tsx`, `admin.equipe.tsx`.

## 2. Lista de produtos do admin — desempenho

- Já existe `list_products_paged` RPC com `p_limit/p_offset`. Trocar o fetch atual (que traz todos ~1.592) por paginação de 50 por página com botão "Carregar mais" / navegação `<Prev / Next>`.
- Thumbnails via `optimizedImage(url, { width: 128, quality: 60 })` + `width`/`height` + `loading="lazy"` + `decoding="async"`. Nunca URL original em listagem.

## 3. Exclusão de pedido protegida

- Restringir botão "Excluir" a Super Admin (usa `isSuperAdmin()`).
- Modal de confirmação exigindo digitar os últimos 8 caracteres do ID do pedido antes de habilitar "Excluir definitivamente".
- Botão estilizado em vermelho sólido, separado visualmente do "Estornar" (que fica neutro/âmbar).
- Manter DELETE físico (schema atual não tem soft-delete e criar um exige tocar em código de pedidos — fora do escopo). Registrar no audit log antes de excluir.

## 4. Log de auditoria

Migração:

```sql
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  user_name text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read audit" ON public.admin_audit_log FOR SELECT
  TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'));
CREATE POLICY "admins insert audit" ON public.admin_audit_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')
    OR has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'fulfillment')
    OR has_role(auth.uid(),'catalog')
  ));
```

Novo helper `src/lib/audit.ts` com `logAudit({ action, entity, entity_id, details })`. Chamado em: exclusão de pedido, estorno (registrar do UI), salvar cashback, `apply_global_discount`, `apply_category_discount`, `clear_global_discount`, `clear_category_discount`.

## 5. PII mascarada na lista de pedidos

- Utilitários em `src/lib/mask.ts`: `maskCpf`, `maskPhone`, `maskEmail`.
- Na tabela de pedidos, cada linha ganha ícone olho 👁 por campo. Toggle local (`useState<Set<string>>`). Busca continua no valor real (já filtrada server-side).

## 6. Endereço da loja — fonte única

- Adicionar coluna `store_address text` em `site_settings` (default = endereço atual de `whatsapp.ts`).
- Novo hook derivado de `useSiteSettings()` expondo `storeAddress`.
- Atualizar: `whatsapp.ts` (STORE_ADDRESS lê fallback), `FloatingActions.tsx` (link Google Maps), rodapé em `Header.tsx`, `faq.tsx`, `receiptPrint.ts`, `voucherReceipt.ts`, `refundReceipt.ts`.
- Campo editável na tela `admin.configuracoes.tsx` (Super Admin).
- Comentário `// TODO João: confirmar endereço correto no painel de Configurações` onde há fallback hard-coded.

## 7. Responsividade mobile

- `admin.pedidos.tsx`: em `md:hidden` renderiza cards empilhados (cliente, total, status, ações) em vez da tabela; `hidden md:block` mantém tabela.
- Botões de ação com `min-h-11 min-w-11` (44px alvo iOS HIG).
- `AdminSidebar` já tem versão mobile horizontal; garantir scroll horizontal com `overflow-x-auto` e chips com espaçamento.

## Arquivos a criar
- `src/components/admin/AdminSkeleton.tsx`
- `src/components/admin/DeleteOrderDialog.tsx`
- `src/lib/audit.ts`
- `src/lib/mask.ts`
- `src/lib/store-address.ts`

## Migrações
1. `admin_audit_log` (tabela + RLS + grants).
2. `site_settings.store_address` (coluna + default).

## Fora do escopo (não tocar)
- `src/lib/mercadopago.functions.ts`, `cielo*.ts`, `nfe.functions.ts`, `focusnfe.server.ts`, `orders.functions.ts`, rotas `api/public/*`, RPCs de pedidos/fiscal.

## Validação final
- `tsgo --noEmit` limpo.
- Verificação visual das rotas admin via Playwright (sessão injetada) confirmando skeleton → conteúdo.
