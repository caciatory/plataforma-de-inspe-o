# Checklist Seed (320 itens reais) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `checklist_group_templates` (12 rows) and `checklist_item_templates` (320 rows) from the already-validated source CSV (`docs/data/checklist-inspecta-v5.csv`), per RF-07 (11 fixed groups, 285 items) and RF-63 (`aplica_stand` per item). Items show equally to `particular` and `stand` for now (2026-07-11 decision); the group covering Fase 9 (Motorização Especial) is imported but flagged inactive.

**Architecture:** Two migrations. `00015` adds the two schema columns this seed needs that don't exist yet (`checklist_group_templates.ativo`, `checklist_item_templates.observacoes`). `00016` is generated, not hand-written — a stdlib-only Python script (`scripts/generate_checklist_seed.py`) parses the CSV and writes a deterministic SQL file with literal `insert` statements, which gets committed to the repo like any other migration. This keeps the house convention intact ("every migration is plain SQL applied via `supabase db push`, no ORM, no separate migration framework") while avoiding 320 hand-typed rows — the script is the source of truth, the generated SQL is the artifact.

**Tech Stack:** Python 3 stdlib only (`csv`, `re`, `pathlib`) for the generator — no new dependency, no `requirements.txt`. Plain SQL migrations, hand-rolled `do $$ ... raise exception ... $$` tests via `psql`, same as `supabase/tests/00001`-`00010`.

## Global Constraints

- RF-07: 11 fixed groups in the order given by `docs/data/checklist-inspecta-v5.csv`, 285 v1.0 items. A 12th group ("Motoriz. Especial (F2)", 35 items) exists in the source but is Fase 9 — not part of v1.0 (roadmap §5).
- RF-63: `checklist_item_templates.aplica_stand` already exists (migration `00002`) — do **not** add a new column for this. Every row in the CSV currently has `aplica_stand=PENDENTE`; this import converts that to `false` for all 320 items, matching the 2026-07-11 decision (`docs/especificacao-tecnica-v1.md:345`) to show all items to both `tipo_cliente` values until the sócios' CSV arrives.
- Group 12 ("Motoriz. Especial (F2)") is imported (not skipped) but marked `ativo = false` via a new `checklist_group_templates.ativo boolean not null default true` column — confirmed with the user 2026-07-11.
- `checklist_item_templates.observacoes text` (nullable) is a new column, confirmed with the user 2026-07-11, to preserve the 151/320 CSV rows carrying real técnico guidance (thresholds, what to check) that had no home in the schema.
- Source file confirmed with the user: `docs/data/checklist-inspecta-v5.csv`, 320 rows, columns `num,item,categoria,subcategoria,tipo,qtd_pontos_medicao,aplica_stand,observacoes`. Already verified with `csv.DictReader` — no unescaped quotes, no malformed rows, every `categoria` matches `^(\d+)\.\s*(.+)$`, all 13 `tipo=medicao` rows already have `qtd_pontos_medicao` between 3 and 5.
- House SQL convention: fully-qualified table names, `security invoker` where functions are involved (none needed here — this task is pure DML/DDL, no functions).
- **Migration numbering — verified against the live database, not just local files:** all worktrees for this project push to the *same* remote Supabase Postgres instance regardless of git branch/merge status (`supabase db push` writes directly to the linked project). Checked `select version from supabase_migrations.schema_migrations order by version;` on 2026-07-13: versions `00001`-`00014` are already applied live — `00011`-`00014` came from the unmerged `worktree-fase2-preenchimento-item` branch, pushed straight to the shared DB despite never being merged. Local `supabase/migrations/` in *this* worktree only goes up to `00010` (this branch predates that push), which would have made `00011`/`00012` look free — they are not. This plan uses `00015`/`00016`, the actual next free versions on the live ledger. Before any future migration in this project, check the live ledger, not local `ls supabase/migrations/`.
- No checklist UI, no filtering logic in the app layer — this plan only populates the database. The `aplica_stand`/`ativo` columns exist for future phases to read; nothing queries them yet.

**Prerequisite (once, not a task):** confirm `DATABASE_URL` is set and points at the linked Supabase project — `echo "$DATABASE_URL"` should print `postgres://...`.

---

## File Structure

```
supabase/
  migrations/
    00015_checklist_extra_columns.sql          -- checklist_group_templates.ativo, checklist_item_templates.observacoes
    00016_seed_checklist_groups_and_items.sql  -- generated: 12 groups + 320 items
  tests/
    00015_checklist_extra_columns.test.sql
    00016_seed_checklist_groups_and_items.test.sql
    00016_seed_dry_run.test.sql                -- transactional dry-run, rolled back, run before the real apply
scripts/
  generate_checklist_seed.py                   -- one-time generator, reads the CSV, writes 00016
```

---

### Task 1: Schema — `checklist_group_templates.ativo` and `checklist_item_templates.observacoes`

**Files:**
- Create: `supabase/migrations/00015_checklist_extra_columns.sql`
- Test: `supabase/tests/00015_checklist_extra_columns.test.sql`

**Interfaces:**
- Produces: `checklist_group_templates.ativo boolean not null default true`, `checklist_item_templates.observacoes text` (nullable). Task 2's generated migration writes to both columns by these exact names.
- Consumes: `public.checklist_group_templates`, `public.checklist_item_templates` (migration `00002`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00015_checklist_extra_columns.sql
-- Prep para o seed dos 320 itens reais do checklist (RF-07, RF-63).
-- ativo: permite importar o grupo 12 (Motoriz. Especial, Fase 9) sem expô-lo no v1.0.
-- observacoes: preserva as dicas do CSV-fonte que não tinham coluna (thresholds, o que verificar).

alter table public.checklist_group_templates
  add column ativo boolean not null default true;

alter table public.checklist_item_templates
  add column observacoes text;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`
Expected: applies with no errors (2 columns added).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00015_checklist_extra_columns.test.sql
begin;

do $$
declare v_ativo boolean;
begin
  insert into public.checklist_group_templates (ordem, nome) values (901, 'Grupo Teste');
  select ativo into v_ativo from public.checklist_group_templates where ordem = 901;
  if v_ativo <> true then
    raise exception 'FALHOU: ativo deveria ser true por default (foi %)', v_ativo;
  end if;
  raise notice 'OK: checklist_group_templates.ativo tem default true';
end $$;

do $$
declare
  v_group_id uuid;
  v_obs text;
begin
  insert into public.checklist_group_templates (ordem, nome) values (902, 'Grupo Teste 2')
  returning id into v_group_id;

  insert into public.checklist_item_templates (group_id, nome) values (v_group_id, 'Item sem observacoes');
  select observacoes into v_obs from public.checklist_item_templates
  where group_id = v_group_id and nome = 'Item sem observacoes';
  if v_obs is not null then
    raise exception 'FALHOU: observacoes deveria aceitar null (foi %)', v_obs;
  end if;

  insert into public.checklist_item_templates (group_id, nome, observacoes)
  values (v_group_id, 'Item com observacoes', 'Ref: 80-180um');
  select observacoes into v_obs from public.checklist_item_templates
  where group_id = v_group_id and nome = 'Item com observacoes';
  if v_obs <> 'Ref: 80-180um' then
    raise exception 'FALHOU: observacoes deveria gravar o texto (foi %)', v_obs;
  end if;

  raise notice 'OK: checklist_item_templates.observacoes aceita null e texto';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00015_checklist_extra_columns.test.sql`
Expected: 2 `NOTICE: OK: ...` lines, no `ERROR`, ends with `ROLLBACK`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00015_checklist_extra_columns.sql supabase/tests/00015_checklist_extra_columns.test.sql
git commit -m "feat: add checklist_group_templates.ativo and checklist_item_templates.observacoes"
```

---

### Task 2: Generate and apply the seed (12 groups, 320 items)

**Files:**
- Create: `scripts/generate_checklist_seed.py`
- Create (generated by the script, then committed): `supabase/migrations/00016_seed_checklist_groups_and_items.sql`
- Test: `supabase/tests/00016_seed_checklist_groups_and_items.test.sql` (post-apply, permanent), `supabase/tests/00016_seed_dry_run.test.sql` (pre-apply, transactional, rolled back)

**Interfaces:**
- Consumes: `docs/data/checklist-inspecta-v5.csv` (source), `checklist_group_templates(ordem, nome, ativo)` and `checklist_item_templates(group_id, subcategoria, nome, tipo, qtd_pontos_medicao, aplica_stand, observacoes)` (Task 1).
- Produces: 12 rows in `checklist_group_templates` (`ordem` 1-12, `ativo=false` only for `ordem=12`), 320 rows in `checklist_item_templates` linked via `group_id`.

- [ ] **Step 1: Write the generator script**

```python
#!/usr/bin/env python3
"""Gera supabase/migrations/00016_seed_checklist_groups_and_items.sql
a partir de docs/data/checklist-inspecta-v5.csv. Reexecute se o CSV mudar
— nao edite o SQL gerado a mao."""
import csv
import re
import sys
from pathlib import Path

CSV_PATH = Path("docs/data/checklist-inspecta-v5.csv")
OUT_PATH = Path("supabase/migrations/00016_seed_checklist_groups_and_items.sql")
CATEGORIA_RE = re.compile(r"^(\d+)\.\s*(.+)$")
GRUPOS_INATIVOS = {12}  # Motoriz. Especial (F2) — Fase 9, fora do v1.0 (roadmap §5)


def sql_str(value: str) -> str:
    value = value.strip()
    if not value:
        return "null"
    return "'" + value.replace("'", "''") + "'"


def sql_int(value: str) -> str:
    value = value.strip()
    return value if value else "null"


def parse_categoria(categoria: str) -> tuple[int, str]:
    m = CATEGORIA_RE.match(categoria.strip())
    if not m:
        sys.exit(f"categoria fora do padrao 'N. Nome': {categoria!r}")
    return int(m.group(1)), m.group(2).strip()


def main() -> None:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    groups: dict[int, str] = {}
    for r in rows:
        ordem, nome = parse_categoria(r["categoria"])
        groups.setdefault(ordem, nome)

    assert len(groups) == 12, f"esperava 12 grupos, achei {len(groups)}"
    assert len(rows) == 320, f"esperava 320 itens, achei {len(rows)}"

    lines = [
        "-- supabase/migrations/00016_seed_checklist_groups_and_items.sql",
        "-- Gerado por scripts/generate_checklist_seed.py a partir de",
        "-- docs/data/checklist-inspecta-v5.csv. Nao editar a mao:",
        "-- reexecute o script se o CSV mudar.",
        "",
        "insert into public.checklist_group_templates (ordem, nome, ativo) values",
    ]
    group_values = []
    for ordem in sorted(groups):
        nome = groups[ordem]
        ativo = "false" if ordem in GRUPOS_INATIVOS else "true"
        group_values.append(f"  ({ordem}, {sql_str(nome)}, {ativo})")
    lines.append(",\n".join(group_values) + ";")
    lines.append("")

    lines.append(
        "insert into public.checklist_item_templates "
        "(group_id, subcategoria, nome, tipo, qtd_pontos_medicao, aplica_stand, observacoes) values"
    )
    item_values = []
    for r in rows:
        ordem, _ = parse_categoria(r["categoria"])
        subcategoria = sql_str(r["subcategoria"])
        nome = sql_str(r["item"])
        tipo = sql_str(r["tipo"])
        qtd = sql_int(r["qtd_pontos_medicao"])
        aplica_stand = "true" if r["aplica_stand"].strip().lower() == "true" else "false"
        observacoes = sql_str(r["observacoes"])
        item_values.append(
            f"  ((select id from public.checklist_group_templates where ordem = {ordem}), "
            f"{subcategoria}, {nome}, {tipo}, {qtd}, {aplica_stand}, {observacoes})"
        )
    lines.append(",\n".join(item_values) + ";")
    lines.append("")

    OUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: {len(groups)} grupos, {len(rows)} itens -> {OUT_PATH}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the generator**

Run: `python3 scripts/generate_checklist_seed.py`
Expected: `OK: 12 grupos, 320 itens -> supabase/migrations/00016_seed_checklist_groups_and_items.sql`

- [ ] **Step 3: Sanity-check the generated file before applying it**

Run: `grep -c "select id from public.checklist_group_templates" supabase/migrations/00016_seed_checklist_groups_and_items.sql`
Expected: `320` (one subquery per item row).

Run: `grep -c "^  ([0-9]*, '" supabase/migrations/00016_seed_checklist_groups_and_items.sql`
Expected: `12` (one literal group row).

- [ ] **Step 4: Transactional dry-run against the live DB (TDD, before the real insert)**

There is no local/staging Supabase instance for this project (no Docker available, one hosted project shared by every worktree) — confirmed with the user 2026-07-13. Instead: wrap the generated insert statements in a transaction with an explicit `rollback`, assert the three counts below, and only proceed to the real `supabase db push` (Step 5) once the dry-run confirms them. Nothing is persisted by this step.

```sql
-- supabase/tests/00016_seed_dry_run.test.sql
-- Dry-run only: wraps the generated seed in a transaction and rolls back.
-- Confirms 12 groups, exactly 13 tipo=medicao items with qtd_pontos_medicao
-- 3-5, and aplica_stand defaulting false — before the real, non-transactional
-- `supabase db push` in Step 5 makes it permanent.
begin;

\i supabase/migrations/00016_seed_checklist_groups_and_items.sql

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates;
  if v_count <> 12 then
    raise exception 'FALHOU (dry-run): esperava 12 grupos, achei %', v_count;
  end if;
  raise notice 'OK (dry-run): 12 grupos batem com o esperado';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where tipo = 'medicao';
  if v_count <> 13 then
    raise exception 'FALHOU (dry-run): esperava 13 itens tipo=medicao, achei %', v_count;
  end if;

  select count(*) into v_count from public.checklist_item_templates
  where tipo = 'medicao' and (qtd_pontos_medicao is null or qtd_pontos_medicao not between 3 and 5);
  if v_count <> 0 then
    raise exception 'FALHOU (dry-run): % dos 13 itens de medicao tem qtd_pontos_medicao fora de 3-5', v_count;
  end if;
  raise notice 'OK (dry-run): os 13 itens de espessura de pintura (tipo=medicao) tem qtd_pontos_medicao entre 3 e 5';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where aplica_stand <> false;
  if v_count <> 0 then
    raise exception 'FALHOU (dry-run): esperava aplica_stand=false por default em todos os itens, achei % com true', v_count;
  end if;
  raise notice 'OK (dry-run): aplica_stand chega false por default em todos os 320 itens';
end $$;

rollback;
```

Run: `psql "$DATABASE_URL" -f supabase/tests/00016_seed_dry_run.test.sql`
Expected: 3 `NOTICE: OK (dry-run): ...` lines, no `ERROR`, ends with `ROLLBACK`. If any assertion fails here, fix the generator/CSV and regenerate (Step 2) — do not proceed to Step 5 until this passes.

- [ ] **Step 5: Apply the migration for real**

Run: `supabase db push`
Expected: applies with no errors (12 + 320 rows inserted, permanently this time).

- [ ] **Step 6: Write the post-apply test**

```sql
-- supabase/tests/00016_seed_checklist_groups_and_items.test.sql
-- Verifica dados ja commitados pelo seed (00012) — sem begin/rollback,
-- porque nao ha fixture de teste pra desfazer, so leitura.

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates;
  if v_count <> 12 then
    raise exception 'FALHOU: esperava 12 grupos, achei %', v_count;
  end if;
  raise notice 'OK: 12 grupos seedados';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates;
  if v_count <> 320 then
    raise exception 'FALHOU: esperava 320 itens, achei %', v_count;
  end if;
  raise notice 'OK: 320 itens seedados';
end $$;

do $$
declare v_ativo boolean;
begin
  select ativo into v_ativo from public.checklist_group_templates where ordem = 12;
  if v_ativo <> false then
    raise exception 'FALHOU: grupo 12 (Motoriz. Especial) deveria estar ativo=false (foi %)', v_ativo;
  end if;
  raise notice 'OK: grupo 12 (Fase 9) importado como inativo';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates where ativo = false;
  if v_count <> 1 then
    raise exception 'FALHOU: so o grupo 12 deveria estar inativo (achei % grupos inativos)', v_count;
  end if;
  raise notice 'OK: apenas o grupo 12 esta inativo, os outros 11 estao ativos';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where aplica_stand <> false;
  if v_count <> 0 then
    raise exception 'FALHOU: nenhum item deveria ter aplica_stand=true ainda (achei %)', v_count;
  end if;
  raise notice 'OK: aplica_stand=false em todos os itens (PENDENTE -> false)';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where observacoes is not null;
  if v_count <> 151 then
    raise exception 'FALHOU: esperava 151 itens com observacoes, achei %', v_count;
  end if;
  raise notice 'OK: 151 itens preservaram observacoes do CSV';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count
  from public.checklist_item_templates it
  join public.checklist_group_templates gt on gt.id = it.group_id
  where gt.ordem = 1 and it.nome = 'Cor do veículo';
  if v_count <> 1 then
    raise exception 'FALHOU: item "Cor do veiculo" deveria estar ligado ao grupo 1 (achei %)', v_count;
  end if;
  raise notice 'OK: item de exemplo ligado ao grupo correto via group_id';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where tipo = 'medicao';
  if v_count <> 13 then
    raise exception 'FALHOU: esperava 13 itens tipo=medicao (espessura de pintura), achei %', v_count;
  end if;

  select count(*) into v_count from public.checklist_item_templates
  where tipo = 'medicao' and (qtd_pontos_medicao is null or qtd_pontos_medicao not between 3 and 5);
  if v_count <> 0 then
    raise exception 'FALHOU: todo item tipo=medicao deveria ter qtd_pontos_medicao entre 3 e 5 (achei % invalidos)', v_count;
  end if;
  raise notice 'OK: os 13 itens de medicao (espessura de pintura) tem qtd_pontos_medicao valido (3-5)';
end $$;
```

- [ ] **Step 7: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00016_seed_checklist_groups_and_items.test.sql`
Expected: 8 `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 8: Confirm final counts against the source CSV**

Run: `python3 -c "import csv; rows=list(csv.DictReader(open('docs/data/checklist-inspecta-v5.csv'))); print(len(rows), len(set(r['categoria'] for r in rows)))"`
Expected: `320 12` — matches the live-DB counts from Step 7 (320 `checklist_item_templates` rows, 12 `checklist_group_templates` rows) exactly, confirming the import didn't drop or duplicate anything relative to the source spreadsheet.

- [ ] **Step 9: Commit**

```bash
git add scripts/generate_checklist_seed.py supabase/migrations/00016_seed_checklist_groups_and_items.sql supabase/tests/00016_seed_checklist_groups_and_items.test.sql supabase/tests/00016_seed_dry_run.test.sql
git commit -m "feat: seed 12 checklist groups and 320 items from checklist-inspecta-v5.csv"
```

---

## Self-Review

**Spec coverage:** RF-07 (Task 2 — 11 v1.0 groups + 285 items, group 12/35 items imported but inactive) ✓, RF-63 (`aplica_stand` reused from migration `00002`, set to `false` for all rows per the 2026-07-11 decision) ✓. No task invents a `somente_particular` column — confirmed with the user that `aplica_stand` already covers this and no new migration was needed for it.

**Placeholder scan:** none — the generator script is complete and runnable; the 320-row migration is not hand-typed but is fully determined by committed, verified inputs (the script + the CSV), which is the correct way to represent a generated artifact in a plan.

**Type consistency:** `sql_str`/`sql_int` in the script produce values consistent with the column types from Task 1 (`observacoes text`, nullable) and migration `00002` (`qtd_pontos_medicao int`, nullable; `aplica_stand boolean not null`). The `group_id` subquery in every item `insert` matches `checklist_group_templates.ordem` populated by the group `insert` in the same file (groups are inserted first, so the subquery resolves).

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-checklist-seed-300-itens.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
