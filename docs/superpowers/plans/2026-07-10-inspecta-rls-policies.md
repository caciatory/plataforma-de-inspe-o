# Inspecta RLS Policies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Row Level Security across all 12 tables in the Inspecta schema so técnico only sees/edits their own inspections and admin sees/edits everything, per `docs/especificacao-tecnica-v1.md` §3 (Mapa de Permissões) and `docs/superpowers/specs/2026-07-10-inspecta-rls-policies-design.md`.

**Architecture:** Three helper functions (`is_admin()`, `owns_inspection(uuid)`, `owns_editable_inspection(uuid)`) reused across every table's policies instead of repeating the ownership subquery. Three migrations, one per table-domain (same grouping as the existing schema migrations 00001-00005), each written → applied → tested → committed independently, mirroring Tasks 1-7 from `docs/superpowers/plans/2026-07-09-inspecta-database-schema.md`.

**Tech Stack:** PostgreSQL (Supabase), plain SQL migrations via `supabase db push`, hand-rolled `do $$ ... raise exception ... $$` SQL tests (same style as `supabase/tests/00001-00007`, not a pgTAP extension) run via `psql "$DATABASE_URL"`.

## Global Constraints

- Only two roles exist: `tecnico` and `admin` (`public.users.role`). No new roles, no schema/policy scaffolding for a future admin hierarchy — PRD §5, RNF-20/21 already cut.
- No DELETE policy on any table — cancellation is a status UPDATE (`status = 'cancelada'`), already covered by admin UPDATE policies. RLS default-denies DELETE everywhere.
- No anon/public policies for the Cliente/Público report flow (RF-55/56) — out of scope, resolved later by a service-role backend that bypasses RLS entirely. Affected tables get `ENABLE ROW LEVEL SECURITY` with zero policies (default-deny), never an explicit anon-read policy.
- `audit_log_entries` stays insert-only for every role, including admin (RNF-11) — UPDATE/DELETE are already revoked at the GRANT level in `supabase/migrations/00004_workflow_audit.sql`; RLS SELECT/INSERT policies here are additive, not a replacement for that revoke.
- Helper functions: `language sql stable security invoker set search_path = ''`, fully-qualified table names (`public.users`, not `users`) — no `security definer`, since every check only confirms something the calling user could already read via that table's own RLS.
- Use `(select auth.uid())` (not bare `auth.uid()`) inside every policy/function — Postgres can cache it as an initplan instead of re-evaluating per row.
- Every migration is plain SQL applied via `supabase db push` — no ORM, no separate migration framework.

---

## File Structure

```
supabase/
  migrations/
    00008_rls_helpers_and_core.sql     -- is_admin(), owns_inspection(), owns_editable_inspection(); RLS on users, inspections, vehicle_data, client_data
    00009_rls_checklist_media.sql      -- RLS on checklist_group_templates, checklist_item_templates, checklist_item_responses, paint_measurements, photos
    00010_rls_workflow_audit.sql       -- RLS on review_events, audit_log_entries, client_access_logs
  tests/
    00008_rls_helpers_and_core.test.sql
    00009_rls_checklist_media.test.sql
    00010_rls_workflow_audit.test.sql
```

**Prerequisite (once, not a task):** confirm `DATABASE_URL` is set in the shell environment and points at the linked Supabase project (same one Tasks 1-7 applied to) — `echo "$DATABASE_URL"` should print a `postgres://...` connection string. If unset, get it from `supabase status` (local) or the project's connection string (hosted) before starting Task 1.

---

### Task 1: Helper functions + core entities (users, inspections, vehicle_data, client_data)

**Files:**
- Create: `supabase/migrations/00008_rls_helpers_and_core.sql`
- Test: `supabase/tests/00008_rls_helpers_and_core.test.sql`

**Interfaces:**
- Produces: `public.is_admin() returns boolean`, `public.owns_inspection(insp_id uuid) returns boolean`, `public.owns_editable_inspection(insp_id uuid) returns boolean`. Tasks 2 and 3 call all three by these exact names/signatures.
- Consumes: `public.users(id, role)`, `public.inspections(id, tecnico_id, status)` (Task 1 of the schema plan).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00008_rls_helpers_and_core.sql
-- RLS policies — Inspecta v1.0. Mapa de Permissões: docs/especificacao-tecnica-v1.md §3.
-- Design: docs/superpowers/specs/2026-07-10-inspecta-rls-policies-design.md

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

alter table public.users enable row level security;

create policy users_select on public.users
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

alter table public.inspections enable row level security;

create policy inspections_select on public.inspections
  for select to authenticated
  using (public.is_admin() or tecnico_id = (select auth.uid()));

create policy inspections_insert on public.inspections
  for insert to authenticated
  with check (public.is_admin() or tecnico_id = (select auth.uid()));

create policy inspections_update on public.inspections
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(id))
  with check (public.is_admin() or tecnico_id = (select auth.uid()));

alter table public.vehicle_data enable row level security;

create policy vehicle_data_select on public.vehicle_data
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy vehicle_data_insert on public.vehicle_data
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

create policy vehicle_data_update on public.vehicle_data
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id))
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

alter table public.client_data enable row level security;

create policy client_data_select on public.client_data
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy client_data_insert on public.client_data
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

create policy client_data_update on public.client_data
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id))
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors (creates 3 functions, enables RLS + 10 policies across 4 tables).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00008_rls_helpers_and_core.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000002', 'tecnico2@test.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin1@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000002', 'Tecnico Dois', 'tecnico2@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000003', 'Admin Um', 'admin1@test.com', 'admin');

insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'aguardando_aprovacao', 'particular', 'compra');

insert into public.vehicle_data (inspection_id, matricula) values
  ('00000000-0000-0000-0000-000000000010', 'AA-00-BB');

insert into public.client_data (inspection_id, nome_solicitante, tipo) values
  ('00000000-0000-0000-0000-000000000010', 'Cliente Teste', 'particular');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.inspections;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ver so a propria inspecao (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve apenas a propria inspecao';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.users;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ver so a propria linha em users (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve apenas a propria linha em users';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.vehicle_data;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ver vehicle_data da propria inspecao (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve vehicle_data da propria inspecao via owns_inspection';
end $$;

do $$
begin
  update public.inspections set nota_geral = 8.5
    where id = '00000000-0000-0000-0000-000000000010';
  if not found then
    raise exception 'FALHOU: tecnico deveria poder editar inspecao propria em rascunho';
  end if;
  raise notice 'OK: tecnico edita inspecao propria em rascunho';
end $$;

do $$
declare v_rows int;
begin
  update public.inspections set nota_geral = 8.5
    where id = '00000000-0000-0000-0000-000000000011';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria enxergar/editar inspecao de outro tecnico';
  end if;
  raise notice 'OK: update em inspecao de outro tecnico afeta 0 linhas';
end $$;

do $$
begin
  begin
    insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
      values ('00000000-0000-0000-0000-000000000002', 'particular', 'compra');
    raise exception 'FALHOU: tecnico nao deveria inserir inspecao com tecnico_id de outro tecnico';
  exception when insufficient_privilege then
    raise notice 'OK: insert com tecnico_id de outro tecnico bloqueado pela RLS';
  end;
end $$;

-- simulate tecnico 2 (owns the non-editable inspection)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

do $$
declare v_rows int;
begin
  update public.inspections set nota_geral = 5
    where id = '00000000-0000-0000-0000-000000000011';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico2 nao deveria editar a propria inspecao fora de rascunho/devolvida';
  end if;
  raise notice 'OK: tecnico nao edita a propria inspecao em aguardando_aprovacao';
end $$;

-- simulate admin
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.inspections;
  if v_count <> 2 then
    raise exception 'FALHOU: admin deveria ver todas as inspecoes (viu %)', v_count;
  end if;
  raise notice 'OK: admin ve todas as inspecoes';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.users;
  if v_count <> 3 then
    raise exception 'FALHOU: admin deveria ver todas as linhas de users (viu %)', v_count;
  end if;
  raise notice 'OK: admin ve todas as linhas de users';
end $$;

do $$
begin
  update public.inspections set nota_geral = 9
    where id = '00000000-0000-0000-0000-000000000011';
  if not found then
    raise exception 'FALHOU: admin deveria poder editar qualquer inspecao';
  end if;
  raise notice 'OK: admin edita inspecao em qualquer status';
end $$;

reset role;
rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00008_rls_helpers_and_core.test.sql`
Expected: ten `NOTICE: OK: ...` lines (in order: técnico vê inspeção própria, técnico vê própria linha em users, técnico vê vehicle_data, técnico edita rascunho, update de outro técnico afeta 0 linhas, insert bloqueado, técnico2 não edita fora de status, admin vê todas inspeções, admin vê todos users, admin edita qualquer status), no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00008_rls_helpers_and_core.sql supabase/tests/00008_rls_helpers_and_core.test.sql
git commit -m "feat: RLS helper functions + policies on users/inspections/vehicle_data/client_data

is_admin(), owns_inspection(), owns_editable_inspection() reused by
every later RLS migration. Técnico sees/edits only own inspections
(and only while rascunho/devolvida); admin unrestricted. Mapa de
Permissões: docs/especificacao-tecnica-v1.md §3."
```

---

### Task 2: Checklist templates, responses, and media (checklist_group_templates, checklist_item_templates, checklist_item_responses, paint_measurements, photos)

**Files:**
- Create: `supabase/migrations/00009_rls_checklist_media.sql`
- Test: `supabase/tests/00009_rls_checklist_media.test.sql`

**Interfaces:**
- Consumes: `public.is_admin()`, `public.owns_inspection(uuid)`, `public.owns_editable_inspection(uuid)` (Task 1).
- Consumes: `public.checklist_item_responses(id, inspection_id, item_template_id, classificacao)`, `public.paint_measurements(item_response_id, valores_um, resultado_calculado)`, `public.photos(id, inspection_id, item_response_id, contexto, url, ordem)` (Task 3 of the schema plan).
- No new functions produced — Task 3 does not depend on this task.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00009_rls_checklist_media.sql
alter table public.checklist_group_templates enable row level security;

create policy checklist_group_templates_select on public.checklist_group_templates
  for select to authenticated
  using (true);

alter table public.checklist_item_templates enable row level security;

create policy checklist_item_templates_select on public.checklist_item_templates
  for select to authenticated
  using (true);

alter table public.checklist_item_responses enable row level security;

create policy checklist_item_responses_select on public.checklist_item_responses
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy checklist_item_responses_insert on public.checklist_item_responses
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

create policy checklist_item_responses_update on public.checklist_item_responses
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id))
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

alter table public.paint_measurements enable row level security;

create policy paint_measurements_select on public.paint_measurements
  for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.checklist_item_responses cir
      where cir.id = paint_measurements.item_response_id
        and public.owns_inspection(cir.inspection_id)
    )
  );

create policy paint_measurements_insert on public.paint_measurements
  for insert to authenticated
  with check (
    public.is_admin() or exists (
      select 1 from public.checklist_item_responses cir
      where cir.id = paint_measurements.item_response_id
        and public.owns_editable_inspection(cir.inspection_id)
    )
  );

create policy paint_measurements_update on public.paint_measurements
  for update to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.checklist_item_responses cir
      where cir.id = paint_measurements.item_response_id
        and public.owns_editable_inspection(cir.inspection_id)
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.checklist_item_responses cir
      where cir.id = paint_measurements.item_response_id
        and public.owns_editable_inspection(cir.inspection_id)
    )
  );

alter table public.photos enable row level security;

create policy photos_select on public.photos
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy photos_insert on public.photos
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.owns_editable_inspection(inspection_id) and contexto = 'item')
  );

create policy photos_update on public.photos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors (enables RLS + 11 policies across 5 tables).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00009_rls_checklist_media.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000002', 'tecnico2@test.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin1@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000002', 'Tecnico Dois', 'tecnico2@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000003', 'Admin Um', 'admin1@test.com', 'admin');

insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'aguardando_aprovacao', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Grupo Teste');

insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item Um', 'padrao'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item Dois', 'padrao');

-- unico response pre-existente: preso a inspecao 012 (T1, aguardando_aprovacao,
-- NAO editavel) — usado para testar UPDATE bloqueado e o bypass do admin.
-- O response da inspecao editavel (010) e criado pelo proprio tecnico no teste,
-- para exercitar checklist_item_responses_insert de verdade (nao so o UPDATE).
insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000021');

insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado) values
  ('00000000-0000-0000-0000-000000000032', array[100.0, 105.0]::numeric(6,2)[], 'OK');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ler templates de grupo (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico le checklist_group_templates';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates;
  if v_count <> 2 then
    raise exception 'FALHOU: tecnico deveria ler templates de item (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico le checklist_item_templates';
end $$;

do $$
begin
  begin
    insert into public.checklist_group_templates (ordem, nome) values (2, 'Outro Grupo');
    raise exception 'FALHOU: tecnico nao deveria inserir template de grupo';
  exception when insufficient_privilege then
    raise notice 'OK: insert em checklist_group_templates bloqueado para tecnico';
  end;
end $$;

do $$
begin
  insert into public.checklist_item_responses (id, inspection_id, item_template_id)
    values ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022');
  raise notice 'OK: tecnico insere checklist_item_responses na propria inspecao editavel';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_responses;
  if v_count <> 2 then
    raise exception 'FALHOU: tecnico deveria ver so as respostas das proprias inspecoes (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve apenas checklist_item_responses das proprias inspecoes';
end $$;

do $$
begin
  update public.checklist_item_responses set classificacao = 'otimo'
    where id = '00000000-0000-0000-0000-000000000030';
  if not found then
    raise exception 'FALHOU: tecnico deveria editar resposta da propria inspecao em rascunho';
  end if;
  raise notice 'OK: tecnico edita checklist_item_responses em inspecao editavel';
end $$;

do $$
declare v_rows int;
begin
  update public.checklist_item_responses set classificacao = 'otimo'
    where id = '00000000-0000-0000-0000-000000000032';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria editar resposta de inspecao fora de rascunho/devolvida';
  end if;
  raise notice 'OK: update bloqueado em checklist_item_responses fora de status editavel';
end $$;

do $$
begin
  insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado)
    values ('00000000-0000-0000-0000-000000000030', array[110.0, 112.0]::numeric(6,2)[], 'OK');
  raise notice 'OK: tecnico insere paint_measurements para resposta propria editavel';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.paint_measurements;
  if v_count <> 2 then
    raise exception 'FALHOU: tecnico deveria ver as paint_measurements das proprias inspecoes (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve paint_measurements via join ate as proprias inspecoes';
end $$;

do $$
declare v_rows int;
begin
  update public.paint_measurements set resultado_calculado = 'anomalia'
    where item_response_id = '00000000-0000-0000-0000-000000000032';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria editar paint_measurements de inspecao fora de rascunho/devolvida';
  end if;
  raise notice 'OK: update bloqueado em paint_measurements fora de status editavel';
end $$;

do $$
begin
  insert into public.photos (inspection_id, item_response_id, contexto, url)
    values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000030', 'item', 'https://example.com/foto1.jpg');
  raise notice 'OK: tecnico insere foto de item na propria inspecao editavel';
end $$;

do $$
begin
  begin
    insert into public.photos (inspection_id, item_response_id, contexto, url)
      values ('00000000-0000-0000-0000-000000000010', null, 'capa', 'https://example.com/capa.jpg');
    raise exception 'FALHOU: tecnico nao deveria inserir foto de capa';
  exception when insufficient_privilege then
    raise notice 'OK: insert de foto de capa bloqueado para tecnico';
  end;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.photos;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ver a foto da propria inspecao (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve photos da propria inspecao';
end $$;

do $$
declare v_rows int;
begin
  update public.photos set ordem = 1
    where inspection_id = '00000000-0000-0000-0000-000000000010' and contexto = 'item';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria conseguir editar foto (photos_update e admin-only)';
  end if;
  raise notice 'OK: update em photos bloqueado para tecnico mesmo na propria inspecao';
end $$;

-- simulate tecnico 2 (isolation check)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.paint_measurements;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico2 nao deveria ver paint_measurements de outro tecnico (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico2 nao enxerga paint_measurements de outro tecnico';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.photos;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico2 nao deveria ver photos de outro tecnico (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico2 nao enxerga photos de outro tecnico';
end $$;

-- simulate admin
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_responses;
  if v_count <> 2 then
    raise exception 'FALHOU: admin deveria ver todas as respostas (viu %)', v_count;
  end if;
  raise notice 'OK: admin ve todas as checklist_item_responses';
end $$;

do $$
begin
  update public.paint_measurements set resultado_calculado = 'anomalia'
    where item_response_id = '00000000-0000-0000-0000-000000000032';
  if not found then
    raise exception 'FALHOU: admin deveria poder editar paint_measurements de qualquer inspecao';
  end if;
  raise notice 'OK: admin edita paint_measurements mesmo fora de rascunho/devolvida';
end $$;

do $$
begin
  insert into public.photos (inspection_id, item_response_id, contexto, ordem, url)
    values ('00000000-0000-0000-0000-000000000010', null, 'capa', 1, 'https://example.com/capa-admin.jpg');
  raise notice 'OK: admin insere foto de capa';
end $$;

do $$
begin
  update public.photos set ordem = 2
    where inspection_id = '00000000-0000-0000-0000-000000000010' and contexto = 'item';
  if not found then
    raise exception 'FALHOU: admin deveria poder editar qualquer foto';
  end if;
  raise notice 'OK: admin edita photos';
end $$;

reset role;
rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00009_rls_checklist_media.test.sql`
Expected: twenty `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00009_rls_checklist_media.sql supabase/tests/00009_rls_checklist_media.test.sql
git commit -m "feat: RLS policies on checklist templates, responses, and media

Templates are read-only for any authenticated user (fixed in code,
RNF-18/19). checklist_item_responses/paint_measurements/photos inherit
ownership from the parent inspection via owns_inspection/
owns_editable_inspection. Cover photos (contexto=capa) are admin-only
per the Mapa de Permissões — técnico can only insert item photos."
```

---

### Task 3: Workflow, audit, and client access log (review_events, audit_log_entries, client_access_logs)

**Files:**
- Create: `supabase/migrations/00010_rls_workflow_audit.sql`
- Test: `supabase/tests/00010_rls_workflow_audit.test.sql`

**Interfaces:**
- Consumes: `public.is_admin()`, `public.owns_inspection(uuid)` (Task 1).
- Consumes: `public.review_events(inspection_id, tipo, autor_id, motivo)`, `public.audit_log_entries(inspection_id, admin_id, descricao)` (Task 4 of the schema plan), `public.client_access_logs(inspection_id, email, origem)` (Task 5 of the schema plan).
- This is the last RLS task — no downstream consumers.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00010_rls_workflow_audit.sql
alter table public.review_events enable row level security;

create policy review_events_select on public.review_events
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy review_events_insert on public.review_events
  for insert to authenticated
  with check (public.is_admin() and autor_id = (select auth.uid()));

alter table public.audit_log_entries enable row level security;

create policy audit_log_entries_select on public.audit_log_entries
  for select to authenticated
  using (public.is_admin());

create policy audit_log_entries_insert on public.audit_log_entries
  for insert to authenticated
  with check (public.is_admin() and admin_id = (select auth.uid()));

-- UPDATE/DELETE need no policy: already REVOKEd from authenticated/anon in
-- 00004_workflow_audit.sql (RNF-11) — RLS SELECT/INSERT here are additive,
-- not a replacement for that revoke.

alter table public.client_access_logs enable row level security;
-- Sem policies: acesso de Cliente/Publico (RF-55/56) e resolvido por uma
-- function/service-role futura, fora do escopo deste RLS. Default-deny
-- total para anon/authenticated, inclusive admin, ate essa peca existir.
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors (enables RLS + 4 policies across 3 tables; `client_access_logs` gets zero policies).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00010_rls_workflow_audit.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin1@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000003', 'Admin Um', 'admin1@test.com', 'admin');

insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'devolvida', 'particular', 'compra');

insert into public.review_events (inspection_id, tipo, autor_id, motivo) values
  ('00000000-0000-0000-0000-000000000010', 'devolucao', '00000000-0000-0000-0000-000000000003', 'Faltou foto do para-choque');

insert into public.audit_log_entries (inspection_id, admin_id, descricao) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', 'Admin corrigiu classificacao do item X');

insert into public.client_access_logs (inspection_id, email, origem) values
  ('00000000-0000-0000-0000-000000000010', 'cliente@example.com', 'site');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.review_events;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ler o motivo da devolucao da propria inspecao (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico le review_events da propria inspecao';
end $$;

do $$
begin
  begin
    insert into public.review_events (inspection_id, tipo, autor_id)
      values ('00000000-0000-0000-0000-000000000010', 'aprovacao', '00000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU: tecnico nao deveria inserir review_events';
  exception when insufficient_privilege then
    raise notice 'OK: insert em review_events bloqueado para tecnico';
  end;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.audit_log_entries;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico nao deveria ver nenhuma linha de audit_log_entries (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico nao enxerga audit_log_entries';
end $$;

do $$
begin
  begin
    insert into public.audit_log_entries (inspection_id, admin_id, descricao)
      values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Tentativa de tecnico');
    raise exception 'FALHOU: tecnico nao deveria inserir em audit_log_entries';
  exception when insufficient_privilege then
    raise notice 'OK: insert em audit_log_entries bloqueado para tecnico';
  end;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.client_access_logs;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico nao deveria ver client_access_logs (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico nao enxerga client_access_logs (fora de escopo, default-deny)';
end $$;

-- simulate admin
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
begin
  insert into public.review_events (inspection_id, tipo, autor_id, motivo)
    values ('00000000-0000-0000-0000-000000000010', 'aprovacao', '00000000-0000-0000-0000-000000000003', null);
  raise notice 'OK: admin insere em review_events';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.audit_log_entries;
  if v_count <> 1 then
    raise exception 'FALHOU: admin deveria ver o log de auditoria (viu %)', v_count;
  end if;
  raise notice 'OK: admin le audit_log_entries';
end $$;

do $$
begin
  insert into public.audit_log_entries (inspection_id, admin_id, descricao)
    values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', 'Segunda edicao');
  raise notice 'OK: admin insere em audit_log_entries';
end $$;

do $$
begin
  begin
    update public.audit_log_entries set descricao = 'alterado'
      where inspection_id = '00000000-0000-0000-0000-000000000010';
    raise exception 'FALHOU: audit_log_entries nao deveria aceitar UPDATE nem de admin (RNF-11)';
  exception when insufficient_privilege then
    raise notice 'OK: UPDATE em audit_log_entries bloqueado mesmo para admin (RNF-11, revogado em 00004)';
  end;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.client_access_logs;
  if v_count <> 0 then
    raise exception 'FALHOU: admin tambem nao deveria ver client_access_logs (fora de escopo) (viu %)', v_count;
  end if;
  raise notice 'OK: admin tambem nao enxerga client_access_logs (mecanismo futuro, fora de escopo)';
end $$;

reset role;
rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00010_rls_workflow_audit.test.sql`
Expected: ten `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00010_rls_workflow_audit.sql supabase/tests/00010_rls_workflow_audit.test.sql
git commit -m "feat: RLS policies on review_events, audit_log_entries, client_access_logs

Técnico reads own inspection's review events (e.g. devolução motivo)
but never writes them — only admin approves/returns/cancels.
audit_log_entries stays admin-only and insert-only (RNF-11, UPDATE/
DELETE already revoked at grant level in 00004). client_access_logs
gets RLS enabled with zero policies — default-deny for everyone,
including admin, until the Cliente/Público access mechanism
(RF-55/56) is built as a separate service-role flow."
```

---

## Explicitly out of scope (not tasks in this plan)

- **Anon/public policies for the Cliente/Público report flow** (RF-55/56) — belongs to a future service-role backend/edge function that verifies email+origem, not to table-level RLS.
- **Status-transition validation** (e.g. blocking a técnico UPDATE from jumping straight to `status = 'aprovada'`) — RLS confirms ownership, not state-machine legality. Needs a constraint/trigger if it ever becomes a real risk; not built here (documented as a known limit in the design spec §4).
- **DELETE policies** on any table — no legitimate DELETE flow identified; cancellation is a status UPDATE.
- **Multiple admins / admin hierarchy** — PRD §5 and RNF-20/21 already cut this; nothing here should be read as scaffolding for it.

## Self-Review

**Spec coverage:** every row of the design spec's §3 matrix (`docs/superpowers/specs/2026-07-10-inspecta-rls-policies-design.md`) has a policy in one of the three tasks — `users` (Task 1), `inspections`/`vehicle_data`/`client_data` (Task 1), `checklist_group_templates`/`checklist_item_templates`/`checklist_item_responses`/`paint_measurements`/`photos` (Task 2), `review_events`/`audit_log_entries`/`client_access_logs` (Task 3). The helper-function design (§2) is Task 1's first step. The "casos especiais" (§4) — `inspections_with_flags` inheriting RLS automatically, the `paint_measurements` join, the photos `contexto` split, the status-transition limit — are all reflected in the matching task or the out-of-scope section.

**Placeholder scan:** none — every step has complete, runnable SQL and exact `psql`/`supabase` commands with expected output.

**Type consistency:** `insp_id uuid` / `inspection_id uuid` / `item_response_id uuid` used consistently across all three migrations; `is_admin()`, `owns_inspection(uuid)`, `owns_editable_inspection(uuid)` called with identical names and signatures in Tasks 2 and 3 as produced in Task 1.
