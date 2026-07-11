# Fase 2 — Preenchimento de Item (RF-13 a RF-22) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the database-layer gaps for Fase 2 (Preenchimento de item) of `docs/especificacao-tecnica-v1.md` §1.4–1.5 (RF-13 a RF-22): enforce "foto obrigatória se ruim" (RF-16), let técnico remove photos on an editable inspection (RF-17), validate the 3-5 measurement points per item (RF-19), and compute the thickness-measurement result automatically from fixed thresholds (RF-20/RNF-19).

**Architecture:** Four independent migrations continuing the established one-concern-per-migration pattern (00001-00010). Business rules that reference more than one table (photo-required-if-ruim) become `constraint trigger`s, since a plain `CHECK` constraint cannot look at another table; the thickness calculation becomes a `generated always as (...) stored` column (same technique already used for `checklist_item_responses.status`), fed by two small `immutable` helper functions since Postgres generated-column expressions cannot contain a subquery — `unnest()`+`max()/min()` needs one, but a function call wrapping that subquery does not. This is DB-only: no application/frontend code exists in this repo yet, and none is introduced here.

**Tech Stack:** PostgreSQL (Supabase) — `create trigger` / `create constraint trigger`, `generated always as (...) stored`, plain SQL migrations via `supabase db push`, hand-rolled `do $$ ... raise exception ... $$` tests via `psql "$DATABASE_URL"` (same style as `supabase/tests/00001-00010`).

## Global Constraints

- DB-layer only. No frontend/app code, no new tech stack decision — RF-14 (confirmação explícita de NF) and free navigation between groups are UI concerns, explicitly out of scope (see "Explicitly out of scope" below).
- Only two roles exist: `tecnico`/`admin` (carried over from the RLS branch) — no new roles.
- Faixas de resultado da medição de espessura são fixas no código (RNF-19), sem tela de configuração: `< 70µm` e `161–299µm` → `anomalia`; `70–160µm` → `OK`; `≥ 300µm` → `reparacao_colisao`. Pior caso vence entre os pontos medidos de um mesmo item.
- Reuse `public.owns_editable_inspection(uuid)` and `public.is_admin()` from `supabase/migrations/00008_rls_helpers_and_core.sql` wherever ownership/status gating is needed — do not redefine them.
- Every migration is plain SQL applied via `supabase db push` — no ORM, no trigger framework.
- `(select auth.uid())` pattern (not bare `auth.uid()`) in any new RLS policy.

---

## File Structure

```
supabase/
  migrations/
    00011_paint_measurement_point_count.sql   -- RF-19: valores_um length must match qtd_pontos_medicao
    00012_paint_result_generated_column.sql   -- RF-20/RNF-19: resultado_calculado becomes a generated column
    00013_ruim_requires_photo.sql             -- RF-16: classificacao='ruim' requires >=1 item photo (deferred)
    00014_photos_delete_policy.sql            -- RF-17: técnico can delete own item photos on an editable inspection
  tests/
    00011_paint_measurement_point_count.test.sql
    00012_paint_result_generated_column.test.sql
    00013_ruim_requires_photo.test.sql
    00014_photos_delete_policy.test.sql
```

**Prerequisite (once, not a task):** confirm `DATABASE_URL` is set (see `.env.local` convention from the RLS branch — gitignored, `set -a && source .env.local && set +a` before any `psql`/`supabase db push` command) and points at the same linked project that already has migrations 00001-00010 applied. `psql` needs `/opt/homebrew/opt/libpq/bin` on `PATH` on this machine (not there by default).

---

### Task 1: Measurement point-count validation (RF-19)

**Files:**
- Create: `supabase/migrations/00011_paint_measurement_point_count.sql`
- Test: `supabase/tests/00011_paint_measurement_point_count.test.sql`

**Interfaces:**
- Consumes: `public.checklist_item_responses(id, item_template_id)`, `public.checklist_item_templates(id, qtd_pontos_medicao)`, `public.paint_measurements(item_response_id, valores_um)` — all from `00002`/`00003`.
- Produces: nothing consumed by later tasks in this plan (Task 2 alters the same table but not this trigger).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00011_paint_measurement_point_count.sql
-- RF-19: cada item de medicao aceita de 3 a 5 pontos numericos, definido por item
-- em checklist_item_templates.qtd_pontos_medicao. paint_measurements.valores_um
-- ainda nao valida esse tamanho -- fecha esse buraco via trigger (CHECK simples
-- nao alcanca outra tabela).

create function public.check_valores_um_length() returns trigger
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_expected int;
begin
  select cit.qtd_pontos_medicao into v_expected
  from public.checklist_item_responses cir
  join public.checklist_item_templates cit on cit.id = cir.item_template_id
  where cir.id = new.item_response_id;

  if v_expected is null then
    raise exception 'item_response % nao esta associado a um item de medicao valido', new.item_response_id
      using errcode = 'check_violation';
  end if;

  if array_length(new.valores_um, 1) is distinct from v_expected then
    raise exception 'valores_um deve ter % ponto(s) para este item (recebeu %)', v_expected, array_length(new.valores_um, 1)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger paint_measurements_valores_um_length
  before insert or update of valores_um on public.paint_measurements
  for each row execute function public.check_valores_um_length();
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors (1 function, 1 trigger).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00011_paint_measurement_point_count.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Exterior');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Espessura de pintura - Capo', 'medicao', 3);

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021');

do $$
begin
  begin
    insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado)
      values ('00000000-0000-0000-0000-000000000030', array[100.0, 110.0]::numeric(6,2)[], 'OK');
    raise exception 'FALHOU: deveria ter bloqueado 2 pontos quando o item exige 3';
  exception when check_violation then
    raise notice 'OK: insert bloqueado com numero errado de pontos (2 de 3)';
  end;
end $$;

do $$
begin
  insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado)
    values ('00000000-0000-0000-0000-000000000030', array[100.0, 110.0, 120.0]::numeric(6,2)[], 'OK');
  raise notice 'OK: insert aceito com numero certo de pontos (3 de 3)';
end $$;

do $$
begin
  begin
    update public.paint_measurements set valores_um = array[100.0, 110.0, 120.0, 130.0, 140.0]::numeric(6,2)[]
      where item_response_id = '00000000-0000-0000-0000-000000000030';
    raise exception 'FALHOU: deveria ter bloqueado update para 5 pontos quando o item exige 3';
  exception when check_violation then
    raise notice 'OK: update bloqueado com numero errado de pontos (5 de 3)';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00011_paint_measurement_point_count.test.sql`
Expected: three `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00011_paint_measurement_point_count.sql supabase/tests/00011_paint_measurement_point_count.test.sql
git commit -m "feat: validate paint_measurements point count against item template (RF-19)

valores_um now has to match checklist_item_templates.qtd_pontos_medicao
(3-5) for its item, on both INSERT and UPDATE. A plain CHECK can't
reach another table, so this is a BEFORE trigger."
```

---

### Task 2: Automatic thickness-measurement result (RF-20, RNF-19)

**Files:**
- Create: `supabase/migrations/00012_paint_result_generated_column.sql`
- Test: `supabase/tests/00012_paint_result_generated_column.test.sql`

**Interfaces:**
- Consumes: `public.paint_measurements(item_response_id, valores_um)` (`00003`), the length trigger from Task 1 (fixtures in this task's test must satisfy it too).
- Produces: `public.array_max_numeric(numeric[]) returns numeric`, `public.array_min_numeric(numeric[]) returns numeric` — not consumed elsewhere in this plan, but available for reuse if a later phase needs array-reduction logic.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00012_paint_result_generated_column.sql
-- RF-20 / RNF-19: resultado_calculado deixa de ser uma coluna gravavel pelo app e
-- passa a ser calculado pelo proprio Postgres a partir de valores_um, com as faixas
-- fixas no codigo (sem tela de configuracao):
--   < 70um        -> anomalia (pintura fina demais / desgaste, ex: polimento agressivo)
--   70um a 160um  -> OK (faixa padrao de fabrica)
--   161um a 299um -> anomalia (repintura provavel, mas sem massa pesada)
--   >= 300um      -> reparacao_colisao (indicio de massa plastica/poliester)
-- Pior caso vence: se qualquer ponto bate reparacao_colisao, o item inteiro fica
-- reparacao_colisao mesmo que os outros pontos estejam dentro da faixa normal.
--
-- Generated columns nao aceitam subquery na expressao (unnest()+max()/min() exige
-- uma), entao a reducao do array vira duas funcoes IMMUTABLE simples, que sao uma
-- chamada de funcao comum do ponto de vista da coluna gerada.

create function public.array_max_numeric(arr numeric[]) returns numeric
language sql immutable
security invoker set search_path = ''
as $$
  select max(v) from unnest(arr) as v
$$;

create function public.array_min_numeric(arr numeric[]) returns numeric
language sql immutable
security invoker set search_path = ''
as $$
  select min(v) from unnest(arr) as v
$$;

alter table public.paint_measurements drop column resultado_calculado;

alter table public.paint_measurements add column resultado_calculado paint_resultado
  generated always as (
    case
      when public.array_max_numeric(valores_um) >= 300 then 'reparacao_colisao'::paint_resultado
      when public.array_min_numeric(valores_um) < 70
        or public.array_max_numeric(valores_um) >= 161 then 'anomalia'::paint_resultado
      else 'OK'::paint_resultado
    end
  ) stored;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors (2 functions; `resultado_calculado` dropped and re-added as generated — table is empty in production so this is safe).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00012_paint_result_generated_column.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Exterior');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000020', 'Capo', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000020', 'Tejadilho', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000020', 'Porta diant esq', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000020', 'Porta diant dir', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000020', 'Porta tras esq', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000020', 'Porta tras dir', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000020', 'Para-lamas esq', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000020', 'Para-lamas dir', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000049', '00000000-0000-0000-0000-000000000020', 'Soleira esq', 'medicao', 3);

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000043'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000044'),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000045'),
  ('00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000046'),
  ('00000000-0000-0000-0000-000000000057', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000047'),
  ('00000000-0000-0000-0000-000000000058', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000048'),
  ('00000000-0000-0000-0000-000000000059', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000049');

-- caso normal: todos os pontos na faixa de fabrica (70-160)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000051', array[100.0, 110.0, 120.0]::numeric(6,2)[]);
-- um ponto fino demais (<70)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000052', array[50.0, 110.0, 120.0]::numeric(6,2)[]);
-- um ponto em faixa de repintura (161-299)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000053', array[200.0, 110.0, 120.0]::numeric(6,2)[]);
-- um ponto de reparacao de colisao (>=300), mesmo com os outros normais
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000054', array[300.0, 110.0, 120.0]::numeric(6,2)[]);
-- fronteira: 70 e 160 sao OK (inclusive)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000055', array[70.0, 160.0, 120.0]::numeric(6,2)[]);
-- fronteira: 69 e anomalia (abaixo de 70)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000056', array[69.0, 110.0, 120.0]::numeric(6,2)[]);
-- fronteira: 161 e anomalia (limite inferior da faixa de repintura)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000057', array[161.0, 110.0, 120.0]::numeric(6,2)[]);
-- fronteira: 299 ainda e anomalia (limite superior da faixa de repintura)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000058', array[299.0, 110.0, 120.0]::numeric(6,2)[]);
-- fronteira: 300 exato ja e reparacao_colisao
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000059', array[300.0, 110.0, 120.0]::numeric(6,2)[]);

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000051';
  if v_resultado <> 'OK' then
    raise exception 'FALHOU: todos os pontos na faixa de fabrica deveria dar OK (deu %)', v_resultado;
  end if;
  raise notice 'OK: todos os pontos 70-160 calcula OK';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000052';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: ponto abaixo de 70 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: um ponto abaixo de 70 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000053';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: ponto em 161-299 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: um ponto em 161-299 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000054';
  if v_resultado <> 'reparacao_colisao' then
    raise exception 'FALHOU: ponto >=300 deveria dar reparacao_colisao mesmo com outros pontos normais (deu %)', v_resultado;
  end if;
  raise notice 'OK: um ponto >=300 calcula reparacao_colisao mesmo com o pior caso vencendo sobre pontos normais';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000055';
  if v_resultado <> 'OK' then
    raise exception 'FALHOU: 70 e 160 exatos deveriam dar OK (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteiras 70 e 160 calculam OK (inclusive)';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000056';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: 69 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteira 69 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000057';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: 161 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteira 161 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000058';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: 299 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteira 299 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000059';
  if v_resultado <> 'reparacao_colisao' then
    raise exception 'FALHOU: 300 exato deveria dar reparacao_colisao (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteira 300 calcula reparacao_colisao';
end $$;

do $$
begin
  begin
    insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado)
      values ('00000000-0000-0000-0000-000000000051', array[100.0, 110.0, 120.0]::numeric(6,2)[], 'OK');
    raise exception 'FALHOU: resultado_calculado deveria ser generated (nao aceitar insert explicito)';
  exception when generated_always then
    raise notice 'OK: resultado_calculado rejeita valor explicito (e generated always)';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00012_paint_result_generated_column.test.sql`
Expected: ten `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00012_paint_result_generated_column.sql supabase/tests/00012_paint_result_generated_column.test.sql
git commit -m "feat: compute paint_measurements.resultado_calculado automatically (RF-20, RNF-19)

Faixas fixas no código, sem tela de configuração: <70µm/161-299µm =
anomalia, 70-160µm = OK, >=300µm = reparacao_colisao. Pior ponto vence.
Generated column via duas funções IMMUTABLE (array_max_numeric/
array_min_numeric) porque a expressão de coluna gerada não aceita
subquery e unnest()+max()/min() precisa de uma."
```

---

### Task 3: Foto obrigatória quando classificação = ruim (RF-16)

**Files:**
- Create: `supabase/migrations/00013_ruim_requires_photo.sql`
- Test: `supabase/tests/00013_ruim_requires_photo.test.sql`

**Interfaces:**
- Consumes: `public.checklist_item_responses(id, classificacao)`, `public.photos(item_response_id, contexto)` (`00003`).
- Produces: nothing consumed by later tasks in this plan.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00013_ruim_requires_photo.sql
-- RF-16: quando a classificacao for 'ruim', pelo menos 1 foto e obrigatoria antes
-- de avancar/salvar o item. E uma invariante entre duas tabelas
-- (checklist_item_responses x photos), entao nao da pra expressar como CHECK
-- simples -- usa constraint trigger deferravel, checada so no fim da transacao
-- (equivalente a "salvar o item"), para permitir marcar ruim e anexar a foto na
-- mesma transacao sem bloquear um passo no meio do caminho.

create function public.check_ruim_requires_photo() returns trigger
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_response_id uuid;
  v_classificacao item_classificacao;
  v_photo_count int;
begin
  if TG_TABLE_NAME = 'checklist_item_responses' then
    v_response_id := new.id;
  else
    v_response_id := coalesce(old.item_response_id, new.item_response_id);
    if v_response_id is null then
      return coalesce(new, old);
    end if;
  end if;

  select classificacao into v_classificacao
  from public.checklist_item_responses
  where id = v_response_id;

  if v_classificacao = 'ruim' then
    select count(*) into v_photo_count
    from public.photos
    where item_response_id = v_response_id and contexto = 'item';

    if v_photo_count = 0 then
      raise exception 'RF-16: item % classificado como ruim precisa de pelo menos 1 foto', v_response_id
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create constraint trigger checklist_item_responses_ruim_requires_photo
  after insert or update of classificacao on public.checklist_item_responses
  deferrable initially deferred
  for each row execute function public.check_ruim_requires_photo();

create constraint trigger photos_ruim_requires_photo
  after delete on public.photos
  deferrable initially deferred
  for each row execute function public.check_ruim_requires_photo();
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors (1 function, 2 constraint triggers).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00013_ruim_requires_photo.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Grupo Teste');
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item A', 'padrao'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item B', 'padrao');

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022');

-- Cenario A (modo deferred, o default): marcar ruim e anexar a foto na mesma
-- transacao nao deve bloquear no meio do caminho, e deve passar quando a
-- constraint e forcada a checar.
do $$
begin
  update public.checklist_item_responses set classificacao = 'ruim'
    where id = '00000000-0000-0000-0000-000000000060';
  insert into public.photos (inspection_id, item_response_id, contexto, url)
    values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000060', 'item', 'https://example.com/foto-ruim.jpg');
  execute 'set constraints all immediate';
  raise notice 'OK: ruim com foto na mesma transacao passa quando a constraint deferrable e checada';
exception when check_violation then
  raise exception 'FALHOU: ruim com foto nao deveria ter bloqueado';
end $$;

-- A partir daqui a sessao esta em modo IMMEDIATE (SET CONSTRAINTS afeta o resto
-- da transacao) -- os cenarios B/C/D testam diretamente, sem precisar forcar de novo.

-- Cenario B: marcar ruim sem nenhuma foto deve bloquear.
do $$
begin
  begin
    update public.checklist_item_responses set classificacao = 'ruim'
      where id = '00000000-0000-0000-0000-000000000061';
    raise exception 'FALHOU: deveria ter bloqueado ruim sem foto';
  exception when check_violation then
    raise notice 'OK: ruim sem foto bloqueado';
  end;
end $$;

-- Cenario C: remover a unica foto de um item que continua ruim deve bloquear.
do $$
begin
  begin
    delete from public.photos
      where item_response_id = '00000000-0000-0000-0000-000000000060' and contexto = 'item';
    raise exception 'FALHOU: deveria ter bloqueado remover a unica foto de item ruim';
  exception when check_violation then
    raise notice 'OK: remover a unica foto de item ruim bloqueado';
  end;
end $$;

-- Cenario D: mudar a classificacao para longe de 'ruim' libera a remocao da foto.
do $$
begin
  update public.checklist_item_responses set classificacao = 'medio'
    where id = '00000000-0000-0000-0000-000000000060';
  delete from public.photos
    where item_response_id = '00000000-0000-0000-0000-000000000060' and contexto = 'item';
  raise notice 'OK: apos mudar classificacao para nao-ruim, remover a foto e permitido';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00013_ruim_requires_photo.test.sql`
Expected: four `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00013_ruim_requires_photo.sql supabase/tests/00013_ruim_requires_photo.test.sql
git commit -m "feat: enforce foto obrigatória quando classificação=ruim (RF-16)

Invariante entre checklist_item_responses e photos, checada com
constraint trigger deferrable (initially deferred) em vez de imediata,
para permitir marcar ruim e anexar a foto na mesma transação sem se
bloquearem um ao outro no meio do caminho — só falha se a transação
tentasse fechar sem nenhuma foto de item para uma resposta ruim."
```

---

### Task 4: Técnico pode remover fotos em inspeção editável (RF-17)

**Files:**
- Create: `supabase/migrations/00014_photos_delete_policy.sql`
- Test: `supabase/tests/00014_photos_delete_policy.test.sql`

**Interfaces:**
- Consumes: `public.is_admin()`, `public.owns_editable_inspection(uuid)` (`00008`), `public.photos(inspection_id, contexto)` (`00003`).
- Produces: nothing consumed by later tasks in this plan.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00014_photos_delete_policy.sql
-- RF-17: fotos podem ser removidas pelo tecnico enquanto a inspecao nao estiver
-- finalizada. A branch de RLS anterior deixou de proposito sem nenhuma policy de
-- DELETE em nenhuma tabela ("se surgir necessidade real depois, adiciona-se uma
-- policy pontual ai" -- design spec da branch rls-policies, secao 1); este e esse
-- "depois", motivado por RF-17. Fora de photos, nenhuma outra tabela precisa de
-- DELETE ainda -- as demais continuam sem policy de DELETE.

create policy photos_delete on public.photos
  for delete to authenticated
  using (
    public.is_admin()
    or (public.owns_editable_inspection(inspection_id) and contexto = 'item')
  );
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors (1 policy).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00014_photos_delete_policy.test.sql
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
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'aguardando_aprovacao', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Grupo Teste');
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item A', 'padrao');

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021');

insert into public.photos (id, inspection_id, item_response_id, contexto, url) values
  ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000060', 'item', 'https://example.com/foto-editavel.jpg'),
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000061', 'item', 'https://example.com/foto-nao-editavel.jpg');
insert into public.photos (id, inspection_id, item_response_id, contexto, ordem, url) values
  ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000010', null, 'capa', 1, 'https://example.com/foto-capa.jpg');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
declare v_rows int;
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000071';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria remover foto de inspecao fora de rascunho/devolvida';
  end if;
  raise notice 'OK: delete bloqueado em foto de inspecao nao editavel';
end $$;

do $$
declare v_rows int;
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000072';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria remover foto de capa';
  end if;
  raise notice 'OK: delete bloqueado em foto de capa para tecnico';
end $$;

do $$
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000070';
  if not found then
    raise exception 'FALHOU: tecnico deveria remover a propria foto de item em inspecao editavel';
  end if;
  raise notice 'OK: tecnico remove a propria foto de item em inspecao editavel';
end $$;

-- simulate tecnico 2 (isolation)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

do $$
declare v_rows int;
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000072';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico2 nao deveria remover foto de outro tecnico';
  end if;
  raise notice 'OK: tecnico2 nao remove foto de outro tecnico (isolamento)';
end $$;

-- simulate admin
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000071';
  if not found then
    raise exception 'FALHOU: admin deveria remover qualquer foto';
  end if;
  raise notice 'OK: admin remove foto de qualquer inspecao/status';
end $$;

do $$
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000072';
  if not found then
    raise exception 'FALHOU: admin deveria remover foto de capa';
  end if;
  raise notice 'OK: admin remove foto de capa';
end $$;

reset role;
rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00014_photos_delete_policy.test.sql`
Expected: six `NOTICE: OK: ...` lines, no `ERROR`, no `FALHOU`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00014_photos_delete_policy.sql supabase/tests/00014_photos_delete_policy.test.sql
git commit -m "feat: técnico pode remover fotos de item em inspeção editável (RF-17)

Fecha o gap deixado de propósito na branch rls-policies (nenhuma
policy de DELETE existia ainda). Escopo mínimo: só photos, só
contexto=item, só enquanto owns_editable_inspection — mesma trava de
status usada em todo o resto do schema. Admin remove qualquer foto,
qualquer status, qualquer contexto."
```

---

## Explicitly out of scope (not tasks in this plan)

- **RF-13** (classificação ótimo/médio/ruim/NF) — já satisfeito por `checklist_item_responses.classificacao` (enum `item_classificacao`, migration `00003`). Nada a fazer.
- **RF-15** (item aceita 1+ fotos e observação livre) — já satisfeito: `photos.item_response_id` permite múltiplas fotos por resposta, `checklist_item_responses.observacao` é `text` livre. Nada a fazer.
- **RF-18** (itens NF não entram na pontuação nem no relatório) — é lógica de geração de relatório/pontuação (Fase 4/6), não uma regra que se expresse como constraint aqui. `checklist_item_responses.status` já marca `'NF'` via generated column (`00003`); a lógica de "não entra no cálculo" pertence ao plano de Fase 4 (Pontuação).
- **RF-21** (item de medição também aceita foto e observação, como item padrão) — já satisfeito: `photos`/`observacao` não fazem distinção por `tipo` de item template. Nada a fazer.
- **RF-22** (resultado de medição aparece no relatório mas fica fora da pontuação numérica) — lógica de geração de relatório (Fase 6), fora de escopo aqui.
- **RF-14** (confirmação explícita antes de aplicar NF) — é interação de UI (um diálogo de confirmação), não uma regra de dados. Não existe camada de app neste repositório ainda; entra no plano de bootstrap de app quando esse existir.
- **Navegação livre entre grupos (RF-12), indicadores ✅/⚠️ (RF-10/11)** — UI, mesma razão acima.

## Self-Review

**Spec coverage:** RF-13/15/18/21/22 confirmados já satisfeitos pelo schema `00001-00010` (sem tarefa nova). RF-16 → Task 3. RF-17 → Task 4. RF-19 → Task 1. RF-20 (com RNF-19) → Task 2. RF-14 e navegação → fora de escopo, documentado com motivo.

**Placeholder scan:** nenhum — todo step tem SQL completo e comandos exatos com saída esperada.

**Type consistency:** `item_response_id`/`inspection_id`/`item_template_id` são `uuid` em todas as tasks, consistentes com `00001-00003`. `public.is_admin()`/`public.owns_editable_inspection(uuid)` chamados com o mesmo nome/assinatura da migration `00008` em Task 4. `paint_resultado`/`item_classificacao` usados com os mesmos valores de enum definidos em `00003` (`'OK' | 'anomalia' | 'reparacao_colisao'`, `'otimo' | 'medio' | 'ruim' | 'NF'`). `array_max_numeric`/`array_min_numeric` (Task 2) não são consumidos por nenhuma task posterior — não há inconsistência de assinatura a verificar entre tasks.
