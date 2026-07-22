# Modelo genérico de tipos de resposta — 1a (schema/SQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the checklist's rigid 2-type schema (`padrao` classificação fixa + `medicao` só tinta) por um modelo genérico de 4 tipos estruturais (`escolha`/`texto`/`data`/`medicao`) que suporta os ~30 rótulos de "Tipo de Resposta" do checklist real (`checklist_inspecta_v7.md`), sem quebrar o comportamento hoje existente pros 320 itens já seedados.

**Architecture:** Catálogo compartilhado de opções (`conjuntos_opcao`/`opcoes`) substitui o enum fixo `item_classificacao`; medição generaliza de tinta-só pra qualquer unidade via limiares configuráveis por item (`faixa_min_ok`/`faixa_max_ok`/`limiar_critico_*`); `status` e o resultado de medição viram *views* (não colunas geradas) porque ambos precisam ler `checklist_item_templates`, uma tabela diferente da linha em questão — o que uma coluna `generated` do Postgres não permite. RF-16 (foto obrigatória) generaliza pra checar `opcoes.exige_foto` OU `medicoes_resultado.resultado = 'critico'`, no lugar da string fixa `'ruim'`.

**Tech Stack:** Supabase (Postgres hospedado, sem Docker local), migrations aplicadas direto no banco remoto via `supabase db push --db-url`, testes SQL rodados via `psql -f` contra o mesmo banco (padrão já usado nas migrations 00001–00026).

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md` — leia pra entender o "porquê" de cada decisão.
- Esta é a Peça 1a de uma sequência maior (1a schema → 1b app layer → Peça 2 re-seed do checklist v7 → Peça 3 redesign visual). O front-end (`actions.ts`, os forms, as queries de página) **não muda nesta plano** — fica quebrado ao final desta 1a (a coluna `classificacao` deixa de existir) até a Peça 1b consertar. Isso é esperado e intencional — confirme com o usuário antes de considerar a 1a "pronta pra usar".
- Banco confirmado como só-teste (6 `checklist_item_responses`, 7 `inspections` de teste, nenhum dado de produção) — autorizado explicitamente pelo usuário a apagar. Nenhuma migration aqui precisa converter/preservar dados de resposta antigos.
- `ALTER TYPE ... ADD VALUE` não pode ser usado na mesma transação em que o valor novo é referenciado — cada migration do Supabase roda como uma transação própria, então a Task 2 (só enum) fica isolada de qualquer DDL que use `'escolha'`/`'texto'`/`'data'`.
- Renomear tabela/coluna via `ALTER TABLE ... RENAME` carrega RLS, triggers e views automaticamente (Postgres resolve por OID/attnum, não por texto) — não precisa recriar essas dependências, só renomeá-las por clareza onde fizer sentido.
- Toda migration que substitui uma função/RPC cujo corpo referencia uma coluna/tipo prestes a ser removido faz `drop function if exists` **antes** da remoção, na mesma migration — evita deixar uma função "landmine" que falha com erro de cast confuso; falha limpa de "function does not exist" até a task que a recria.
- Conectar ao banco: `export PATH="/opt/homebrew/opt/libpq/bin:$PATH" && set -a && source supabase/.env.local && set +a` antes de qualquer `psql`/`supabase db push` (mesmo padrão de todas as plans anteriores).

---

### Task 1: Catálogo de opções (`conjuntos_opcao` / `opcoes`)

**Files:**
- Create: `supabase/migrations/00027_conjuntos_opcao_e_opcoes.sql`
- Test: `supabase/tests/00027_conjuntos_opcao_e_opcoes.test.sql`

**Interfaces:**
- Produces: `public.conjuntos_opcao(id, nome)`, `public.opcoes(id, conjunto_id, label, ordem, exige_foto)`, um conjunto seedado `'estado_4'` (Ótimo/Médio/Ruim/N.A., `Ruim` com `exige_foto=true`) — Task 3 usa esse conjunto pra backfill; Task 6 lê `opcoes.exige_foto`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00027_conjuntos_opcao_e_opcoes.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 2. Catalogo compartilhado de conjuntos de opcoes -- ~20 conjuntos
-- (Bom/Medio/Mau, Funciona/Nao Funciona/N.A., etc.) se repetem em ~260 dos
-- 360 itens do checklist v7; um catalogo evita duplicar rotulos centenas de
-- vezes e centraliza a flag exige_foto (substitui o RF-16 fixo em 'ruim')
-- por opcao, num lugar so.

create table public.conjuntos_opcao (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

create table public.opcoes (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos_opcao(id) on delete cascade,
  label text not null,
  ordem int not null,
  exige_foto boolean not null default false
);

create index on public.opcoes (conjunto_id);

alter table public.conjuntos_opcao enable row level security;

create policy conjuntos_opcao_select on public.conjuntos_opcao
  for select to authenticated
  using (true);

alter table public.opcoes enable row level security;

create policy opcoes_select on public.opcoes
  for select to authenticated
  using (true);

-- Conjunto default que reproduz a classificacao universal de hoje
-- (item_classificacao: otimo/medio/ruim/NF) -- usado no backfill dos 320
-- itens existentes (Task 3), ate a Peca 2 (re-seed do checklist v7) trazer
-- os conjuntos reais.
insert into public.conjuntos_opcao (nome) values ('estado_4');

insert into public.opcoes (conjunto_id, label, ordem, exige_foto)
select co.id, v.label, v.ordem, v.exige_foto
from public.conjuntos_opcao co
cross join (values
  ('Ótimo', 1, false),
  ('Médio', 2, false),
  ('Ruim', 3, true),
  ('N.A.', 4, false)
) as v(label, ordem, exige_foto)
where co.nome = 'estado_4';
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00027` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00027_conjuntos_opcao_e_opcoes.test.sql
begin;

do $$
begin
  if (select count(*) from public.conjuntos_opcao where nome = 'estado_4') <> 1 then
    raise exception 'FALHOU: conjunto estado_4 deveria existir uma vez';
  end if;
  raise notice 'OK: conjunto estado_4 existe';
end $$;

do $$
declare
  v_count int;
  v_ruim_exige_foto boolean;
begin
  select count(*) into v_count from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome = 'estado_4';
  if v_count <> 4 then
    raise exception 'FALHOU: estado_4 deveria ter 4 opcoes, tem %', v_count;
  end if;

  select o.exige_foto into v_ruim_exige_foto from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome = 'estado_4' and o.label = 'Ruim';
  if v_ruim_exige_foto is not true then
    raise exception 'FALHOU: opcao Ruim deveria ter exige_foto = true';
  end if;

  raise notice 'OK: estado_4 tem 4 opcoes, Ruim exige foto';
end $$;

do $$
begin
  begin
    insert into public.opcoes (conjunto_id, label, ordem) values ('00000000-0000-0000-0000-000000000999', 'Teste', 1);
    raise exception 'FALHOU: opcao com conjunto_id inexistente deveria ser bloqueada pela FK';
  exception when foreign_key_violation then
    raise notice 'OK: FK de opcoes.conjunto_id bloqueia conjunto inexistente';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00027_conjuntos_opcao_e_opcoes.test.sql
```

Expected: three `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00027_conjuntos_opcao_e_opcoes.sql supabase/tests/00027_conjuntos_opcao_e_opcoes.test.sql
git commit -m "feat: add conjuntos_opcao/opcoes catalog for generic response options"
```

---

### Task 2: Generalizar o enum `item_template_tipo`

**Files:**
- Create: `supabase/migrations/00028_item_template_tipo_enum.sql`
- Test: `supabase/tests/00028_item_template_tipo_enum.test.sql`

**Interfaces:**
- Produces: `item_template_tipo` com os valores `'escolha'` (renomeado de `'padrao'`), `'texto'`, `'data'`, `'medicao'` (sem mudança). Task 3 é quem usa os 3 novos valores em DDL — não pode ser esta mesma migration/transação.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00028_item_template_tipo_enum.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 3. Generaliza item_template_tipo de 2 valores fixos (padrao/medicao)
-- pros 4 tipos estruturais que cobrem os ~30 rotulos de "Tipo de Resposta"
-- do checklist v7 (escolha/texto/data/medicao). 'padrao' vira 'escolha'
-- (mesmo significado -- agora tem opcoes configuraveis em vez de uma
-- classificacao fixa). Migration isolada de proposito: o Postgres nao
-- deixa usar um valor de enum recem-adicionado (ADD VALUE) na mesma
-- transacao em que foi adicionado; a Task 3 e quem usa 'escolha'/'texto'/
-- 'data' em constraints e colunas novas, numa transacao separada.

alter type public.item_template_tipo rename value 'padrao' to 'escolha';
alter type public.item_template_tipo add value 'texto';
alter type public.item_template_tipo add value 'data';
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00028` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00028_item_template_tipo_enum.test.sql
begin;

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'item_template_tipo' and e.enumlabel = 'escolha'
  ) then
    raise exception 'FALHOU: item_template_tipo deveria ter o valor escolha';
  end if;
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'item_template_tipo' and e.enumlabel = 'padrao'
  ) then
    raise exception 'FALHOU: item_template_tipo nao deveria mais ter o valor padrao';
  end if;
  raise notice 'OK: padrao renomeado para escolha';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'item_template_tipo' and e.enumlabel in ('texto', 'data');
  if v_count <> 2 then
    raise exception 'FALHOU: item_template_tipo deveria ter texto e data, achou %', v_count;
  end if;
  raise notice 'OK: texto e data adicionados';
end $$;

do $$
begin
  insert into public.checklist_group_templates (ordem, nome) values (997, 'Grupo Teste Enum');
  insert into public.checklist_item_templates (group_id, nome, tipo)
    select id, 'Item Escolha', 'escolha' from public.checklist_group_templates where nome = 'Grupo Teste Enum';
  raise notice 'OK: tipo escolha aceito em checklist_item_templates';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00028_item_template_tipo_enum.test.sql
```

Expected: three `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00028_item_template_tipo_enum.sql supabase/tests/00028_item_template_tipo_enum.test.sql
git commit -m "feat: generalize item_template_tipo enum (escolha/texto/data/medicao)"
```

---

### Task 3: Colunas genéricas em `checklist_item_templates` + backfill

**Files:**
- Create: `supabase/migrations/00029_item_template_colunas_genericas.sql`
- Test: `supabase/tests/00029_item_template_colunas_genericas.test.sql`

**Interfaces:**
- Consumes: `public.conjuntos_opcao` (Task 1).
- Produces: `checklist_item_templates.conjunto_opcao_id/unidade_medicao/faixa_min_ok/faixa_max_ok/limiar_critico_inferior/limiar_critico_superior`; `qtd_pontos_medicao_valido` agora aceita 1–5; `grupo_replicacao_so_padrao` agora referencia `tipo = 'escolha'`. Os 320 itens existentes ficam totalmente preenchidos (nenhum `escolha` sem `conjunto_opcao_id`, nenhum `medicao` sem faixas) — Task 4/6/7 dependem disso pra funcionar nos itens já seedados.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00029_item_template_colunas_genericas.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secoes 3 e 5. checklist_item_templates ganha as colunas que os 4 tipos
-- estruturais precisam (conjunto_opcao_id pra escolha, unidade_medicao +
-- faixas de referencia pra medicao). qtd_pontos_medicao afrouxa de 3-5 pra
-- 1-5 (itens novos como tensao do alternador sao valor unico). O CHECK de
-- grupo_replicacao (Fase 2.5) passa a referenciar 'escolha' em vez de
-- 'padrao'. Termina com o backfill dos 320 itens ja existentes, pra manter
-- o comportamento de hoje identico (tinta: mesmas faixas da migration
-- 00012; classificacao: mesmo conjunto Otimo/Medio/Ruim/N.A. de sempre).

alter table public.checklist_item_templates
  add column conjunto_opcao_id uuid references public.conjuntos_opcao(id),
  add column unidade_medicao text,
  add column faixa_min_ok numeric,
  add column faixa_max_ok numeric,
  add column limiar_critico_inferior numeric,
  add column limiar_critico_superior numeric;

alter table public.checklist_item_templates drop constraint qtd_pontos_medicao_valido;
alter table public.checklist_item_templates add constraint qtd_pontos_medicao_valido check (
  tipo <> 'medicao' or (qtd_pontos_medicao is not null and qtd_pontos_medicao between 1 and 5)
);

alter table public.checklist_item_templates drop constraint grupo_replicacao_so_padrao;
alter table public.checklist_item_templates add constraint grupo_replicacao_so_padrao
  check (grupo_replicacao is null or tipo = 'escolha');

-- Backfill: os itens tipo='escolha' (ex-'padrao') usam o conjunto default
-- estado_4 (Otimo/Medio/Ruim/N.A., criado na Task 1).
update public.checklist_item_templates
set conjunto_opcao_id = (select id from public.conjuntos_opcao where nome = 'estado_4')
where tipo = 'escolha';

-- Backfill: os itens tipo='medicao' (todos espessura de tinta hoje)
-- recebem as mesmas faixas hardcoded que a migration 00012 usava --
-- <70 ou 161-299 = atencao, >=300 = critico, resto = ok.
update public.checklist_item_templates
set unidade_medicao = 'µm',
    faixa_min_ok = 70,
    faixa_max_ok = 160,
    limiar_critico_superior = 300
where tipo = 'medicao';
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00029` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00029_item_template_colunas_genericas.test.sql
begin;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where tipo = 'escolha' and conjunto_opcao_id is null;
  if v_count <> 0 then
    raise exception 'FALHOU: % itens escolha sem conjunto_opcao_id', v_count;
  end if;
  raise notice 'OK: todo item escolha tem conjunto_opcao_id';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where tipo = 'medicao'
      and (unidade_medicao is distinct from 'µm' or faixa_min_ok <> 70 or faixa_max_ok <> 160 or limiar_critico_superior <> 300);
  if v_count <> 0 then
    raise exception 'FALHOU: % itens medicao sem as faixas esperadas de tinta', v_count;
  end if;
  raise notice 'OK: todo item medicao (tinta) tem as faixas da 00012 preservadas';
end $$;

do $$
begin
  insert into public.checklist_group_templates (ordem, nome) values (996, 'Grupo Teste Faixas');
  insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao)
    select id, 'Item Medicao 1pt', 'medicao', 1 from public.checklist_group_templates where nome = 'Grupo Teste Faixas';
  raise notice 'OK: qtd_pontos_medicao=1 aceito (afrouxado de 3-5 pra 1-5)';
end $$;

do $$
begin
  begin
    insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao, grupo_replicacao)
      select id, 'Item Medicao Grupo', 'medicao', 3, 'cluster-teste' from public.checklist_group_templates where nome = 'Grupo Teste Faixas';
    raise exception 'FALHOU: medicao com grupo_replicacao deveria ser bloqueado';
  exception when check_violation then
    raise notice 'OK: grupo_replicacao_so_padrao ainda bloqueia medicao (agora checando tipo=escolha)';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00029_item_template_colunas_genericas.test.sql
```

Expected: four `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00029_item_template_colunas_genericas.sql supabase/tests/00029_item_template_colunas_genericas.test.sql
git commit -m "feat: add configurable option-set and threshold columns to checklist_item_templates"
```

---

### Task 4: Generalizar medição (`paint_measurements` → `medicoes`)

**Files:**
- Create: `supabase/migrations/00030_medicoes_generalizado.sql`
- Test: `supabase/tests/00030_medicoes_generalizado.test.sql`

**Interfaces:**
- Consumes: `checklist_item_templates.faixa_min_ok/faixa_max_ok/limiar_critico_inferior/limiar_critico_superior` (Task 3).
- Produces: `public.medicoes(item_response_id, valores)` (renomeada de `paint_measurements`/`valores_um`); `public.medicao_resultado` enum (`ok`/`atencao`/`critico`); view `public.medicoes_resultado(item_response_id, resultado)`. Task 5's `checklist_item_status` view lê `medicoes`; Task 6's trigger lê `medicoes_resultado`; Task 7's `save_medicao` escreve em `medicoes`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00030_medicoes_generalizado.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 5. paint_measurements (so tinta, valores_um, resultado_calculado
-- hardcoded em 3 faixas fixas de micrometro) generaliza pra qualquer
-- unidade de medicao. ALTER TABLE/COLUMN RENAME carregam RLS, triggers e
-- indices automaticamente (Postgres resolve por OID/attnum, nao por nome) --
-- so as policies e a PK ganham nomes novos por clareza, nao porque
-- precisassem.
--
-- resultado_calculado deixa de ser gerado a partir de constantes fixas no
-- codigo e vira medicoes_resultado, uma view que le os limiares
-- configuraveis de checklist_item_templates (faixa_min_ok/faixa_max_ok/
-- limiar_critico_*, Task 3) -- view, nao coluna gerada, pelo mesmo motivo
-- de checklist_item_status (Task 5): precisa ler outra tabela.
--
-- Pra tinta, faixa_min_ok=70/faixa_max_ok=160/limiar_critico_superior=300
-- (setados no backfill da Task 3) reproduzem exatamente os thresholds
-- hardcoded da migration 00012 -- nenhuma mudanca de resultado pra itens
-- de tinta ja seedados.
--
-- save_paint_measurement referencia paint_measurements e paint_resultado no
-- corpo -- fica quebrada ate a Task 7 a substituir. Derrubada aqui de
-- proposito: falha limpa "function does not exist" em vez de um erro de
-- cast confuso se alguem chamar nesse meio-tempo.

drop function if exists public.save_paint_measurement(uuid, uuid, numeric[], text);

alter table public.paint_measurements rename to medicoes;
alter table public.medicoes rename constraint paint_measurements_pkey to medicoes_pkey;
alter table public.medicoes rename column valores_um to valores;
alter table public.medicoes alter column valores type numeric(8,2)[] using valores::numeric(8,2)[];
alter table public.medicoes drop column resultado_calculado;

drop type public.paint_resultado;

alter policy paint_measurements_select on public.medicoes rename to medicoes_select;
alter policy paint_measurements_insert on public.medicoes rename to medicoes_insert;
alter policy paint_measurements_update on public.medicoes rename to medicoes_update;

create type public.medicao_resultado as enum ('ok', 'atencao', 'critico');

create view public.medicoes_resultado as
select m.item_response_id,
  case
    when t.limiar_critico_superior is not null and public.array_max_numeric(m.valores) >= t.limiar_critico_superior then 'critico'
    when t.limiar_critico_inferior is not null and public.array_min_numeric(m.valores) <= t.limiar_critico_inferior then 'critico'
    when t.faixa_min_ok is not null and public.array_min_numeric(m.valores) < t.faixa_min_ok then 'atencao'
    when t.faixa_max_ok is not null and public.array_max_numeric(m.valores) > t.faixa_max_ok then 'atencao'
    when t.faixa_min_ok is null and t.faixa_max_ok is null
      and t.limiar_critico_inferior is null and t.limiar_critico_superior is null then null
    else 'ok'
  end::public.medicao_resultado as resultado
from public.medicoes m
join public.checklist_item_responses r on r.id = m.item_response_id
join public.checklist_item_templates t on t.id = r.item_template_id;
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00030` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00030_medicoes_generalizado.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 901, 'Grupo Teste Medicoes');
insert into public.checklist_item_templates
  (id, group_id, nome, tipo, qtd_pontos_medicao, unidade_medicao, faixa_min_ok, faixa_max_ok, limiar_critico_superior) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000020', 'Item OK', 'medicao', 3, 'µm', 70, 160, 300),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000020', 'Item Atencao', 'medicao', 3, 'µm', 70, 160, 300),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000020', 'Item Critico', 'medicao', 3, 'µm', 70, 160, 300);
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000020', 'Item Sem Faixa', 'medicao', 1);

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000043'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000044');

insert into public.medicoes (item_response_id, valores) values
  ('00000000-0000-0000-0000-000000000051', array[70.0, 160.0, 120.0]::numeric(8,2)[]),
  ('00000000-0000-0000-0000-000000000052', array[69.0, 110.0, 120.0]::numeric(8,2)[]),
  ('00000000-0000-0000-0000-000000000053', array[300.0, 110.0, 120.0]::numeric(8,2)[]),
  ('00000000-0000-0000-0000-000000000054', array[42.0]::numeric(8,2)[]);

do $$
declare v_resultado public.medicao_resultado;
begin
  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000051';
  if v_resultado <> 'ok' then
    raise exception 'FALHOU: fronteiras 70/160 deveriam dar ok (deu %)', v_resultado;
  end if;
  raise notice 'OK: valores dentro da faixa (fronteiras inclusive) calculam ok';
end $$;

do $$
declare v_resultado public.medicao_resultado;
begin
  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000052';
  if v_resultado <> 'atencao' then
    raise exception 'FALHOU: ponto abaixo de 70 deveria dar atencao (deu %)', v_resultado;
  end if;
  raise notice 'OK: ponto abaixo da faixa calcula atencao';
end $$;

do $$
declare v_resultado public.medicao_resultado;
begin
  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000053';
  if v_resultado <> 'critico' then
    raise exception 'FALHOU: ponto >=300 deveria dar critico (deu %)', v_resultado;
  end if;
  raise notice 'OK: ponto acima do limiar critico calcula critico (pior caso vence)';
end $$;

do $$
declare v_resultado public.medicao_resultado;
begin
  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000054';
  if v_resultado is not null then
    raise exception 'FALHOU: item sem faixa configurada deveria dar resultado null (deu %)', v_resultado;
  end if;
  raise notice 'OK: item de medicao sem faixa configurada nao calcula resultado (valor bruto)';
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'medicoes' and policyname = 'medicoes_select') then
    raise exception 'FALHOU: policy medicoes_select deveria existir apos o rename';
  end if;
  raise notice 'OK: RLS sobrevive ao rename da tabela';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00030_medicoes_generalizado.test.sql
```

Expected: five `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00030_medicoes_generalizado.sql supabase/tests/00030_medicoes_generalizado.test.sql
git commit -m "feat: generalize paint-only measurement into configurable medicoes"
```

---

### Task 5: Generalizar `checklist_item_responses` + view de status

**Files:**
- Create: `supabase/migrations/00031_checklist_responses_generico.sql`
- Test: `supabase/tests/00031_checklist_responses_generico.test.sql`

**Interfaces:**
- Consumes: `public.opcoes` (Task 1), `public.medicoes` (Task 4).
- Produces: `checklist_item_responses.opcao_id/resposta_texto/resposta_data` (substituem `classificacao`); view `public.checklist_item_status(response_id, inspection_id, item_template_id, respondido)`. Task 6 (RF-16) e Task 8 (`apply_opcoes_batch`) escrevem em `opcao_id`; a Peça 1b lê `checklist_item_status` no lugar da antiga coluna `status`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00031_checklist_responses_generico.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 4. classificacao (coluna fixa, um unico enum universal) vira 3
-- colunas especificas por tipo -- so uma delas e preenchida, conforme o
-- tipo do item (validado na camada de app, Peca 1b, nao aqui). status
-- deixa de ser coluna gerada (dependia so de classificacao, mesma linha) e
-- vira view, porque "respondido" agora depende do tipo do item, que mora
-- noutra tabela -- generated columns do Postgres nao leem outra tabela.
--
-- So ha respostas de teste no banco nesta data (confirmado com o usuario,
-- autorizado a apagar) -- limpa antes de trocar o formato da coluna, em
-- vez de escrever codigo de conversao pra dado que ninguem usa.
--
-- apply_classificacao_batch (migration 00026) referencia classificacao e
-- item_classificacao no corpo -- fica quebrada ate a Task 8 a substituir.
-- Derrubada aqui de proposito, mesmo motivo do save_paint_measurement na
-- Task 4.

delete from public.checklist_item_responses;

drop function if exists public.apply_classificacao_batch(uuid, jsonb);

alter table public.checklist_item_responses
  drop column classificacao,
  add column opcao_id uuid references public.opcoes(id),
  add column resposta_texto text,
  add column resposta_data date;

drop type public.item_classificacao;

create view public.checklist_item_status as
select r.id as response_id, r.inspection_id, r.item_template_id,
  case
    when t.tipo = 'medicao' then exists (select 1 from public.medicoes m where m.item_response_id = r.id)
    else r.opcao_id is not null or r.resposta_texto is not null or r.resposta_data is not null
  end as respondido
from public.checklist_item_responses r
join public.checklist_item_templates t on t.id = r.item_template_id;
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00031` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00031_checklist_responses_generico.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 900, 'Grupo Teste Status');
insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000020', 'Item Escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'));
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000020', 'Item Texto', 'texto'),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000020', 'Item Data', 'data');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000020', 'Item Medicao', 'medicao', 1);

-- update explicito de tipo pro item 41 -- o insert acima usa o tipo default
-- da coluna (escolha e o default hoje, ver migration 00002); deixa
-- explicito aqui pra clareza do teste.
update public.checklist_item_templates set tipo = 'escolha' where id = '00000000-0000-0000-0000-000000000041';

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000043'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000044');

do $$
declare v_respondido boolean;
begin
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000051';
  if v_respondido is not false then
    raise exception 'FALHOU: item escolha sem opcao_id deveria ser pendente (respondido=false)';
  end if;
  raise notice 'OK: item escolha sem resposta ainda e pendente';
end $$;

do $$
declare v_respondido boolean;
begin
  update public.checklist_item_responses
    set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Médio')
    where id = '00000000-0000-0000-0000-000000000051';
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000051';
  if v_respondido is not true then
    raise exception 'FALHOU: item escolha com opcao_id deveria ser respondido';
  end if;
  raise notice 'OK: item escolha com opcao_id preenchido fica respondido';
end $$;

do $$
declare v_respondido boolean;
begin
  update public.checklist_item_responses set resposta_texto = 'ABC123' where id = '00000000-0000-0000-0000-000000000052';
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000052';
  if v_respondido is not true then
    raise exception 'FALHOU: item texto com resposta_texto deveria ser respondido';
  end if;
  raise notice 'OK: item texto com resposta_texto preenchido fica respondido';
end $$;

do $$
declare v_respondido boolean;
begin
  update public.checklist_item_responses set resposta_data = '2026-01-01' where id = '00000000-0000-0000-0000-000000000053';
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000053';
  if v_respondido is not true then
    raise exception 'FALHOU: item data com resposta_data deveria ser respondido';
  end if;
  raise notice 'OK: item data com resposta_data preenchida fica respondido';
end $$;

do $$
declare v_respondido boolean;
begin
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000054';
  if v_respondido is not false then
    raise exception 'FALHOU: item medicao sem linha em medicoes deveria ser pendente';
  end if;
  insert into public.medicoes (item_response_id, valores) values ('00000000-0000-0000-0000-000000000054', array[10.0]::numeric(8,2)[]);
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000054';
  if v_respondido is not true then
    raise exception 'FALHOU: item medicao com linha em medicoes deveria ser respondido';
  end if;
  raise notice 'OK: item medicao usa a existencia da linha em medicoes pra respondido';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00031_checklist_responses_generico.test.sql
```

Expected: five `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00031_checklist_responses_generico.sql supabase/tests/00031_checklist_responses_generico.test.sql
git commit -m "feat: generalize checklist_item_responses into per-type columns + status view"
```

---

### Task 6: Generalizar o gatilho RF-16 (foto obrigatória)

**Files:**
- Modify: replaces the function/triggers from `supabase/migrations/00013_ruim_requires_photo.sql`
- Create: `supabase/migrations/00032_rf16_generico.sql`
- Test: `supabase/tests/00032_rf16_generico.test.sql`

**Interfaces:**
- Consumes: `opcoes.exige_foto` (Task 1), `checklist_item_responses.opcao_id` (Task 5), `medicoes_resultado.resultado` (Task 4).
- Produces: função `public.check_exige_foto()` e as constraint triggers `checklist_item_responses_exige_foto`, `photos_exige_foto`, `medicoes_exige_foto` — qualquer camada de app (Peça 1b) que grave `opcao_id` ou `medicoes.valores` passa a respeitar esta regra automaticamente, sem precisar checar nada explicitamente no código.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00032_rf16_generico.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 6. RF-16 checava classificacao = 'ruim', uma string fixa. Generaliza
-- pra checar duas fontes: resposta tipo escolha cuja opcao tem
-- exige_foto=true, OU resposta tipo medicao cujo resultado calculado
-- (medicoes_resultado, Task 4) e 'critico'. O branch que resolve
-- v_response_id a partir de item_response_id (usado por photos e agora
-- tambem por medicoes) ja era generico o bastante -- nao muda.

drop trigger checklist_item_responses_ruim_requires_photo on public.checklist_item_responses;
drop trigger photos_ruim_requires_photo on public.photos;
drop function public.check_ruim_requires_photo();

create function public.check_exige_foto() returns trigger
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_response_id uuid;
  v_exige_foto boolean;
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

  select coalesce(o.exige_foto, false) or coalesce(mr.resultado = 'critico', false)
  into v_exige_foto
  from public.checklist_item_responses r
  left join public.opcoes o on o.id = r.opcao_id
  left join public.medicoes_resultado mr on mr.item_response_id = r.id
  where r.id = v_response_id;

  if v_exige_foto then
    select count(*) into v_photo_count
    from public.photos
    where item_response_id = v_response_id and contexto = 'item';

    if v_photo_count = 0 then
      raise exception 'RF-16: esta resposta exige pelo menos 1 foto (item %)', v_response_id
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create constraint trigger checklist_item_responses_exige_foto
  after insert or update of opcao_id on public.checklist_item_responses
  deferrable initially deferred
  for each row execute function public.check_exige_foto();

create constraint trigger photos_exige_foto
  after delete on public.photos
  deferrable initially deferred
  for each row execute function public.check_exige_foto();

create constraint trigger medicoes_exige_foto
  after insert or update of valores on public.medicoes
  deferrable initially deferred
  for each row execute function public.check_exige_foto();
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00032` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00032_rf16_generico.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 903, 'Grupo Teste RF16');
insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id)
  values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item Escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'));
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao, faixa_min_ok, faixa_max_ok, limiar_critico_superior)
  values ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item Medicao', 'medicao', 1, 70, 160, 300);

-- Uma linha de resposta por cenario -- evita depender de como o savepoint
-- implicito de um bloco "exception" reverte (ou nao) um UPDATE anterior
-- feito na mesma linha; mesma cautela do teste original da migration 00013.
insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022'),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022');

-- Cenarios A e C preparam os dois casos "felizes" (opcao Ruim + foto;
-- medicao critica + foto) ENQUANTO AINDA EM MODO DEFERRED -- forcar
-- immediate faz o Postgres ficar em modo immediate pro resto da transacao
-- (mesmo comportamento da migration 00013), entao os dois setups multi-
-- statement precisam terminar antes do primeiro "set constraints all
-- immediate"; senao o segundo setup dispararia o check no meio do caminho
-- (ex: so o insert em medicoes, antes da foto) e falharia por engano.

-- Cenario A (mesmo padrao da migration 00013): marcar Ruim e anexar a foto
-- na mesma transacao, ainda deferred.
update public.checklist_item_responses
  set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Ruim')
  where id = '00000000-0000-0000-0000-000000000060';
insert into public.photos (inspection_id, item_response_id, contexto, url)
  values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000060', 'item', 'https://example.com/foto.jpg');

-- Cenario C: medicao com resultado critico e foto anexada, ainda deferred.
insert into public.medicoes (item_response_id, valores) values ('00000000-0000-0000-0000-000000000062', array[300.0]::numeric(8,2)[]);
insert into public.photos (inspection_id, item_response_id, contexto, url)
  values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000062', 'item', 'https://example.com/foto-medicao.jpg');

do $$
begin
  execute 'set constraints all immediate';
  raise notice 'OK: opcao Ruim com foto e medicao critica com foto (ambas na mesma transacao) passam';
exception when check_violation then
  raise exception 'FALHOU: nenhum dos dois casos com foto deveria ter bloqueado';
end $$;

-- A partir daqui a sessao esta em modo IMMEDIATE pro resto da transacao.

-- Cenario B: marcar Ruim (linha separada) sem nenhuma foto deve bloquear.
do $$
begin
  begin
    update public.checklist_item_responses
      set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Ruim')
      where id = '00000000-0000-0000-0000-000000000061';
    raise exception 'FALHOU: opcao Ruim sem foto deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: opcao com exige_foto=true sem foto bloqueado';
  end;
end $$;

-- Cenario D: medicao com resultado critico (linha separada) sem foto deve bloquear.
do $$
begin
  begin
    insert into public.medicoes (item_response_id, valores) values ('00000000-0000-0000-0000-000000000063', array[300.0]::numeric(8,2)[]);
    raise exception 'FALHOU: medicao critica sem foto deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: medicao com resultado critico sem foto bloqueada';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00032_rf16_generico.test.sql
```

Expected: three `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00032_rf16_generico.sql supabase/tests/00032_rf16_generico.test.sql
git commit -m "feat: generalize RF-16 mandatory-photo trigger beyond classificacao='ruim'"
```

---

### Task 7: RPC `save_medicao`

**Files:**
- Create: `supabase/migrations/00033_save_medicao_rpc.sql`
- Test: `supabase/tests/00033_save_medicao_rpc.test.sql`

**Interfaces:**
- Consumes: `public.medicoes`, `public.medicoes_resultado` (Task 4).
- Produces: `public.save_medicao(p_inspection_id uuid, p_item_template_id uuid, p_valores numeric[], p_observacao text default null) returns table (item_response_id uuid, resultado public.medicao_resultado)` — a Peça 1b chama esta RPC no lugar de `save_paint_measurement`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00033_save_medicao_rpc.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 7. Generaliza save_paint_measurement (derrubada na Task 4). Remove
-- o "truque" que escrevia uma classificacao derivada so pra reaproveitar
-- status/RF-16 -- nao e mais necessario, porque status
-- (checklist_item_status, Task 5) e RF-16 (check_exige_foto, Task 6) agora
-- leem medicoes_resultado diretamente.

create function public.save_medicao(
  p_inspection_id uuid,
  p_item_template_id uuid,
  p_valores numeric[],
  p_observacao text default null
) returns table (item_response_id uuid, resultado public.medicao_resultado)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_response_id uuid;
begin
  insert into public.checklist_item_responses (inspection_id, item_template_id, observacao)
  values (p_inspection_id, p_item_template_id, p_observacao)
  on conflict (inspection_id, item_template_id) do update set observacao = p_observacao, atualizado_em = now()
  returning id into v_response_id;

  insert into public.medicoes (item_response_id, valores)
  values (v_response_id, p_valores::numeric(8,2)[])
  on conflict (item_response_id) do update set valores = excluded.valores;

  return query
    select v_response_id, mr.resultado from public.medicoes_resultado mr where mr.item_response_id = v_response_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00033` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00033_save_medicao_rpc.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 904, 'Grupo Teste Save Medicao');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao, faixa_min_ok, faixa_max_ok, limiar_critico_superior)
  values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item Tinta', 'medicao', 3, 70, 160, 300);

do $$
declare v_response_id uuid; v_resultado public.medicao_resultado;
begin
  select item_response_id, resultado into v_response_id, v_resultado
  from public.save_medicao('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021', array[100.0, 110.0, 120.0], 'observação inicial');

  if v_resultado <> 'ok' then
    raise exception 'FALHOU: valores dentro da faixa deveriam dar ok (deu %)', v_resultado;
  end if;

  if not exists (select 1 from public.checklist_item_responses where id = v_response_id and observacao = 'observação inicial') then
    raise exception 'FALHOU: observacao deveria ter sido gravada';
  end if;

  raise notice 'OK: save_medicao cria response + medicao e retorna resultado ok';
end $$;

do $$
declare v_response_id uuid; v_resultado public.medicao_resultado; v_count int;
begin
  select item_response_id, resultado into v_response_id, v_resultado
  from public.save_medicao('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021', array[300.0, 110.0, 120.0], 'observação atualizada');

  select count(*) into v_count from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010' and item_template_id = '00000000-0000-0000-0000-000000000021';
  if v_count <> 1 then
    raise exception 'FALHOU: chamar save_medicao de novo deveria fazer upsert (achou % linhas)', v_count;
  end if;

  if v_resultado <> 'critico' then
    raise exception 'FALHOU: valor >=300 deveria dar critico (deu %)', v_resultado;
  end if;

  raise notice 'OK: save_medicao faz upsert idempotente e recalcula o resultado';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00033_save_medicao_rpc.test.sql
```

Expected: two `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00033_save_medicao_rpc.sql supabase/tests/00033_save_medicao_rpc.test.sql
git commit -m "feat: add generalized save_medicao RPC"
```

---

### Task 8: RPC `apply_opcoes_batch`

**Files:**
- Create: `supabase/migrations/00034_apply_opcoes_batch.sql`
- Test: `supabase/tests/00034_apply_opcoes_batch.test.sql`

**Interfaces:**
- Consumes: `checklist_item_responses.opcao_id` (Task 5), `check_exige_foto` trigger (Task 6).
- Produces: `public.apply_opcoes_batch(p_inspection_id uuid, p_items jsonb) returns void` — substitui `apply_classificacao_batch` (derrubada na Task 5); espera `p_items` como array de `{item_template_id, opcao_id, observacao}`. A Peça 1b atualiza `applyClassificacaoBatchAction` pra chamar esta RPC.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00034_apply_opcoes_batch.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 7. Generaliza apply_classificacao_batch (derrubada na Task 5) --
-- mesma logica de lote atomico da Fase 2.5 (migration 00026), so troca o
-- valor replicado de classificacao (string fixa) por opcao_id (FK). Se um
-- item do lote falhar (RF-16 via check_exige_foto, Task 6), o lote inteiro
-- nao e salvo -- mesmo comportamento de sempre.

create function public.apply_opcoes_batch(
  p_inspection_id uuid,
  p_items jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.checklist_item_responses (inspection_id, item_template_id, opcao_id, observacao)
    values (
      p_inspection_id,
      (v_item->>'item_template_id')::uuid,
      (v_item->>'opcao_id')::uuid,
      v_item->>'observacao'
    )
    on conflict (inspection_id, item_template_id) do update
      set opcao_id = excluded.opcao_id,
          observacao = excluded.observacao,
          atualizado_em = now();
  end loop;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00034` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00034_apply_opcoes_batch.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 905, 'Grupo Teste Batch');
insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id, grupo_replicacao) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item A', 'escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'), 'cluster-teste'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item B', 'escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'), 'cluster-teste');

do $$
declare
  v_medio_id uuid;
  v_count int;
begin
  select o.id into v_medio_id from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome = 'estado_4' and o.label = 'Médio';

  perform public.apply_opcoes_batch(
    '00000000-0000-0000-0000-000000000010',
    jsonb_build_array(
      jsonb_build_object('item_template_id', '00000000-0000-0000-0000-000000000021', 'opcao_id', v_medio_id, 'observacao', 'obs A'),
      jsonb_build_object('item_template_id', '00000000-0000-0000-0000-000000000022', 'opcao_id', v_medio_id, 'observacao', 'obs B')
    )
  );

  select count(*) into v_count from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010' and opcao_id = v_medio_id;
  if v_count <> 2 then
    raise exception 'FALHOU: lote deveria ter gravado 2 respostas com opcao_id (achou %)', v_count;
  end if;
  raise notice 'OK: lote grava multiplas respostas com opcao_id numa chamada so';
end $$;

do $$
declare
  v_ruim_id uuid;
begin
  select o.id into v_ruim_id from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome = 'estado_4' and o.label = 'Ruim';

  begin
    perform public.apply_opcoes_batch(
      '00000000-0000-0000-0000-000000000010',
      jsonb_build_array(
        jsonb_build_object('item_template_id', '00000000-0000-0000-0000-000000000021', 'opcao_id', v_ruim_id, 'observacao', null)
      )
    );
    execute 'set constraints all immediate';
    raise exception 'FALHOU: lote com opcao Ruim sem foto deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: lote com opcao que exige foto sem foto e bloqueado pelo RF-16 (check_exige_foto)';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00034_apply_opcoes_batch.test.sql
```

Expected: two `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00034_apply_opcoes_batch.sql supabase/tests/00034_apply_opcoes_batch.test.sql
git commit -m "feat: add generalized apply_opcoes_batch RPC"
```

---

## Ao final desta 1a

O schema está totalmente generalizado e os 320 itens existentes preservam o comportamento de hoje (mesmas faixas de tinta, mesma classificação Ótimo/Médio/Ruim/N.A.). **O front-end fica quebrado** (`actions.ts`, os forms, as queries de página ainda referenciam `classificacao`, `paint_measurements`, `save_paint_measurement`, `apply_classificacao_batch` — todos removidos). Isso é esperado: a Peça 1b (próximo plano, próprio ciclo `brainstorming → writing-plans → subagent-driven-development`) adapta o front-end pra ler/escrever o schema novo, mantendo a mesma UI/UX de hoje (sem redesign — isso é Peça 3).
