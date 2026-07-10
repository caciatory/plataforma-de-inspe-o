# Inspecta Database Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Postgres schema (via Supabase migrations) for Inspecta v1.0, matching the data model in `docs/especificacao-tecnica-v1.md` §4 and the scope in `docs/superpowers/specs/2026-07-09-inspecta-prd-design.md`.

**Architecture:** One Supabase (Postgres) project. `public.users` is a 1:1 extension of Supabase's built-in `auth.users` (no hand-rolled auth). Photos live in Supabase Storage; the `photos` table stores paths, not binaries. Six migrations, applied in order, each with a paired SQL test run in a rolled-back transaction.

**Tech Stack:** PostgreSQL 15 (Supabase), `pgcrypto` for UUIDs, `pg_trgm` for free-text search — no ORM, no migration framework beyond the Supabase CLI.

## Global Constraints

- DB engine: PostgreSQL via Supabase (decided 2026-07-09, supersedes the "stack técnica ainda não definida" open item in the technical spec).
- No offline-first, no config UI, no multi-admin design, no PDF pipeline — per PRD §3/§4. Schema must not grow columns/tables for any of these.
- Every migration file is plain SQL, applied via `supabase migration up` — no Prisma/Knex/Sequelize.
- Money/scores use `numeric`, not `float`.
- Timestamps are `timestamptz`, never naive.

---

## Ponytail cut found while modeling (not in the earlier audit)

`CHECKLIST_ITEM_RESPONSE` in the technical spec has both `classificacao` (otimo/medio/ruim/NF) and `status` (pendente/respondido/NF) — `status` is fully derivable from `classificacao` (NULL → pendente, NF → NF, anything else → respondido) and storing both risks the two drifting out of sync. Fixed here as a Postgres **generated column**, not two independently-writable fields. Same information, zero drift risk, native feature (no app-side sync code).

---

## File Structure

```
supabase/
  migrations/
    00001_core_entities.sql       -- extensions, enums, users, inspections, vehicle_data, client_data
    00002_checklist_templates.sql -- checklist_group_templates, checklist_item_templates
    00003_checklist_responses_media.sql -- checklist_item_responses, paint_measurements, photos
    00004_workflow_audit.sql      -- review_events, audit_log_entries
    00005_client_access_log.sql   -- client_access_logs
    00006_admin_list_indexes.sql  -- search/filter/sort indexes for RF-58/59
    00007_security_invoker_fix.sql -- inspections_with_flags security_invoker + drop redundant index
  tests/
    00001_core_entities.test.sql
    00002_checklist_templates.test.sql
    00003_checklist_responses_media.test.sql
    00004_workflow_audit.test.sql
    00005_client_access_log.test.sql
    00007_security_invoker_fix.test.sql
```

**Prerequisite (once, not a task):** `supabase init` in the project root if `supabase/` doesn't exist yet, then `supabase start` for a local dev instance (gives you `auth.users` and a local Postgres to run these migrations and tests against).

---

### Task 1: Core entities — users, inspections, vehicle_data, client_data

**Files:**
- Create: `supabase/migrations/00001_core_entities.sql`
- Test: `supabase/tests/00001_core_entities.test.sql`

**Interfaces:**
- Produces: `public.users(id, nome, email, role, credencial_interna)`, `public.inspections(id, tecnico_id, status, tipo_cliente, objetivo, data_abertura, data_finalizacao, nota_geral, classificacao_final, codigo_certificado, certificado_emitido_em)`, `public.vehicle_data(inspection_id, ...)`, `public.client_data(inspection_id, ...)`, view `public.inspections_with_flags` (adds computed `atrasada`).
- Every later task's `inspection_id uuid references public.inspections(id)` depends on this table existing first.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00001_core_entities.sql
create extension if not exists pgcrypto;

create type user_role as enum ('tecnico', 'admin');
create type inspection_status as enum ('rascunho', 'aguardando_aprovacao', 'devolvida', 'aprovada', 'cancelada');
create type tipo_cliente as enum ('particular', 'stand');
create type objetivo_inspecao as enum ('compra', 'venda');
create type classificacao_final as enum ('A', 'B', 'C');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  role user_role not null default 'tecnico',
  credencial_interna text,
  created_at timestamptz not null default now()
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.users(id),
  status inspection_status not null default 'rascunho',
  tipo_cliente tipo_cliente not null,
  objetivo objetivo_inspecao not null,
  data_abertura date not null default current_date,
  data_finalizacao timestamptz,
  nota_geral numeric(4,2),
  classificacao_final classificacao_final,
  codigo_certificado text unique,
  certificado_emitido_em timestamptz,
  created_at timestamptz not null default now(),
  constraint objetivo_stand_fixo check (
    tipo_cliente <> 'stand' or objetivo = 'venda'
  )
);

create table public.vehicle_data (
  inspection_id uuid primary key references public.inspections(id) on delete cascade,
  matricula text not null,
  marca text not null,
  modelo text not null,
  versao_trim text,
  ano_fabrico int,
  ano_modelo int,
  cor text,
  codigo_cor text,
  vin text,
  numero_motor text,
  numero_portas int,
  combustivel text,
  caixa_velocidades text,
  tracao text,
  potencia_cv int,
  torque_nm numeric(6,2)
);

create table public.client_data (
  inspection_id uuid primary key references public.inspections(id) on delete cascade,
  nome_solicitante text not null,
  tipo tipo_cliente not null,
  contacto text,
  email text,
  responsavel_presente text
);

-- RF-62 "atrasada" é derivado, calculado em tempo de leitura — não persistido.
create view public.inspections_with_flags as
select i.*,
  (i.status not in ('aprovada', 'cancelada') and i.data_abertura < current_date) as atrasada
from public.inspections i;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up`
Expected: `Applying migration 00001_core_entities.sql...` with no errors.

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00001_core_entities.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Técnico Teste', 'tecnico@test.com', 'tecnico');

-- caminho feliz: particular pode comprar
insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
  values ('00000000-0000-0000-0000-000000000001', 'particular', 'compra');

-- stand só pode ter objetivo = venda (RF-03)
do $$
begin
  begin
    insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
      values ('00000000-0000-0000-0000-000000000001', 'stand', 'compra');
    raise exception 'FALHOU: deveria ter bloqueado stand com objetivo=compra';
  exception when check_violation then
    raise notice 'OK: objetivo_stand_fixo bloqueou stand+compra';
  end;
end $$;

-- atrasada: inspeção aberta ontem, ainda em rascunho, deve aparecer atrasada
insert into public.inspections (tecnico_id, tipo_cliente, objetivo, data_abertura)
  values ('00000000-0000-0000-0000-000000000001', 'particular', 'compra', current_date - 1);
do $$
declare v_atrasada boolean;
begin
  select atrasada into v_atrasada from public.inspections_with_flags
    where data_abertura = current_date - 1 limit 1;
  if not v_atrasada then
    raise exception 'FALHOU: inspecao de ontem deveria estar atrasada';
  end if;
  raise notice 'OK: inspections_with_flags marca atrasada corretamente';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00001_core_entities.test.sql`
Expected: two `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00001_core_entities.sql supabase/tests/00001_core_entities.test.sql
git commit -m "db: core entities (users, inspections, vehicle_data, client_data)"
```

---

### Task 2: Checklist templates

**Files:**
- Create: `supabase/migrations/00002_checklist_templates.sql`
- Test: `supabase/tests/00002_checklist_templates.test.sql`

**Interfaces:**
- Consumes: nothing from Task 1 directly (templates are inspection-independent).
- Produces: `public.checklist_group_templates(id, ordem, nome)`, `public.checklist_item_templates(id, group_id, subcategoria, nome, tipo, qtd_pontos_medicao, aplica_stand)`. Task 3's `checklist_item_responses.item_template_id` references this table's `id`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00002_checklist_templates.sql
create type item_template_tipo as enum ('padrao', 'medicao');

create table public.checklist_group_templates (
  id uuid primary key default gen_random_uuid(),
  ordem int not null unique,
  nome text not null
);

create table public.checklist_item_templates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.checklist_group_templates(id) on delete cascade,
  subcategoria text,
  nome text not null,
  tipo item_template_tipo not null default 'padrao',
  qtd_pontos_medicao int,
  aplica_stand boolean not null default false,
  constraint qtd_pontos_medicao_valido check (
    tipo <> 'medicao' or (qtd_pontos_medicao is not null and qtd_pontos_medicao between 3 and 5)
  )
);

create index on public.checklist_item_templates (group_id);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up`
Expected: applies with no errors.

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00002_checklist_templates.test.sql
begin;

insert into public.checklist_group_templates (ordem, nome)
  values (1, 'Exterior');

-- aplica_stand default false: item padrão sem passar o campo fica de fora do plano Stand por padrão
insert into public.checklist_item_templates (group_id, nome, tipo)
  select id, 'Para-choque dianteiro', 'padrao' from public.checklist_group_templates where ordem = 1;
do $$
declare v_aplica_stand boolean;
begin
  select aplica_stand into v_aplica_stand from public.checklist_item_templates where nome = 'Para-choque dianteiro';
  if v_aplica_stand is not false then raise exception 'FALHOU: esperava aplica_stand=false por padrão, veio %', v_aplica_stand; end if;
  raise notice 'OK: aplica_stand default false';
end $$;

-- item tipo=medicao SEM qtd_pontos_medicao deve falhar
do $$
begin
  begin
    insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao)
      select id, 'Espessura porta dianteira', 'medicao', null from public.checklist_group_templates where ordem = 1;
    raise exception 'FALHOU: deveria ter bloqueado medicao sem qtd_pontos_medicao';
  exception when check_violation then
    raise notice 'OK: qtd_pontos_medicao_valido bloqueou medicao sem faixa';
  end;
end $$;

-- item tipo=medicao com qtd_pontos_medicao=4 (dentro de 3-5) e aplica_stand=true deve passar
insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao, aplica_stand)
  select id, 'Espessura porta dianteira', 'medicao', 4, true from public.checklist_group_templates where ordem = 1;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00002_checklist_templates.test.sql`
Expected: `NOTICE: OK: ...`, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00002_checklist_templates.sql supabase/tests/00002_checklist_templates.test.sql
git commit -m "db: checklist group and item templates"
```

---

### Task 3: Checklist responses and media

**Files:**
- Create: `supabase/migrations/00003_checklist_responses_media.sql`
- Test: `supabase/tests/00003_checklist_responses_media.test.sql`

**Interfaces:**
- Consumes: `public.inspections(id)` (Task 1), `public.checklist_item_templates(id)` (Task 2).
- Produces: `public.checklist_item_responses(id, inspection_id, item_template_id, classificacao, observacao, status [generated], atualizado_em)`, `public.paint_measurements(item_response_id, valores_um, resultado_calculado)`, `public.photos(id, inspection_id, item_response_id, contexto, url, ordem, criado_em)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00003_checklist_responses_media.sql
create type item_classificacao as enum ('otimo', 'medio', 'ruim', 'NF');
create type item_status as enum ('pendente', 'respondido', 'NF');
create type paint_resultado as enum ('OK', 'anomalia', 'reparacao_colisao');
create type photo_contexto as enum ('item', 'capa');

create table public.checklist_item_responses (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  item_template_id uuid not null references public.checklist_item_templates(id),
  classificacao item_classificacao,
  observacao text,
  status item_status generated always as (
    case
      when classificacao is null then 'pendente'::item_status
      when classificacao = 'NF' then 'NF'::item_status
      else 'respondido'::item_status
    end
  ) stored,
  atualizado_em timestamptz not null default now(),
  unique (inspection_id, item_template_id)
);

create index on public.checklist_item_responses (inspection_id);

create table public.paint_measurements (
  item_response_id uuid primary key references public.checklist_item_responses(id) on delete cascade,
  valores_um numeric(6,2)[] not null,
  resultado_calculado paint_resultado not null
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  item_response_id uuid references public.checklist_item_responses(id) on delete cascade,
  contexto photo_contexto not null,
  url text not null,
  ordem int,
  criado_em timestamptz not null default now(),
  constraint photo_contexto_coerente check (
    (contexto = 'item' and item_response_id is not null)
    or (contexto = 'capa' and item_response_id is null)
  )
);

create index on public.photos (inspection_id);
create index on public.photos (item_response_id);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up`
Expected: applies with no errors.

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00003_checklist_responses_media.test.sql
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tecnico@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Técnico Teste', 'tecnico@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'particular', 'compra');
insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Exterior');
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', 'Vidro dianteiro esquerdo', 'padrao');

-- status derivado: sem classificacao -> pendente
insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000030');
do $$
declare v_status item_status;
begin
  select status into v_status from public.checklist_item_responses where id = '00000000-0000-0000-0000-000000000040';
  if v_status <> 'pendente' then raise exception 'FALHOU: esperava pendente, veio %', v_status; end if;
  raise notice 'OK: status derivado = pendente sem classificacao';
end $$;

-- status derivado: classificacao=NF -> status=NF
update public.checklist_item_responses set classificacao = 'NF' where id = '00000000-0000-0000-0000-000000000040';
do $$
declare v_status item_status;
begin
  select status into v_status from public.checklist_item_responses where id = '00000000-0000-0000-0000-000000000040';
  if v_status <> 'NF' then raise exception 'FALHOU: esperava NF, veio %', v_status; end if;
  raise notice 'OK: status derivado = NF quando classificacao=NF';
end $$;

-- foto de item SEM item_response_id deve falhar
do $$
begin
  begin
    insert into public.photos (inspection_id, contexto, url) values
      ('00000000-0000-0000-0000-000000000010', 'item', 'https://x/foto.jpg');
    raise exception 'FALHOU: deveria ter bloqueado foto contexto=item sem item_response_id';
  exception when check_violation then
    raise notice 'OK: photo_contexto_coerente bloqueou item sem item_response_id';
  end;
end $$;

-- foto de capa com item_response_id preenchido deve falhar
do $$
begin
  begin
    insert into public.photos (inspection_id, item_response_id, contexto, url) values
      ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000040', 'capa', 'https://x/capa.jpg');
    raise exception 'FALHOU: deveria ter bloqueado foto contexto=capa com item_response_id';
  exception when check_violation then
    raise notice 'OK: photo_contexto_coerente bloqueou capa com item_response_id';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00003_checklist_responses_media.test.sql`
Expected: four `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00003_checklist_responses_media.sql supabase/tests/00003_checklist_responses_media.test.sql
git commit -m "db: checklist item responses, paint measurements, unified photos table"
```

---

### Task 4: Workflow and audit

**Files:**
- Create: `supabase/migrations/00004_workflow_audit.sql`
- Test: `supabase/tests/00004_workflow_audit.test.sql`

**Interfaces:**
- Consumes: `public.inspections(id)`, `public.users(id)` (Task 1).
- Produces: `public.review_events(id, inspection_id, tipo, autor_id, motivo, timestamp)`, `public.audit_log_entries(id, inspection_id, admin_id, descricao, timestamp)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00004_workflow_audit.sql
create type review_tipo as enum ('aprovacao', 'devolucao', 'cancelamento');

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  tipo review_tipo not null,
  autor_id uuid not null references public.users(id),
  motivo text,
  timestamp timestamptz not null default now(),
  constraint motivo_obrigatorio_devolucao_cancelamento check (
    tipo = 'aprovacao' or motivo is not null
  )
);

create index on public.review_events (inspection_id);

-- RF-36: log simples (quem, o quê, quando) — sem valor anterior/novo.
-- RNF-11: inspection_id NÃO usa "on delete cascade" (diferente de review_events) —
-- deletar uma inspeção com log de auditoria deve falhar (foreign_key_violation),
-- não apagar o log junto. Isso é o que torna "log imutável" uma garantia real de
-- banco, não só a revocação de UPDATE/DELETE abaixo (que não bloqueia cascade).
create table public.audit_log_entries (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id),
  admin_id uuid not null references public.users(id),
  descricao text not null,
  timestamp timestamptz not null default now()
);

create index on public.audit_log_entries (inspection_id);

-- RNF-11: log é somente-inserção — bloqueado a nível de banco, não só por convenção de app.
revoke update, delete on public.audit_log_entries from authenticated, anon;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up`
Expected: applies with no errors.

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00004_workflow_audit.test.sql
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'admin@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Admin Teste', 'admin@test.com', 'admin');
insert into public.inspections (id, tecnico_id, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'particular', 'compra');

-- devolucao sem motivo deve falhar (RF-32: motivo obrigatório)
do $$
begin
  begin
    insert into public.review_events (inspection_id, tipo, autor_id) values
      ('00000000-0000-0000-0000-000000000010', 'devolucao', '00000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU: deveria ter bloqueado devolucao sem motivo';
  exception when check_violation then
    raise notice 'OK: motivo_obrigatorio_devolucao_cancelamento bloqueou devolucao sem motivo';
  end;
end $$;

-- aprovacao sem motivo passa normalmente
insert into public.review_events (inspection_id, tipo, autor_id) values
  ('00000000-0000-0000-0000-000000000010', 'aprovacao', '00000000-0000-0000-0000-000000000001');

insert into public.audit_log_entries (inspection_id, admin_id, descricao) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Editou VIN do veículo');

-- RNF-11: deletar uma inspeção com log de auditoria deve falhar (sem cascade) —
-- o log não pode sumir silenciosamente junto com a inspeção.
do $$
begin
  begin
    delete from public.inspections where id = '00000000-0000-0000-0000-000000000010';
    raise exception 'FALHOU: deveria ter bloqueado delete de inspection com audit_log_entries';
  exception when foreign_key_violation then
    raise notice 'OK: audit_log_entries sem cascade bloqueou delete da inspection';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00004_workflow_audit.test.sql`
Expected: two `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00004_workflow_audit.sql supabase/tests/00004_workflow_audit.test.sql
git commit -m "db: review events and insert-only audit log"
```

---

### Task 5: Client access log

**Files:**
- Create: `supabase/migrations/00005_client_access_log.sql`
- Test: `supabase/tests/00005_client_access_log.test.sql`

**Interfaces:**
- Consumes: `public.inspections(id)` (Task 1).
- Produces: `public.client_access_logs(id, inspection_id, email, origem, acessado_em)`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00005_client_access_log.sql
create table public.client_access_logs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  email text not null,
  origem text,
  acessado_em timestamptz not null default now()
);

create index on public.client_access_logs (inspection_id);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up`
Expected: applies with no errors.

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00005_client_access_log.test.sql
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tecnico@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Técnico Teste', 'tecnico@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'particular', 'compra');

insert into public.client_access_logs (inspection_id, email, origem) values
  ('00000000-0000-0000-0000-000000000010', 'cliente@example.com', 'whatsapp');

do $$
declare v_count int;
begin
  select count(*) into v_count from public.client_access_logs
    where inspection_id = '00000000-0000-0000-0000-000000000010';
  if v_count <> 1 then raise exception 'FALHOU: esperava 1 registro de acesso, veio %', v_count; end if;
  raise notice 'OK: client_access_logs grava acesso do cliente';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00005_client_access_log.test.sql`
Expected: `NOTICE: OK: ...`, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00005_client_access_log.sql supabase/tests/00005_client_access_log.test.sql
git commit -m "db: client access log for report link gate"
```

---

### Task 6: Admin list search/filter/sort indexes (RF-58, RF-59)

**Files:**
- Create: `supabase/migrations/00006_admin_list_indexes.sql`

**Interfaces:**
- Consumes: `public.inspections`, `public.vehicle_data`, `public.client_data` (Task 1). Pure index addition — no new tables, nothing downstream depends on this task.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00006_admin_list_indexes.sql
create index if not exists idx_inspections_tecnico on public.inspections (tecnico_id);
create index if not exists idx_inspections_status on public.inspections (status);
create index if not exists idx_inspections_data_abertura on public.inspections (data_abertura desc);

-- RF-58: busca livre por matrícula/cliente/modelo — pg_trgm é extensão nativa do Postgres,
-- cobre ILIKE '%termo%' com índice, sem precisar de motor de busca externo (Elasticsearch etc.)
create extension if not exists pg_trgm;
create index if not exists idx_vehicle_data_matricula_trgm on public.vehicle_data using gin (matricula gin_trgm_ops);
create index if not exists idx_vehicle_data_modelo_trgm on public.vehicle_data using gin (modelo gin_trgm_ops);
create index if not exists idx_client_data_nome_trgm on public.client_data using gin (nome_solicitante gin_trgm_ops);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up`
Expected: applies with no errors.

- [ ] **Step 3: Verify the trigram index is used**

Run: `psql "$DATABASE_URL" -c "explain select * from public.vehicle_data where matricula ilike '%AB12%';"`
Expected: plan mentions `Bitmap Index Scan on idx_vehicle_data_matricula_trgm` (not a sequential scan), once the table has enough rows for the planner to prefer it — on an empty/tiny table Postgres may still choose a seq scan, which is correct behavior, not a bug.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00006_admin_list_indexes.sql
git commit -m "db: search/filter/sort indexes for the admin inspection list"
```

---

### Task 7: Fix inspections_with_flags security_invoker + drop redundant index

**Files:**
- Create: `supabase/migrations/00007_security_invoker_fix.sql`

**Interfaces:**
- Consumes: `public.inspections_with_flags` (Task 1), `public.checklist_item_responses` (Task 3). No new tables, no downstream dependents.

**Why this is its own migration and not an edit to 00001/00003:** those are already applied to the hosted project. Editing an applied migration file in place (as happened twice earlier in this plan, for good reason at the time) works today only because the CLI's ledger tracks by version number, not content checksum — but it's a fragile habit for a team/CI environment. From here on: new fix, new migration number.

- [ ] **Step 1: Write the migration**

Found in the final whole-branch review: `inspections_with_flags` (Task 1) was created without `security_invoker`, so on Postgres 15+ it runs with the view owner's privileges, not the querying role's. Once Row Level Security lands on `public.inspections` (still explicitly deferred, see below), any query routed through this view would silently bypass those policies — the exact "every técnico reads every inspection" leak RLS is meant to prevent, reintroduced through the view. Fixing now, before RLS exists and before app code depends on the view, is cheaper than rediscovering it as a security finding later.

Also folds in a Minor finding from the same review: `checklist_item_responses_inspection_id_idx` (from Task 3) is redundant — the `unique (inspection_id, item_template_id)` constraint already provides a leftmost-prefix index for `inspection_id`-only lookups.

```sql
-- supabase/migrations/00007_security_invoker_fix.sql
alter view public.inspections_with_flags set (security_invoker = true);

drop index if exists public.checklist_item_responses_inspection_id_idx;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors.

- [ ] **Step 3: Verify**

```sql
-- supabase/tests/00007_security_invoker_fix.test.sql
begin;

do $$
begin
  -- security_invoker is stored as a view option in pg_class.reloptions, not a column flag
  if not exists (
    select 1 from pg_class c
    where c.relname = 'inspections_with_flags'
      and c.relkind = 'v'
      and 'security_invoker=true' = any(c.reloptions)
  ) then
    raise exception 'FALHOU: inspections_with_flags nao tem security_invoker=true';
  end if;
  raise notice 'OK: inspections_with_flags tem security_invoker=true';
end $$;

do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'checklist_item_responses_inspection_id_idx'
  ) then
    raise exception 'FALHOU: indice redundante ainda existe';
  end if;
  raise notice 'OK: indice redundante removido';
end $$;

rollback;
```

Run: `psql "$DATABASE_URL" -f supabase/tests/00007_security_invoker_fix.test.sql`
Expected: two `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00007_security_invoker_fix.sql supabase/tests/00007_security_invoker_fix.test.sql
git commit -m "fix: inspections_with_flags security_invoker + drop redundant index

Found in final whole-branch review. Without security_invoker, this view
runs with the owner's privileges and will silently bypass RLS policies
on inspections once they're written — fixing before RLS exists and
before app code depends on the view. Also drops
checklist_item_responses_inspection_id_idx, made redundant by the
(inspection_id, item_template_id) unique constraint from Task 3."
```

---

## Explicitly deferred (not tasks in this plan)

- **Row Level Security policies** (Técnico só vê as próprias inspeções, Admin vê todas — Mapa de Permissões em `docs/especificacao-tecnica-v1.md` §3). The tables here are the prerequisite; RLS is an auth/access-control concern that belongs with Fase 0's auth setup, not with table architecture. Flagging so it doesn't get silently dropped: **someone must write these policies before any client-facing app code queries these tables directly**, or every técnico can currently read every inspection.
- **Seeding the 285 v1.0 checklist items** into `checklist_group_templates`/`checklist_item_templates` — content now exists at `docs/data/checklist-inspecta-v5.csv`, but the `aplica_stand` column is still marked `PENDENTE` on every row pending the sócios' item-by-item decision (RF-63). Seed can be generated as soon as that column is filled in.

## Self-Review

**Spec coverage:** every entity in `docs/especificacao-tecnica-v1.md` §4 has a table (USER→users, INSPECTION→inspections incl. merged certificate fields, VEHICLE_DATA, CLIENT_DATA, CHECKLIST_GROUP_TEMPLATE, CHECKLIST_ITEM_TEMPLATE, CHECKLIST_ITEM_RESPONSE, PAINT_MEASUREMENT, PHOTO unified, AUDIT_LOG_ENTRY simplified, REVIEW_EVENT, CLIENT_ACCESS_LOG). RF-03 (stand→venda), RF-16 (foto obrigatória se ruim — left to app layer, not a DB constraint since "ruim" alone doesn't require a photo at the DB level without knowing upload state), RF-32 (motivo obrigatório na devolução), RF-58/59 (busca/filtro/ordenação) are all covered by constraints or indexes above.
**Placeholder scan:** none — every step has runnable SQL and exact commands.
**Type consistency:** `item_response_id`, `inspection_id`, `admin_id`, `tecnico_id`, `autor_id` are `uuid` everywhere they appear across tasks; enum names match between creation (Task 1-4) and usage (Task 3-4).
