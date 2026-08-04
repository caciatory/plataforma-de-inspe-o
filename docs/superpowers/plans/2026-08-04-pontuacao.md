# Fase 4 — Pontuação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular nota por grupo, nota geral do veículo e classificação A/B/C (RF-38 a RF-42), generalizado pro schema atual de `conjuntos_opcao`/`opcoes` — sem tela nova, só migrations SQL + testes.

**Architecture:** 1 coluna nova (`opcoes.is_na`) + 3 views (`checklist_item_score`, `checklist_group_score`, `inspection_score`), todas `security_invoker`, seguindo exatamente o padrão já usado em `checklist_item_status`/`medicoes_resultado` (`supabase/migrations/00031_checklist_responses_generico.sql`, `00030_medicoes_generalizado.sql`).

**Tech Stack:** PostgreSQL (Supabase), migrations SQL puras, testes SQL no padrão `begin; ... do $$ ... raise exception ...; rollback;` já usado em `supabase/tests/`.

## Global Constraints

- Escala de pontos: 10 (melhor) a 2 (pior). Fórmula por posição dentro do conjunto (ignorando `is_na`): opção de posição *i* entre N opções válidas recebe `10 - (i-1) × 8/(N-1)`; N=1 recebe 10.
- Medição usa a mesma escala, mapeando `medicoes_resultado.resultado`: `ok`→10, `atencao`→6, `critico`→2.
- Texto e data nunca pontuam (`pontos` sempre `null`).
- N.A. (`opcoes.is_na = true`) e itens sem resposta ficam fora da média do grupo.
- Cortes: nota geral ≥ 8 → `'A'`; ≥ 5 → `'B'`; abaixo de 5 → `'C'`.
- Toda view nasce com `security_invoker = true` (via `alter view ... set` logo após o `create view`, na mesma migration — nunca num passo separado depois, é assim que esse bug de RLS já vazou duas vezes neste projeto).
- Sem tela nova, sem RPC, sem tabela de configuração — só migrations + testes SQL.
- **Aplicação manual:** este ambiente não tem acesso autenticado ao Supabase CLI. Cada task termina com um passo em que você (humano) roda a migration e o teste manualmente (via `supabase db push` local ou colando no SQL Editor do painel) e reporta o resultado antes da task ser considerada concluída.

---

### Task 1: Coluna `opcoes.is_na`

**Files:**
- Create: `supabase/migrations/00041_opcoes_is_na.sql`
- Create: `supabase/tests/00041_opcoes_is_na.test.sql`

**Interfaces:**
- Produces: `public.opcoes.is_na boolean not null default false` — usada pela Task 2 pra excluir opções N.A. da fórmula de pontuação.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/00041_opcoes_is_na.sql`:

```sql
-- supabase/migrations/00041_opcoes_is_na.sql
-- Fase 4 (pontuação): docs/superpowers/specs/2026-08-04-pontuacao-design.md secao 3.
-- "Esta opcao e N.A." hoje so existe como inferencia por regex no cliente
-- (NA_LABEL_RE em lib/checklist/siblings.ts, usado por
-- resolveEscolhaColorModifier pra nao colorir N.A. como ruim). A
-- pontuacao (Task 2) precisa saber isso no banco pra excluir a opcao da
-- formula por posicao -- em vez de duplicar o mesmo regex em SQL, este
-- campo estruturado vira a fonte unica de verdade. O backfill abaixo usa
-- o MESMO padrao do regex do cliente, pra classificar exatamente as
-- mesmas opcoes que o cliente ja trata como N.A. hoje.

alter table public.opcoes add column is_na boolean not null default false;

update public.opcoes set is_na = true
where label ~* '^n\.?a\.?(\s|\(|$)';
```

- [ ] **Step 2: Escrever o teste**

`supabase/tests/00041_opcoes_is_na.test.sql`:

```sql
begin;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.opcoes where is_na = true;
  if v_count <> 6 then
    raise exception 'FALHOU: esperava 6 opcoes N.A. no seed real (deu %)', v_count;
  end if;
  raise notice 'OK: 6 opcoes N.A. identificadas no backfill';
end $$;

do $$
declare v_is_na boolean;
begin
  select is_na into v_is_na from public.opcoes
  where conjunto_id = (select id from public.conjuntos_opcao where nome = 'nivel_saturacao') and label = 'N.A. (gasolina)';
  if v_is_na is not true then
    raise exception 'FALHOU: "N.A. (gasolina)" deveria ser is_na=true (mesmo padrao do NA_LABEL_RE do cliente)';
  end if;
  raise notice 'OK: variante "N.A. (gasolina)" tambem classificada, nao so "N.A." exato';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.opcoes where is_na = true and label !~* '^n\.?a\.?(\s|\(|$)';
  if v_count <> 0 then
    raise exception 'FALHOU: ha opcao marcada is_na=true cujo rotulo nao bate com o padrao N.A.';
  end if;
  raise notice 'OK: nenhum falso positivo no backfill';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.opcoes
  where is_na = true and label ilike '%funciona%' and label not ilike 'n.a%';
  if v_count <> 0 then
    raise exception 'FALHOU: rotulos como "Nao Funciona" nao deveriam ser marcados N.A. (falso positivo do regex)';
  end if;
  raise notice 'OK: "Nao Funciona" nao e confundido com N.A.';
end $$;

rollback;
```

- [ ] **Step 3: Aplicar e testar manualmente**

Peça pro usuário rodar (via `supabase db push` ou colando no SQL Editor do painel Supabase):

1. O conteúdo de `supabase/migrations/00041_opcoes_is_na.sql`.
2. O conteúdo de `supabase/tests/00041_opcoes_is_na.test.sql`.

Espere o usuário reportar os 4 `raise notice 'OK: ...'` (ou qualquer `FALHOU`). Não prossiga pro Step 4 sem essa confirmação.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00041_opcoes_is_na.sql supabase/tests/00041_opcoes_is_na.test.sql
git commit -m "feat: add opcoes.is_na, backfilled from the same N.A. pattern the client already uses"
```

---

### Task 2: View `checklist_item_score`

**Files:**
- Create: `supabase/migrations/00042_checklist_item_score.sql`
- Create: `supabase/tests/00042_checklist_item_score.test.sql`

**Interfaces:**
- Consumes: `public.opcoes.is_na` (Task 1).
- Produces: `public.checklist_item_score(item_response_id uuid, item_template_id uuid, inspection_id uuid, pontos numeric)` — usada pela Task 3 pra agregar por grupo.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/00042_checklist_item_score.sql`:

```sql
-- supabase/migrations/00042_checklist_item_score.sql
-- Fase 4 (pontuacao): docs/superpowers/specs/2026-08-04-pontuacao-design.md secao 4.
-- Pontos por resposta individual. Formula por posicao dentro do conjunto
-- (CTE opcoes_pontos, ignora opcoes is_na=true na contagem e no ranking):
-- opcao na posicao i entre N opcoes validas recebe 10 - (i-1) * 8/(N-1);
-- N=1 recebe 10. Reproduz exatamente o RF-38 original (10/6/2) pra
-- conjuntos de 3 opcoes. Medicao reusa medicoes_resultado (ja calculado,
-- Peca 1a) na mesma escala. Texto/data ficam null (nunca pontuam) --
-- naturalmente, ja que opcao_id e sempre null pra esses tipos, entao o
-- left join em opcoes_pontos nunca casa.
create view public.checklist_item_score as
with opcoes_ranked as (
  select o.id as opcao_id, o.conjunto_id,
    row_number() over (partition by o.conjunto_id order by o.ordem) as pos,
    count(*) over (partition by o.conjunto_id) as total
  from public.opcoes o
  where o.is_na = false
),
opcoes_pontos as (
  select opcao_id,
    case when total = 1 then 10::numeric else 10 - (pos - 1) * 8.0 / (total - 1) end as pontos
  from opcoes_ranked
)
select
  r.id as item_response_id,
  r.item_template_id,
  r.inspection_id,
  case
    when t.tipo = 'escolha' then op.pontos
    when t.tipo = 'medicao' then
      case mr.resultado
        when 'ok' then 10
        when 'atencao' then 6
        when 'critico' then 2
        else null
      end
    else null
  end::numeric as pontos
from public.checklist_item_responses r
join public.checklist_item_templates t on t.id = r.item_template_id
left join opcoes_pontos op on op.opcao_id = r.opcao_id
left join public.medicoes_resultado mr on mr.item_response_id = r.id;

alter view public.checklist_item_score set (security_invoker = true);
```

- [ ] **Step 2: Escrever o teste**

`supabase/tests/00042_checklist_item_score.test.sql`:

```sql
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');
insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 902, 'Grupo Teste Pontuacao');

-- Conjunto de 2 opcoes (funciona_2-like): 10/2
insert into public.conjuntos_opcao (id, nome) values ('00000000-0000-0000-0000-000000000030', 'teste_2op');
insert into public.opcoes (id, conjunto_id, label, ordem, exige_foto, is_na) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000030', 'Funciona', 1, false, false),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000030', 'Nao Funciona', 2, true, false);

-- Conjunto de 3 opcoes + N.A. (estado_3_na-like): 10/6/2, N.A. fora da formula
insert into public.conjuntos_opcao (id, nome) values ('00000000-0000-0000-0000-000000000033', 'teste_3op_na');
insert into public.opcoes (id, conjunto_id, label, ordem, exige_foto, is_na) values
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000033', 'Bom', 1, false, false),
  ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000033', 'Medio', 2, false, false),
  ('00000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000033', 'Mau', 3, true, false),
  ('00000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000000033', 'N.A.', 4, false, true);

-- Conjunto de 5 opcoes: 10/8/6/4/2
insert into public.conjuntos_opcao (id, nome) values ('00000000-0000-0000-0000-000000000038', 'teste_5op');
insert into public.opcoes (id, conjunto_id, label, ordem, exige_foto, is_na) values
  ('00000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000000038', 'Nivel 1', 1, false, false),
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000038', 'Nivel 2', 2, false, false),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000038', 'Nivel 3', 3, false, false),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000038', 'Nivel 4', 4, false, false),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000038', 'Nivel 5', 5, false, false);

insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id) values
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000020', 'Item 2op', 'escolha', '00000000-0000-0000-0000-000000000030'),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000020', 'Item 3op meio', 'escolha', '00000000-0000-0000-0000-000000000033'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000020', 'Item 3op NA', 'escolha', '00000000-0000-0000-0000-000000000033'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000020', 'Item 5op pos3', 'escolha', '00000000-0000-0000-0000-000000000038'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000020', 'Item Texto', 'texto', null),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000020', 'Item Data', 'data', null),
  ('00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000020', 'Item Medicao', 'medicao', null);
update public.checklist_item_templates set qtd_pontos_medicao = 3, unidade_medicao = 'µm',
  faixa_min_ok = 70, faixa_max_ok = 160, limiar_critico_superior = 300
  where id = '00000000-0000-0000-0000-000000000056';

insert into public.checklist_item_responses (id, inspection_id, item_template_id, opcao_id, resposta_texto, resposta_data) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000031', null, null),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000035', null, null),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000037', null, null),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000041', null, null),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000054', null, 'algum texto', null),
  ('00000000-0000-0000-0000-000000000065', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000055', null, null, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000066', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000056', null, null, null);

insert into public.medicoes (item_response_id, valores) values
  ('00000000-0000-0000-0000-000000000066', array[100.0, 110.0, 120.0]::numeric(8,2)[]);

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000060';
  if v_pontos <> 10 then raise exception 'FALHOU: opcao 1a de 2 deveria dar 10 (deu %)', v_pontos; end if;
  raise notice 'OK: conjunto de 2 opcoes, posicao 1 = 10';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000061';
  if v_pontos <> 6 then raise exception 'FALHOU: opcao do meio de 3 deveria dar 6 (deu %)', v_pontos; end if;
  raise notice 'OK: conjunto de 3 opcoes (com N.A. no catalogo), posicao do meio = 6 -- reproduz RF-38';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000062';
  if v_pontos is not null then raise exception 'FALHOU: opcao N.A. deveria dar pontos null (deu %)', v_pontos; end if;
  raise notice 'OK: opcao is_na=true nunca pontua';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000063';
  if v_pontos <> 6 then raise exception 'FALHOU: posicao 3 de 5 deveria dar 6 (deu %)', v_pontos; end if;
  raise notice 'OK: conjunto de 5 opcoes, posicao 3 (meio) = 6';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000064';
  if v_pontos is not null then raise exception 'FALHOU: item texto respondido deveria dar pontos null (deu %)', v_pontos; end if;
  raise notice 'OK: item texto nunca pontua, mesmo respondido';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000065';
  if v_pontos is not null then raise exception 'FALHOU: item data respondido deveria dar pontos null (deu %)', v_pontos; end if;
  raise notice 'OK: item data nunca pontua, mesmo respondido';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000066';
  if v_pontos <> 10 then raise exception 'FALHOU: medicao dentro da faixa (ok) deveria dar 10 (deu %)', v_pontos; end if;
  raise notice 'OK: medicao com resultado ok mapeia pra 10, mesma escala';
end $$;

rollback;
```

- [ ] **Step 3: Aplicar e testar manualmente**

Peça pro usuário rodar `supabase/migrations/00042_checklist_item_score.sql` e depois `supabase/tests/00042_checklist_item_score.test.sql`. Não prossiga sem os 7 `OK` confirmados (ou o `FALHOU` reportado, pra corrigir antes de continuar).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00042_checklist_item_score.sql supabase/tests/00042_checklist_item_score.test.sql
git commit -m "feat: add checklist_item_score view (position-based points, per RF-38 generalized)"
```

---

### Task 3: Views `checklist_group_score` e `inspection_score`

**Files:**
- Create: `supabase/migrations/00043_group_inspection_score.sql`
- Create: `supabase/tests/00043_group_inspection_score.test.sql`

**Interfaces:**
- Consumes: `public.checklist_item_score` (Task 2).
- Produces: `public.checklist_group_score(inspection_id uuid, group_id uuid, nota numeric, itens_avaliados bigint)`, `public.inspection_score(inspection_id uuid, nota_geral numeric, classificacao text)`.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/00043_group_inspection_score.sql`:

```sql
-- supabase/migrations/00043_group_inspection_score.sql
-- Fase 4 (pontuacao): docs/superpowers/specs/2026-08-04-pontuacao-design.md secoes 4/5.
-- checklist_group_score agrega checklist_item_score por (inspection_id,
-- group_id) -- so entra quem tem pelo menos uma resposta na tabela (RF-39:
-- media dos itens avaliados). inspection_score agrega checklist_group_score
-- por inspection_id, filtrando grupos com itens_avaliados > 0 antes de
-- tirar a media geral (RF-40/41), e classifica A/B/C pelos cortes fixos
-- (RF-42): >=8 'A', >=5 'B', senao 'C'.
create view public.checklist_group_score as
select
  r.inspection_id,
  t.group_id,
  avg(s.pontos) as nota,
  count(s.pontos) as itens_avaliados
from public.checklist_item_responses r
join public.checklist_item_templates t on t.id = r.item_template_id
join public.checklist_item_score s on s.item_response_id = r.id
group by r.inspection_id, t.group_id;

alter view public.checklist_group_score set (security_invoker = true);

create view public.inspection_score as
select
  inspection_id,
  avg(nota) as nota_geral,
  case
    when avg(nota) >= 8 then 'A'
    when avg(nota) >= 5 then 'B'
    else 'C'
  end as classificacao
from public.checklist_group_score
where itens_avaliados > 0
group by inspection_id;

alter view public.inspection_score set (security_invoker = true);
```

- [ ] **Step 2: Escrever o teste**

`supabase/tests/00043_group_inspection_score.test.sql`:

```sql
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');

insert into public.conjuntos_opcao (id, nome) values ('00000000-0000-0000-0000-000000000070', 'teste_grupo_3op');
insert into public.opcoes (id, conjunto_id, label, ordem, exige_foto, is_na) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000070', 'Bom', 1, false, false),
  ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000070', 'Medio', 2, false, false),
  ('00000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000070', 'Mau', 3, true, false),
  ('00000000-0000-0000-0000-000000000074', '00000000-0000-0000-0000-000000000070', 'N.A.', 4, false, true);

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000080', 903, 'Grupo A (nota alta)'),
  ('00000000-0000-0000-0000-000000000081', 904, 'Grupo B (nota media)'),
  ('00000000-0000-0000-0000-000000000082', 905, 'Grupo Todo NA');

insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id) values
  ('00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000080', 'A1', 'escolha', '00000000-0000-0000-0000-000000000070'),
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000080', 'A2', 'escolha', '00000000-0000-0000-0000-000000000070'),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000081', 'B1', 'escolha', '00000000-0000-0000-0000-000000000070'),
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000082', 'C1', 'escolha', '00000000-0000-0000-0000-000000000070'),
  ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000082', 'C2', 'escolha', '00000000-0000-0000-0000-000000000070');

-- Inspecao 1: grupo A todo "Bom" (nota 10), grupo B "Medio" (nota 6) -> geral (10+6)/2=8 -> A
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');
insert into public.checklist_item_responses (inspection_id, item_template_id, opcao_id) values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000071'),
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000071'),
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000072');

-- Inspecao 2: so grupo B, "Mau" (nota 2) -> geral 2 -> C; grupo Todo NA fica de fora mesmo respondido
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');
insert into public.checklist_item_responses (inspection_id, item_template_id, opcao_id) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000073'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000074'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000074');

-- Inspecao 3: nada avaliado ainda (sem nenhuma resposta) -> sem linha em inspection_score
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

do $$
declare v_nota numeric;
begin
  select nota into v_nota from public.checklist_group_score
  where inspection_id = '00000000-0000-0000-0000-000000000100' and group_id = '00000000-0000-0000-0000-000000000080';
  if v_nota <> 10 then raise exception 'FALHOU: grupo A (2 itens Bom) deveria dar nota 10 (deu %)', v_nota; end if;
  raise notice 'OK: nota de grupo = media dos itens avaliados';
end $$;

do $$
declare v_nota_geral numeric; v_classificacao text;
begin
  select nota_geral, classificacao into v_nota_geral, v_classificacao from public.inspection_score
  where inspection_id = '00000000-0000-0000-0000-000000000100';
  if v_nota_geral <> 8 or v_classificacao <> 'A' then
    raise exception 'FALHOU: inspecao 1 deveria dar nota_geral=8, classificacao=A (deu % / %)', v_nota_geral, v_classificacao;
  end if;
  raise notice 'OK: fronteira exata nota_geral=8 classifica A (>=8)';
end $$;

do $$
declare v_nota_geral numeric; v_classificacao text; v_itens_avaliados_grupo_na int;
begin
  select nota_geral, classificacao into v_nota_geral, v_classificacao from public.inspection_score
  where inspection_id = '00000000-0000-0000-0000-000000000101';
  if v_nota_geral <> 2 or v_classificacao <> 'C' then
    raise exception 'FALHOU: inspecao 2 deveria dar nota_geral=2, classificacao=C (deu % / %)', v_nota_geral, v_classificacao;
  end if;

  select itens_avaliados into v_itens_avaliados_grupo_na from public.checklist_group_score
  where inspection_id = '00000000-0000-0000-0000-000000000101' and group_id = '00000000-0000-0000-0000-000000000082';
  if v_itens_avaliados_grupo_na <> 0 then
    raise exception 'FALHOU: grupo todo N.A. deveria ter itens_avaliados=0 (deu %)', v_itens_avaliados_grupo_na;
  end if;
  raise notice 'OK: grupo todo N.A. fica com itens_avaliados=0 e nao entra na nota geral (fronteira <5 classifica C)';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.inspection_score where inspection_id = '00000000-0000-0000-0000-000000000102';
  if v_count <> 0 then
    raise exception 'FALHOU: inspecao sem nenhum item avaliado nao deveria aparecer em inspection_score';
  end if;
  raise notice 'OK: inspecao sem nada avaliado nao aparece em inspection_score (nota_geral/classificacao efetivamente null pra quem consulta)';
end $$;

rollback;
```

- [ ] **Step 3: Aplicar e testar manualmente**

Peça pro usuário rodar `supabase/migrations/00043_group_inspection_score.sql` e depois `supabase/tests/00043_group_inspection_score.test.sql`. Não prossiga sem os 4 `OK` confirmados.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00043_group_inspection_score.sql supabase/tests/00043_group_inspection_score.test.sql
git commit -m "feat: add checklist_group_score and inspection_score views (RF-39 a RF-42)"
```

---

### Task 4: Atualizar ROADMAP

**Files:**
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: Marcar Fase 4 como completa**

Na seção "## Fase 4 — Pontuação", trocar o texto de bloqueio por um resumo de conclusão (data, decisões fechadas no brainstorming — fórmula por posição, escala 10-2, cortes A≥8/B≥5/C<5, `opcoes.is_na` — e as 3 views + coluna nova), seguindo o estilo narrativo do resto do documento. Referenciar `docs/superpowers/specs/2026-08-04-pontuacao-design.md` e `docs/superpowers/plans/2026-08-04-pontuacao.md`. Atualizar também a seção "## Estado atual" se ela ainda apontar Fase 4 como bloqueada/próximo passo.

- [ ] **Step 2: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: sync ROADMAP — Fase 4 (pontuação) completa"
```
