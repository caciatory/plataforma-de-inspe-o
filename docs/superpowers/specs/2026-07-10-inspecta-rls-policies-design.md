# RLS Policies — Inspecta v1.0

> Deriva de `docs/especificacao-tecnica-v1.md` §3 (Mapa de Permissões) e §4 (Estrutura de Dados), e de `docs/database-schema-v1.md` (schema já implementado, migrations 00001–00007). Fecha o item deixado pendente no schema: "nenhuma policy de Row Level Security ainda — sem elas, qualquer técnico autenticado pode ler as inspeções de outro técnico."

## 1. Escopo

Cobre exclusivamente as duas roles autenticadas do Mapa de Permissões: **técnico** e **admin** (`public.users.role`). MVP tem um único admin — sem hierarquia entre admins, sem preparo de schema para múltiplos admins (RNF-20/21 já removidos do spec técnico, PRD §5).

**Fora de escopo deste documento:** acesso de Cliente (site) e Público ao relatório. Esse acesso passa pela barreira de email+origem (RF-55/56), que não é uma sessão Supabase autenticada — será implementado depois via service-role/edge function, que ignora RLS por definição. As tabelas relevantes (`client_access_logs`) recebem `ENABLE ROW LEVEL SECURITY` sem nenhuma policy: default-deny para `anon`/`authenticated`, sem abrir SELECT/INSERT público. Isso não bloqueia esse trabalho futuro (service_role sempre ignora RLS), só evita desenhar agora um mecanismo de acesso que ainda não existe.

Fora de escopo também: DELETE. Nenhuma tabela ganha policy de DELETE — cancelamento/arquivamento é UPDATE de status (`status = 'cancelada'`), já coberto pelas policies de UPDATE do admin. Sem policy de DELETE, RLS nega por padrão para todo mundo.

## 2. Helper functions

Três funções `STABLE`, `SECURITY INVOKER`, reutilizadas nas ~12 tabelas — evitam repetir o mesmo `EXISTS` subquery em ~25+ policies:

```sql
create function public.is_admin() returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid()) and role = 'admin'
  )
$$;

create function public.owns_inspection(insp_id uuid) returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.inspections
    where id = insp_id and tecnico_id = (select auth.uid())
  )
$$;

create function public.owns_editable_inspection(insp_id uuid) returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.inspections
    where id = insp_id and tecnico_id = (select auth.uid())
      and status in ('rascunho', 'devolvida')
  )
$$;
```

- `owns_inspection` gates **reads**: técnico sempre vê a própria inspeção, qualquer que seja o status.
- `owns_editable_inspection` gates **writes**: técnico só edita (INSERT/UPDATE) enquanto o status da inspeção é `rascunho` ou `devolvida`. Uma vez `aguardando_aprovacao`, `aprovada` ou `cancelada`, só admin edita — bate com a linha "Editar inspeção já respondida/finalizada ❌ Técnico, ✅ Admin (com log de auditoria)" do Mapa de Permissões.
- `(select auth.uid())` em vez de `auth.uid()` bare: padrão recomendado pelo Supabase para permitir cache do valor como initplan em vez de reavaliar por linha — grátis, não é complexidade extra.
- `security invoker` (não `definer`): as três funções só confirmam algo que o usuário já teria como ler sozinho via RLS daquela tabela (a própria linha em `users`, a própria inspeção em `inspections`) — não há escalonamento de privilégio a esconder, então `definer` seria complexidade sem necessidade.
- `set search_path = ''` com nomes totalmente qualificados (`public.users`, `public.inspections`): mitigação padrão contra search_path hijacking em funções usadas por RLS.

## 3. Matriz de policies por tabela

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `users` | própria linha (`id = auth.uid()`) OU `is_admin()` | — | — | — |
| `inspections` | `is_admin()` OU `tecnico_id = auth.uid()` | `is_admin()` OU `tecnico_id = auth.uid()` (técnico só cria com o próprio id) | técnico: `USING owns_editable_inspection(id)`, `WITH CHECK tecnico_id = auth.uid()`. admin: `is_admin()` (USING e WITH CHECK) | — |
| `vehicle_data`, `client_data` | `is_admin()` OU `owns_inspection(inspection_id)` | `is_admin()` OU `owns_editable_inspection(inspection_id)` | igual ao INSERT | — |
| `checklist_item_responses` | `is_admin()` OU `owns_inspection(inspection_id)` | `is_admin()` OU `owns_editable_inspection(inspection_id)` | igual ao INSERT | — |
| `paint_measurements` | join a `checklist_item_responses.inspection_id`, mesmo predicado (`is_admin()` OU `owns_inspection(...)`) | mesmo join com `owns_editable_inspection(...)` | igual ao INSERT | — |
| `photos` | `is_admin()` OU `owns_inspection(inspection_id)` | técnico: `owns_editable_inspection(inspection_id) AND contexto = 'item'` (fotos de capa são admin-only — "Adicionar fotos de capa do relatório ❌ Técnico, ✅ Admin"). admin: `is_admin()` | admin only (`is_admin()`) — técnico nunca edita foto já enviada, só adiciona novas | — |
| `checklist_group_templates`, `checklist_item_templates` | qualquer autenticado (`true`) | — | — | — |
| `review_events` | `is_admin()` OU `owns_inspection(inspection_id)` (técnico lê o motivo de uma devolução) | admin only, `WITH CHECK autor_id = auth.uid() AND is_admin()` | — | — |
| `audit_log_entries` | admin only | admin only, `WITH CHECK admin_id = auth.uid() AND is_admin()` | — (já revogado a nível de GRANT em 00004, RNF-11) | — (idem) |
| `client_access_logs` | — | — | — | — |

Célula vazia = nenhuma policy para aquela operação = RLS nega por padrão para `anon`/`authenticated`. Nenhum `REVOKE` adicional é necessário além do que já existe em 00004 para `audit_log_entries`.

## 4. Casos especiais

- **`inspections_with_flags`** (view `security_invoker=true`, corrigida na Task 7): não recebe policy própria. Por ser `security_invoker`, herda automaticamente o RLS de `inspections` assim que ele é ativado — é exatamente por isso que o Task 7 corrigiu esse bypass antes deste trabalho.
- **INSERT em `inspections` por admin**: admin pode criar uma inspeção atribuída a qualquer `tecnico_id` (fluxo de atribuição); técnico só pode criar com `tecnico_id = auth.uid()`.
- **`paint_measurements`** não tem `inspection_id` direto (PK é `item_response_id`, FK para `checklist_item_responses`) — a policy precisa de um join extra até `checklist_item_responses.inspection_id` antes de aplicar `owns_inspection`/`owns_editable_inspection`.
- **`checklist_group_templates`/`checklist_item_templates`** são dados de seed fixos no código (RNF-18/19) — SELECT liberado para qualquer autenticado (técnico e admin precisam renderizar a checklist), sem policy de escrita nenhuma: alterações acontecem via migration/service_role, nunca pela app.
- **Limite conhecido do RLS em `inspections`:** a policy de UPDATE do técnico (`WITH CHECK tecnico_id = auth.uid()`) garante posse, mas não valida a máquina de estados — nada nela impede um UPDATE que pule direto para `status = 'aprovada'` ou `'cancelada'`, que deveriam ser transições exclusivas do admin. Validar *quais* transições de status são permitidas é responsabilidade de constraint/trigger, não de RLS, e fica fora deste documento — ceiling explícito, não lacuna silenciosa. Entra como item futuro se/quando um técnico mal-intencionado for um risco real (hoje são 1-2 técnicos de confiança direta, PRD §3).

## 5. Estratégia de migration e teste

Segue o mesmo padrão das Tasks 1–7: uma migration por domínio de tabelas (não um arquivo único), cada uma com write → `supabase db push` → teste → commit, na mesma ordem sequencial já usada (00001 núcleo, 00002 templates, 00003 respostas/mídia, 00004 workflow/auditoria, 00005 acesso do cliente). RLS entra como três novas migrations, com o mesmo agrupamento:

- `00008_rls_helpers_and_core.sql` — as 3 helper functions + RLS em `users`, `inspections`, `vehicle_data`, `client_data`.
- `00009_rls_checklist_media.sql` — RLS em `checklist_group_templates`, `checklist_item_templates`, `checklist_item_responses`, `paint_measurements`, `photos`.
- `00010_rls_workflow_audit.sql` — RLS em `review_events`, `audit_log_entries`, `client_access_logs`.

Cada migration é atômica dentro do seu grupo (nenhuma tabela fica "meio protegida"); o conjunto das três é o que fecha o Mapa de Permissões por completo. Cada uma ganha um teste SQL próprio em `supabase/tests/*.test.sql` (mesmo estilo `do $$ ... raise exception ...$$` usado nos testes existentes, não pgTAP formal), usando `set local role authenticated` + `set local request.jwt.claims` para simular técnico/admin e verificar: técnico vê só a própria inspeção, técnico não edita fora de rascunho/devolvida, admin vê/edita tudo, `audit_log_entries` continua insert-only mesmo para admin.

## 6. Fora do escopo (confirmado)

- Policies de leitura pública/anon para o relatório do Cliente — pertence a uma function/service-role futura, não a RLS de tabela.
- Qualquer policy de DELETE.
- Papéis extras além de `tecnico`/`admin`, ou preparo de schema/policy para hierarquia futura de admins (PRD §5, RNF-20/21 já cortados).
