# Aplicar aos demais (Fase 2.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a técnico classify one item and apply the same classificação/observação to its "sibling" items (pneus, vidros, bancos, faróis, etc.), reviewing/editing each before one atomic save.

**Architecture:** A curated `grupo_replicacao` column drives everything — no clustering logic in code. The item page (already built in Fase 2) gains a siblings checklist and, on demand, an inline batch review panel (no new route) that writes through one new atomic RPC.

**Tech Stack:** Same as Fase 2 — Next.js 15, React 19, Supabase (Postgres), Vitest + Testing Library, Python 3 (CSV/migration generator script, matching `scripts/generate_checklist_seed.py`'s existing convention). No new npm dependencies.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md` — read it for the "why". Note: the design doc's prose says "36 clusters, 99 itens" — the actual curated count (below, and what this plan implements) is **37 clusters, 101 itens**; the cluster table itself was correct, only the rolled-up summary was off by a small rounding-adjacent amount.
- Mechanism copies **classificação + observação only** — never foto. Every sibling row's photo list starts empty; each row's foto is independent (RF-16 applies per item, batched or not).
- Sibling checkbox default: **checked only if the sibling is still `pendente`**. Already-answered siblings (`respondido`/`NF`) default **unchecked**, shown with a note — never silently overwrite a diverging prior answer.
- `grupo_replicacao` only applies to `tipo='padrao'` items — enforced by a DB CHECK constraint, not just convention.
- Curation lives in `docs/data/checklist-inspecta-v5.csv` (new `grupo_replicacao` column) — future cluster changes are a CSV edit + rerunning the generator script from Task 2, never a code/RPC/UI change.
- Batch write is one atomic RPC (`apply_classificacao_batch`), matching the existing `save_paint_measurement` pattern — never N independent client calls for a batch.
- Client-side pre-validation blocks "Confirmar aplicação" when a `ruim` row has no photo, naming the row — before any server round-trip. The DB trigger (RF-16, already in `main`) remains the real guarantee.
- No new route — everything happens on the existing `/inspections/[id]/checklist/[groupId]/[itemId]` page.
- Page components that are pure fetch-and-render get no dedicated test (same documented exception as Fase 2) — the siblings query/derivation is extracted into a tested pure function instead of living inline in the page.
- Every Postgres write ends with `.select("id").single()` or is a plain RPC call — same consistency rule as Fase 2, for uniform test mocking.

---

### Task 1: DB — `grupo_replicacao` column + constraint

**Files:**
- Create: `supabase/migrations/00024_grupo_replicacao_column.sql`
- Test: `supabase/tests/00024_grupo_replicacao_column.test.sql`

**Interfaces:**
- Produces: `public.checklist_item_templates.grupo_replicacao text` (nullable) — Task 2's seed migration populates it; Task 4's pure function and Task 8's page query read it.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00024_grupo_replicacao_column.sql
-- Fase 2.5: docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md
-- secao 2. Itens com o mesmo grupo_replicacao nao-nulo sao "irmaos" pra UI
-- de aplicar-aos-demais. So item_template tipo='padrao' pode ter valor --
-- medicao nao tem classificacao manual pra copiar.

alter table public.checklist_item_templates
  add column grupo_replicacao text;

alter table public.checklist_item_templates
  add constraint grupo_replicacao_so_padrao
  check (grupo_replicacao is null or tipo = 'padrao');
```

- [ ] **Step 2: Apply the migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00024` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00024_grupo_replicacao_column.test.sql
begin;

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000030', 906, 'Grupo Teste GR');

do $$
begin
  insert into public.checklist_item_templates (group_id, nome, tipo, grupo_replicacao)
    values ('00000000-0000-0000-0000-000000000030', 'Item Padrao', 'padrao', 'cluster-teste');
  raise notice 'OK: item padrao aceita grupo_replicacao';
end $$;

do $$
begin
  begin
    insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao, grupo_replicacao)
      values ('00000000-0000-0000-0000-000000000030', 'Item Medicao', 'medicao', 3, 'cluster-teste');
    raise exception 'FALHOU: item medicao nao deveria aceitar grupo_replicacao';
  exception when check_violation then
    raise notice 'OK: item medicao com grupo_replicacao bloqueado pela constraint';
  end;
end $$;

do $$
begin
  insert into public.checklist_item_templates (group_id, nome, tipo, grupo_replicacao)
    values ('00000000-0000-0000-0000-000000000030', 'Item Sem Cluster', 'padrao', null);
  raise notice 'OK: grupo_replicacao null aceito normalmente';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00024_grupo_replicacao_column.test.sql
```

Expected: three `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00024_grupo_replicacao_column.sql supabase/tests/00024_grupo_replicacao_column.test.sql
git commit -m "feat: add grupo_replicacao column for repeated-item clusters"
```

---

### Task 2: CSV curation + seed migration

**Files:**
- Create: `scripts/generate_grupo_replicacao_seed.py`
- Modify: `docs/data/checklist-inspecta-v5.csv` (new `grupo_replicacao` column, via running the script)
- Create: `supabase/migrations/00025_seed_grupo_replicacao.sql` (generated by the script — do not hand-write)
- Test: `supabase/tests/00025_seed_grupo_replicacao.test.sql`

**Interfaces:**
- Consumes: `docs/data/checklist-inspecta-v5.csv` (existing columns: `num,item,categoria,subcategoria,tipo,qtd_pontos_medicao,aplica_stand,observacoes`), migration `00024` (Task 1).
- Produces: 101 rows of `public.checklist_item_templates.grupo_replicacao` populated across 37 clusters — Task 4's pure function and Task 8's page query rely on these exact values existing in the live DB.

- [ ] **Step 1: Write the generator script**

```python
#!/usr/bin/env python3
"""Popula/atualiza a coluna grupo_replicacao em
docs/data/checklist-inspecta-v5.csv a partir do CLUSTER_MAP curado abaixo,
e gera a migration de UPDATE correspondente.

Para mudar um cluster no futuro (juntar, separar, criar, remover item):
edite CLUSTER_MAP abaixo (ou a celula grupo_replicacao do CSV direto, se
preferir editar por planilha) e reexecute este script -- ele sempre
regrava o CSV inteiro e gera uma migration NOVA (nunca edite uma
migration ja aplicada)."""
import csv
import re
import sys
from pathlib import Path

CSV_PATH = Path("docs/data/checklist-inspecta-v5.csv")
MIGRATION_PATH = Path("supabase/migrations/00025_seed_grupo_replicacao.sql")
CATEGORIA_RE = re.compile(r"^(\d+)\.\s*(.+)$")

# (subcategoria, item) -> slug do cluster. So itens tipo='padrao' -- nenhum
# item de medicao entra aqui (constraint da migration 00024 bloquearia).
CLUSTER_MAP: dict[tuple[str, str], str] = {
    ("Carroçaria", "Lateral esquerda - estado geral"): "carrocaria-lateral-estado",
    ("Carroçaria", "Lateral direita - estado geral"): "carrocaria-lateral-estado",
    ("Carroçaria", "Para-lamas dianteiro esquerdo - estado"): "carrocaria-paralama-estado",
    ("Carroçaria", "Para-lamas dianteiro direito - estado"): "carrocaria-paralama-estado",
    ("Para-choques", "Para-choques dianteiro - estado geral"): "parachoques-estado-geral",
    ("Para-choques", "Para-choques traseiro - estado geral"): "parachoques-estado-geral",
    ("Para-choques", "Para-choques dianteiro - alinhamento"): "parachoques-alinhamento",
    ("Para-choques", "Para-choques traseiro - alinhamento"): "parachoques-alinhamento",
    ("Para-choques", "Para-choques dianteiro - fixações"): "parachoques-fixacoes",
    ("Para-choques", "Para-choques traseiro - fixações"): "parachoques-fixacoes",
    ("Portas", "Porta dianteira esquerda - alinhamento"): "portas-alinhamento",
    ("Portas", "Porta dianteira direita - alinhamento"): "portas-alinhamento",
    ("Portas", "Porta traseira esquerda - alinhamento"): "portas-alinhamento",
    ("Portas", "Porta traseira direita - alinhamento"): "portas-alinhamento",
    ("Portas", "Porta dianteira esquerda - fechadura"): "portas-fechadura",
    ("Portas", "Porta dianteira direita - fechadura"): "portas-fechadura",
    ("Portas", "Porta traseira esquerda - fechadura"): "portas-fechadura",
    ("Portas", "Porta traseira direita - fechadura"): "portas-fechadura",
    ("Faróis e Luzes", "Farol dianteiro esquerdo - estado"): "farois-farol-dianteiro",
    ("Faróis e Luzes", "Farol dianteiro direito - estado"): "farois-farol-dianteiro",
    ("Faróis e Luzes", "Farol traseiro esquerdo - estado"): "farois-farol-traseiro",
    ("Faróis e Luzes", "Farol traseiro direito - estado"): "farois-farol-traseiro",
    ("Faróis e Luzes", "Luz média (cruzamento) esquerda"): "farois-luz-media",
    ("Faróis e Luzes", "Luz média (cruzamento) direita"): "farois-luz-media",
    ("Faróis e Luzes", "Luz máxima (estrada) esquerda"): "farois-luz-maxima",
    ("Faróis e Luzes", "Luz máxima (estrada) direita"): "farois-luz-maxima",
    ("Faróis e Luzes", "Luz de travagem esquerda"): "farois-luz-travagem",
    ("Faróis e Luzes", "Luz de travagem direita"): "farois-luz-travagem",
    ("Faróis e Luzes", "Pisca dianteiro esquerdo"): "farois-pisca-dianteiro",
    ("Faróis e Luzes", "Pisca dianteiro direito"): "farois-pisca-dianteiro",
    ("Faróis e Luzes", "Pisca traseiro esquerdo"): "farois-pisca-traseiro",
    ("Faróis e Luzes", "Pisca traseiro direito"): "farois-pisca-traseiro",
    ("Faróis e Luzes", "Luz de nevoeiro dianteira esquerda"): "farois-nevoeiro-dianteiro",
    ("Faróis e Luzes", "Luz de nevoeiro dianteira direita"): "farois-nevoeiro-dianteiro",
    ("Faróis e Luzes", "Luz de nevoeiro traseira esquerda"): "farois-nevoeiro-traseiro",
    ("Faróis e Luzes", "Luz de nevoeiro traseira direita"): "farois-nevoeiro-traseiro",
    ("Faróis e Luzes", "Luz de marcha-atrás esquerda"): "farois-marcha-atras",
    ("Faróis e Luzes", "Luz de marcha-atrás direita"): "farois-marcha-atras",
    ("Faróis e Luzes", "Luzes de condução diurna (DRL) esquerda"): "farois-drl",
    ("Faróis e Luzes", "Luzes de condução diurna (DRL) direita"): "farois-drl",
    ("Vidros", "Vidro lateral dianteiro esquerdo - estado"): "vidros-lateral-dianteiro",
    ("Vidros", "Vidro lateral dianteiro direito - estado"): "vidros-lateral-dianteiro",
    ("Vidros", "Vidro lateral traseiro esquerdo - estado"): "vidros-lateral-traseiro",
    ("Vidros", "Vidro lateral traseiro direito - estado"): "vidros-lateral-traseiro",
    ("Vidros", "Elevador vidro dianteiro esquerdo"): "vidros-elevador-dianteiro",
    ("Vidros", "Elevador vidro dianteiro direito"): "vidros-elevador-dianteiro",
    ("Vidros", "Elevador vidro traseiro esquerdo"): "vidros-elevador-traseiro",
    ("Vidros", "Elevador vidro traseiro direito"): "vidros-elevador-traseiro",
    ("Espelhos", "Retrovisor esquerdo - estado"): "espelhos-estado",
    ("Espelhos", "Retrovisor direito - estado"): "espelhos-estado",
    ("Espelhos", "Retrovisor esquerdo - ajuste elétrico"): "espelhos-ajuste-eletrico",
    ("Espelhos", "Retrovisor direito - ajuste elétrico"): "espelhos-ajuste-eletrico",
    ("Espelhos", "Retrovisor esquerdo - aquecimento"): "espelhos-aquecimento",
    ("Espelhos", "Retrovisor direito - aquecimento"): "espelhos-aquecimento",
    ("Bancos", "Banco do condutor - estado"): "bancos-estado",
    ("Bancos", "Banco passageiro dianteiro - estado"): "bancos-estado",
    ("Bancos", "Banco traseiro esquerdo - estado"): "bancos-estado",
    ("Bancos", "Banco traseiro central - estado"): "bancos-estado",
    ("Bancos", "Banco traseiro direito - estado"): "bancos-estado",
    ("Bancos", "Cinto de segurança dianteiro condutor"): "bancos-cinto-seguranca",
    ("Bancos", "Cinto de segurança dianteiro passageiro"): "bancos-cinto-seguranca",
    ("Bancos", "Cinto de segurança traseiro esquerdo"): "bancos-cinto-seguranca",
    ("Bancos", "Cinto de segurança traseiro central"): "bancos-cinto-seguranca",
    ("Bancos", "Cinto de segurança traseiro direito"): "bancos-cinto-seguranca",
    ("Pneus", "Pneu dianteiro esquerdo - estado geral"): "pneus-estado-geral",
    ("Pneus", "Pneu dianteiro direito - estado geral"): "pneus-estado-geral",
    ("Pneus", "Pneu traseiro esquerdo - estado geral"): "pneus-estado-geral",
    ("Pneus", "Pneu traseiro direito - estado geral"): "pneus-estado-geral",
    ("Pneus", "Profundidade do piso - dianteiro esq."): "pneus-profundidade-piso",
    ("Pneus", "Profundidade do piso - dianteiro dir."): "pneus-profundidade-piso",
    ("Pneus", "Profundidade do piso - traseiro esq."): "pneus-profundidade-piso",
    ("Pneus", "Profundidade do piso - traseiro dir."): "pneus-profundidade-piso",
    ("Pneus", "Desgaste irregular - dianteiro esq."): "pneus-desgaste-irregular",
    ("Pneus", "Desgaste irregular - dianteiro dir."): "pneus-desgaste-irregular",
    ("Pneus", "Desgaste irregular - traseiro esq."): "pneus-desgaste-irregular",
    ("Pneus", "Desgaste irregular - traseiro dir."): "pneus-desgaste-irregular",
    ("Pneus", "Cortes/bolhas - dianteiro esq."): "pneus-cortes-bolhas",
    ("Pneus", "Cortes/bolhas - dianteiro dir."): "pneus-cortes-bolhas",
    ("Pneus", "Cortes/bolhas - traseiro esq."): "pneus-cortes-bolhas",
    ("Pneus", "Cortes/bolhas - traseiro dir."): "pneus-cortes-bolhas",
    ("Jantes", "Jante dianteira esquerda - estado"): "jantes-estado",
    ("Jantes", "Jante dianteira direita - estado"): "jantes-estado",
    ("Jantes", "Jante traseira esquerda - estado"): "jantes-estado",
    ("Jantes", "Jante traseira direita - estado"): "jantes-estado",
    ("Travões", "Pastilhas dianteiras - desgaste"): "travoes-pastilhas",
    ("Travões", "Pastilhas traseiras - desgaste"): "travoes-pastilhas",
    ("Travões", "Disco dianteiro esquerdo - estado"): "travoes-disco-estado",
    ("Travões", "Disco dianteiro direito - estado"): "travoes-disco-estado",
    ("Travões", "Disco traseiro esquerdo - estado"): "travoes-disco-estado",
    ("Travões", "Disco traseiro direito - estado"): "travoes-disco-estado",
    ("Suspensão", "Amortecedor dianteiro esquerdo - estado"): "suspensao-amortecedor",
    ("Suspensão", "Amortecedor dianteiro direito - estado"): "suspensao-amortecedor",
    ("Suspensão", "Amortecedor traseiro esquerdo - estado"): "suspensao-amortecedor",
    ("Suspensão", "Amortecedor traseiro direito - estado"): "suspensao-amortecedor",
    ("Suspensão", "Mola dianteira esquerda - estado"): "suspensao-mola",
    ("Suspensão", "Mola dianteira direita - estado"): "suspensao-mola",
    ("Suspensão", "Mola traseira esquerda - estado"): "suspensao-mola",
    ("Suspensão", "Mola traseira direita - estado"): "suspensao-mola",
    ("Segurança", "Airbags frontais - luz painel OK"): "seguranca-airbag-luz-painel",
    ("Segurança", "Airbags laterais - luz painel OK"): "seguranca-airbag-luz-painel",
    ("Segurança", "Airbags de cortina - luz painel OK"): "seguranca-airbag-luz-painel",
}


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def parse_categoria_ordem(categoria: str) -> int:
    m = CATEGORIA_RE.match(categoria.strip())
    if not m:
        sys.exit(f"categoria fora do padrao 'N. Nome': {categoria!r}")
    return int(m.group(1))


def main() -> None:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    assert len(rows) == 320, f"esperava 320 itens no CSV, achei {len(rows)}"

    if "grupo_replicacao" not in fieldnames:
        fieldnames.append("grupo_replicacao")

    updates = []
    matched_keys = set()
    for r in rows:
        key = (r["subcategoria"].strip(), r["item"].strip())
        slug = CLUSTER_MAP.get(key, "")
        r["grupo_replicacao"] = slug
        if slug:
            matched_keys.add(key)
            ordem = parse_categoria_ordem(r["categoria"])
            updates.append(
                "update public.checklist_item_templates set grupo_replicacao = "
                f"{sql_str(slug)} where group_id = (select id from public.checklist_group_templates "
                f"where ordem = {ordem}) and subcategoria = {sql_str(r['subcategoria'])} "
                f"and nome = {sql_str(r['item'])};"
            )

    missing = set(CLUSTER_MAP) - matched_keys
    assert not missing, f"CLUSTER_MAP tem chave(s) que nao bateram com nenhuma linha do CSV: {missing}"
    assert len(updates) == 101, f"esperava 101 UPDATEs, gerei {len(updates)}"

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    lines = [
        "-- supabase/migrations/00025_seed_grupo_replicacao.sql",
        "-- Fase 2.5: docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md",
        "-- secao 2. Gerado por scripts/generate_grupo_replicacao_seed.py a partir",
        "-- de docs/data/checklist-inspecta-v5.csv (coluna grupo_replicacao). Nao",
        "-- editar este arquivo a mao -- reexecute o script se o CSV mudar; isso",
        "-- gera uma migration NOVA, nunca edite uma ja aplicada.",
        "",
    ]
    lines.extend(updates)
    lines.append("")

    MIGRATION_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: {len(updates)} itens marcados em {len(set(CLUSTER_MAP.values()))} clusters -> {MIGRATION_PATH}, CSV atualizado")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the script**

```bash
python3 scripts/generate_grupo_replicacao_seed.py
```

Expected: `OK: 101 itens marcados em 37 clusters -> supabase/migrations/00025_seed_grupo_replicacao.sql, CSV atualizado`. If any `assert` fails, the error names the mismatched key(s) — check the exact spelling/accents against `docs/data/checklist-inspecta-v5.csv` before editing `CLUSTER_MAP`, don't guess.

- [ ] **Step 3: Verify the CSV diff is sane**

```bash
git diff --stat docs/data/checklist-inspecta-v5.csv
```

Expected: 1 file changed, only the `grupo_replicacao` column added (no other column touched). Spot check a few rows:

```bash
grep "Pneu dianteiro esquerdo" docs/data/checklist-inspecta-v5.csv
```

Expected: line ends with `,pneus-estado-geral`.

- [ ] **Step 4: Apply the generated migration**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00025` applied without error.

- [ ] **Step 5: Write the SQL test**

```sql
-- supabase/tests/00025_seed_grupo_replicacao.test.sql
begin;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where grupo_replicacao is not null;
  if v_count <> 101 then
    raise exception 'FALHOU: esperava 101 itens com grupo_replicacao, encontrou %', v_count;
  end if;
  raise notice 'OK: 101 itens marcados com grupo_replicacao';
end $$;

do $$
declare
  v_slug text;
begin
  select grupo_replicacao into v_slug from public.checklist_item_templates
    where nome = 'Pneu dianteiro esquerdo - estado geral';
  if v_slug <> 'pneus-estado-geral' then
    raise exception 'FALHOU: Pneu dianteiro esquerdo deveria ter pneus-estado-geral, tem %', coalesce(v_slug, 'null');
  end if;
  raise notice 'OK: cluster de pneus curado corretamente (spot check)';
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where grupo_replicacao = 'farois-luz-media';
  if v_count <> 2 then
    raise exception 'FALHOU: cluster farois-luz-media deveria ter 2 itens, tem %', v_count;
  end if;
  raise notice 'OK: cluster farois-luz-media tem exatamente 2 itens';
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where grupo_replicacao is not null and tipo <> 'padrao';
  if v_count <> 0 then
    raise exception 'FALHOU: nenhum item de medicao deveria ter grupo_replicacao, encontrou %', v_count;
  end if;
  raise notice 'OK: nenhum item de medicao foi marcado com grupo_replicacao';
end $$;

rollback;
```

- [ ] **Step 6: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00025_seed_grupo_replicacao.test.sql
```

Expected: four `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate_grupo_replicacao_seed.py docs/data/checklist-inspecta-v5.csv supabase/migrations/00025_seed_grupo_replicacao.sql supabase/tests/00025_seed_grupo_replicacao.test.sql
git commit -m "feat: curate and seed grupo_replicacao for 101 repeated items across 37 clusters"
```

---

### Task 3: DB — `apply_classificacao_batch` RPC

**Files:**
- Create: `supabase/migrations/00026_apply_classificacao_batch.sql`
- Test: `supabase/tests/00026_apply_classificacao_batch.test.sql`

**Interfaces:**
- Consumes: `public.checklist_item_responses` (existing RLS from Fase 2 governs every write here — `security invoker`).
- Produces: `public.apply_classificacao_batch(p_inspection_id uuid, p_items jsonb) returns void` — Task 6's `applyClassificacaoBatchAction` calls this via `supabase.rpc("apply_classificacao_batch", {...})`. `p_items` is a JSON array of `{item_template_id, classificacao, observacao}`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00026_apply_classificacao_batch.sql
-- Fase 2.5: docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md
-- secao 4. Escreve varios checklist_item_responses numa transacao so --
-- se um item do lote falhar (ex: RF-16, "ruim" sem foto), o lote inteiro
-- nao e salvo. security invoker: cada linha ainda passa pela RLS de
-- checklist_item_responses_insert/update (migration 00009), igual toda
-- escrita desta tabela.

create function public.apply_classificacao_batch(
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
    insert into public.checklist_item_responses (inspection_id, item_template_id, classificacao, observacao)
    values (
      p_inspection_id,
      (v_item->>'item_template_id')::uuid,
      (v_item->>'classificacao')::public.item_classificacao,
      v_item->>'observacao'
    )
    on conflict (inspection_id, item_template_id) do update
      set classificacao = excluded.classificacao,
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

Expected: migration `00026` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00026_apply_classificacao_batch.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 907, 'Pneus Teste Lote');
insert into public.checklist_item_templates (id, group_id, nome, tipo, grupo_replicacao) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Pneu A', 'padrao', 'pneus-teste-lote'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Pneu B', 'padrao', 'pneus-teste-lote'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000020', 'Pneu C', 'padrao', 'pneus-teste-lote');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

-- Cenario A: lote de 3 itens com sucesso, numa chamada so.
do $$
declare
  v_count int;
begin
  perform public.apply_classificacao_batch(
    '00000000-0000-0000-0000-000000000010',
    '[
      {"item_template_id":"00000000-0000-0000-0000-000000000021","classificacao":"otimo","observacao":"Sem avarias"},
      {"item_template_id":"00000000-0000-0000-0000-000000000022","classificacao":"otimo","observacao":null},
      {"item_template_id":"00000000-0000-0000-0000-000000000023","classificacao":"medio","observacao":"Desgaste leve"}
    ]'::jsonb
  );

  select count(*) into v_count from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010'
      and item_template_id in (
        '00000000-0000-0000-0000-000000000021',
        '00000000-0000-0000-0000-000000000022',
        '00000000-0000-0000-0000-000000000023'
      )
      and status = 'respondido';

  if v_count <> 3 then
    raise exception 'FALHOU: esperava 3 itens respondido apos o lote, encontrou %', v_count;
  end if;

  raise notice 'OK: lote de 3 itens grava tudo numa chamada';
end $$;

-- Cenario B: reaplicar faz upsert, nao duplica linha.
do $$
declare
  v_count int;
  v_classificacao public.item_classificacao;
begin
  perform public.apply_classificacao_batch(
    '00000000-0000-0000-0000-000000000010',
    '[{"item_template_id":"00000000-0000-0000-0000-000000000021","classificacao":"medio","observacao":"Revisado"}]'::jsonb
  );

  select count(*), max(classificacao) into v_count, v_classificacao
    from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010'
      and item_template_id = '00000000-0000-0000-0000-000000000021';

  if v_count <> 1 or v_classificacao <> 'medio' then
    raise exception 'FALHOU: upsert deveria ter 1 linha com medio, encontrou % linha(s) / %', v_count, v_classificacao;
  end if;

  raise notice 'OK: reaplicar faz upsert, nao duplica';
end $$;

-- Forca checagem imediata da trigger deferred de RF-16 (migration 00013)
-- pro cenario C conseguir testar o bloqueio dentro desta transacao.
set constraints all immediate;

-- Cenario C: um item do lote marcado ruim sem foto bloqueia O LOTE INTEIRO
-- -- inclusive o item valido que estava no mesmo lote (atomicidade real).
do $$
declare
  v_classificacao_21_antes public.item_classificacao;
  v_classificacao_21_depois public.item_classificacao;
begin
  select classificacao into v_classificacao_21_antes from public.checklist_item_responses
    where item_template_id = '00000000-0000-0000-0000-000000000021'
      and inspection_id = '00000000-0000-0000-0000-000000000010';

  begin
    perform public.apply_classificacao_batch(
      '00000000-0000-0000-0000-000000000010',
      '[
        {"item_template_id":"00000000-0000-0000-0000-000000000021","classificacao":"otimo","observacao":null},
        {"item_template_id":"00000000-0000-0000-0000-000000000022","classificacao":"ruim","observacao":null}
      ]'::jsonb
    );
    raise exception 'FALHOU: item ruim sem foto no lote deveria ter bloqueado tudo';
  exception when check_violation then
    raise notice 'OK: item ruim sem foto bloqueia o lote inteiro (RF-16)';
  end;

  select classificacao into v_classificacao_21_depois from public.checklist_item_responses
    where item_template_id = '00000000-0000-0000-0000-000000000021'
      and inspection_id = '00000000-0000-0000-0000-000000000010';

  if v_classificacao_21_antes <> v_classificacao_21_depois then
    raise exception 'FALHOU: item 21 nao deveria ter mudado (lote inteiro deveria ter sido revertido)';
  end if;

  raise notice 'OK: item valido do lote nao foi salvo quando outro item do mesmo lote falhou (atomicidade)';
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00026_apply_classificacao_batch.test.sql
```

Expected: four `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00026_apply_classificacao_batch.sql supabase/tests/00026_apply_classificacao_batch.test.sql
git commit -m "feat: add apply_classificacao_batch RPC for atomic multi-item writes"
```

---

### Task 4: `deriveSiblingRows` pure function

**Files:**
- Create: `lib/checklist/siblings.ts`
- Test: `lib/checklist/siblings.test.ts`

**Interfaces:**
- Consumes: `ItemResponseRow`, `ItemResponseStatus` (already exported from `lib/checklist/progress.ts`).
- Produces: `type SiblingSourceItem = { id: string; nome: string; grupo_replicacao: string | null }`, `type SiblingRow = { id: string; nome: string; status: ItemResponseStatus; defaultChecked: boolean }`, `deriveSiblingRows(currentItemId: string, items: SiblingSourceItem[], responses: ItemResponseRow[]): SiblingRow[]` — Task 8's page uses this to compute the siblings list passed into the item form.

- [ ] **Step 1: Write the failing test**

```ts
// lib/checklist/siblings.test.ts
import { describe, it, expect } from "vitest";
import { deriveSiblingRows, type SiblingSourceItem } from "./siblings";
import type { ItemResponseRow } from "./progress";

describe("deriveSiblingRows", () => {
  const items: SiblingSourceItem[] = [
    { id: "item-1", nome: "Pneu dianteiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-2", nome: "Pneu dianteiro direito", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-3", nome: "Pneu traseiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-4", nome: "Vidro lateral esquerdo", grupo_replicacao: "vidros-lateral-dianteiro" },
    { id: "item-5", nome: "Marca", grupo_replicacao: null },
  ];

  it("returns an empty list when the current item has no grupo_replicacao", () => {
    expect(deriveSiblingRows("item-5", items, [])).toEqual([]);
  });

  it("returns only items sharing the same grupo_replicacao, excluding self", () => {
    const result = deriveSiblingRows("item-1", items, []);
    expect(result.map((r) => r.id)).toEqual(["item-2", "item-3"]);
  });

  it("defaults checked=true for pending siblings and false for already-answered ones", () => {
    const responses: ItemResponseRow[] = [{ item_template_id: "item-2", status: "respondido" }];
    const result = deriveSiblingRows("item-1", items, responses);

    const item2 = result.find((r) => r.id === "item-2")!;
    const item3 = result.find((r) => r.id === "item-3")!;
    expect(item2.defaultChecked).toBe(false);
    expect(item2.status).toBe("respondido");
    expect(item3.defaultChecked).toBe(true);
    expect(item3.status).toBe("pendente");
  });

  it("returns an empty list when the current item id isn't found", () => {
    expect(deriveSiblingRows("does-not-exist", items, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/checklist/siblings.test.ts
```

Expected: FAIL — `./siblings` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// lib/checklist/siblings.ts
import type { ItemResponseRow, ItemResponseStatus } from "./progress";

export type SiblingSourceItem = { id: string; nome: string; grupo_replicacao: string | null };
export type SiblingRow = { id: string; nome: string; status: ItemResponseStatus; defaultChecked: boolean };

export function deriveSiblingRows(
  currentItemId: string,
  items: SiblingSourceItem[],
  responses: ItemResponseRow[]
): SiblingRow[] {
  const current = items.find((i) => i.id === currentItemId);
  if (!current?.grupo_replicacao) return [];

  const statusByItemId = new Map(responses.map((r) => [r.item_template_id, r.status]));

  return items
    .filter((i) => i.id !== currentItemId && i.grupo_replicacao === current.grupo_replicacao)
    .map((i) => {
      const status = statusByItemId.get(i.id) ?? "pendente";
      return { id: i.id, nome: i.nome, status, defaultChecked: status === "pendente" };
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/checklist/siblings.test.ts
```

Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/checklist/siblings.ts lib/checklist/siblings.test.ts
git commit -m "feat: add deriveSiblingRows for repeated-item cluster lookup"
```

---

### Task 5: `PhotoManager` — unique input id + change callback

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.tsx`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx`

**Interfaces:**
- Produces: `PhotoManager` gains an optional `onPhotosChange?: (photos: Photo[]) => void` prop, and its file input/label pair now use a per-`itemTemplateId` unique `id` instead of the hardcoded `"photoInput"` — Task 7's batch panel renders multiple `PhotoManager` instances on one page and needs both (unique DOM ids so multiple labels/inputs don't collide; the callback so the parent can track each row's live photo count for the RF-16 client-side pre-check).

This task only touches an already-shipped, already-tested component — the point is to prove the change is additive and doesn't regress the single-instance usage in `item-classificacao-form.tsx` / `item-medicao-form.tsx` (which don't need to change, since the new prop is optional and the id change is invisible to label-text-based queries).

- [ ] **Step 1: Write the failing tests**

Add to `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx`, inside the existing `describe("PhotoManager")` block (after the last existing `it`):

```tsx
  it("gives each instance a unique input id so multiple PhotoManagers can render on one page", () => {
    render(
      <>
        <PhotoManager inspectionId="insp-1" itemTemplateId="item-1" initialPhotos={[]} />
        <PhotoManager inspectionId="insp-1" itemTemplateId="item-2" initialPhotos={[]} />
      </>
    );

    const inputs = screen.getAllByLabelText("Foto") as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).not.toBe(inputs[1].id);
  });

  it("calls onPhotosChange with the updated list after a successful upload", async () => {
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/novo.jpg" } });
    attachPhotoAction.mockResolvedValue({ photoId: "photo-2" });
    const onPhotosChange = vi.fn();

    render(
      <PhotoManager
        inspectionId="insp-1"
        itemTemplateId="item-1"
        initialPhotos={[]}
        onPhotosChange={onPhotosChange}
      />
    );

    const file = new File(["conteudo"], "foto.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("Foto") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(onPhotosChange).toHaveBeenCalledWith([{ id: "photo-2", url: "https://example.com/novo.jpg" }])
    );
  });

  it("calls onPhotosChange with the updated list after a successful delete", async () => {
    deletePhotoAction.mockResolvedValue({});
    const onPhotosChange = vi.fn();

    render(
      <PhotoManager
        inspectionId="insp-1"
        itemTemplateId="item-1"
        initialPhotos={[{ id: "photo-1", url: "https://example.com/a.jpg" }]}
        onPhotosChange={onPhotosChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(onPhotosChange).toHaveBeenCalledWith([]));
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx"
```

Expected: the 3 new tests FAIL (duplicate `id="photoInput"` makes `getAllByLabelText` behavior wrong / `onPhotosChange` prop doesn't exist yet); the 3 pre-existing tests still PASS.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { attachPhotoAction, deletePhotoAction } from "./actions";

export type Photo = { id: string; url: string };

function buildPhotoPath(inspectionId: string, itemTemplateId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/${itemTemplateId}/${Date.now()}-${safeName}`;
}

export function PhotoManager({
  inspectionId,
  itemTemplateId,
  initialPhotos,
  onPhotosChange,
}: {
  inspectionId: string;
  itemTemplateId: string;
  initialPhotos: Photo[];
  onPhotosChange?: (photos: Photo[]) => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputId = `photoInput-${itemTemplateId}`;

  function handleUpload(file: File) {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const path = buildPhotoPath(inspectionId, itemTemplateId, file.name);

      const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, file);
      if (uploadError) {
        setError("Não foi possível enviar a foto. Tente novamente.");
        return;
      }

      const { data } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
      const result = await attachPhotoAction(inspectionId, itemTemplateId, data.publicUrl);
      if (result.error || !result.photoId) {
        setError(result.error ?? "Não foi possível anexar a foto.");
        return;
      }

      setPhotos((prev) => {
        const next = [...prev, { id: result.photoId as string, url: data.publicUrl }];
        onPhotosChange?.(next);
        return next;
      });
    });
  }

  function handleDelete(photoId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePhotoAction(photoId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPhotos((prev) => {
        const next = prev.filter((p) => p.id !== photoId);
        onPhotosChange?.(next);
        return next;
      });
    });
  }

  return (
    <div>
      <label htmlFor={inputId}>Foto</label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        disabled={isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      {isPending && <span>A processar...</span>}
      {error && <p role="alert">{error}</p>}
      <ul style={{ listStyle: "none", padding: 0, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {photos.map((photo) => (
          <li key={photo.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" width={120} height={90} style={{ objectFit: "cover" }} />
            <button type="button" onClick={() => handleDelete(photo.id)} disabled={isPending}>
              Excluir
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx"
```

Expected: PASS, all 6 tests green (3 pre-existing + 3 new).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx"
git commit -m "feat: give PhotoManager a unique input id and onPhotosChange callback"
```

---

### Task 6: `applyClassificacaoBatchAction` Server Action

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts`

**Interfaces:**
- Consumes: RPC `apply_classificacao_batch` (Task 3).
- Produces: `type BatchItem = { itemTemplateId: string; classificacao: string; observacao: string | null }`, `applyClassificacaoBatchAction(inspectionId: string, items: BatchItem[]): Promise<{ error?: string }>` — Task 7's `BatchApplyPanel` calls this directly (not a `useActionState`-shaped form action — same style as `attachPhotoAction`/`deletePhotoAction`, called via `startTransition`).

- [ ] **Step 1: Write the failing tests**

Add to `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts`, as a new `describe` block after `describe("saveMeasurementAction", ...)`:

```ts
describe("applyClassificacaoBatchAction", () => {
  it("returns an error without calling the RPC when an item has an invalid classificacao", async () => {
    const { applyClassificacaoBatchAction } = await import("./actions");

    const result = await applyClassificacaoBatchAction("insp-1", [
      { itemTemplateId: "item-1", classificacao: "otimo", observacao: null },
      { itemTemplateId: "item-2", classificacao: "nao-e-valido", observacao: null },
    ]);

    expect(result.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with the mapped batch payload on success", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { applyClassificacaoBatchAction } = await import("./actions");

    const result = await applyClassificacaoBatchAction("insp-1", [
      { itemTemplateId: "item-1", classificacao: "otimo", observacao: "Sem avarias" },
      { itemTemplateId: "item-2", classificacao: "medio", observacao: null },
    ]);

    expect(result).toEqual({});
    expect(rpc).toHaveBeenCalledWith("apply_classificacao_batch", {
      p_inspection_id: "insp-1",
      p_items: [
        { item_template_id: "item-1", classificacao: "otimo", observacao: "Sem avarias" },
        { item_template_id: "item-2", classificacao: "medio", observacao: null },
      ],
    });
  });

  it("returns a friendly message when the DB rejects a 'ruim' item without a photo", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { applyClassificacaoBatchAction } = await import("./actions");

    const result = await applyClassificacaoBatchAction("insp-1", [
      { itemTemplateId: "item-1", classificacao: "ruim", observacao: null },
    ]);

    expect(result.error).toMatch(/foto/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
```

Expected: the 3 new tests FAIL (`applyClassificacaoBatchAction` isn't exported yet); all pre-existing tests still PASS.

- [ ] **Step 3: Write the implementation**

Add to `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts` (after `saveMeasurementAction`, end of file):

```ts
export type BatchItem = { itemTemplateId: string; classificacao: string; observacao: string | null };

export async function applyClassificacaoBatchAction(
  inspectionId: string,
  items: BatchItem[]
): Promise<{ error?: string }> {
  if (items.some((i) => !ITEM_CLASSIFICACOES.includes(i.classificacao as ItemClassificacao))) {
    return { error: "Classificação inválida em um dos itens do lote." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_classificacao_batch", {
    p_inspection_id: inspectionId,
    p_items: items.map((i) => ({
      item_template_id: i.itemTemplateId,
      classificacao: i.classificacao,
      observacao: i.observacao,
    })),
  });

  if (error) {
    console.error("applyClassificacaoBatchAction failed", error);
    return {
      error: friendlyDbError(
        error,
        "Um dos itens marcados como 'ruim' precisa de pelo menos 1 foto anexada. Anexe a foto e confirme de novo."
      ),
    };
  }

  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
```

Expected: PASS, all tests green (pre-existing + 3 new).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
git commit -m "feat: add applyClassificacaoBatchAction Server Action"
```

---

### Task 7: `BatchApplyPanel` client component

**Files:**
- Create: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.tsx`
- Create: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx`

**Interfaces:**
- Consumes: `applyClassificacaoBatchAction` (Task 6), `PhotoManager` / `type Photo` (Task 5).
- Produces: `type BatchRow = { itemTemplateId: string; nome: string; classificacao: string; observacao: string; photos: Photo[] }`, `BatchApplyPanel({ inspectionId, groupListUrl, initialRows, onCancel }: {...})` — Task 8's `ItemClassificacaoForm` renders this in place of the normal form when the técnico clicks "Aplicar aos selecionados".

- [ ] **Step 1: Write the failing test**

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BatchApplyPanel } from "./batch-apply-panel";

const applyClassificacaoBatchAction = vi.fn();
vi.mock("./actions", () => ({
  applyClassificacaoBatchAction: (...args: unknown[]) => applyClassificacaoBatchAction(...args),
  attachPhotoAction: vi.fn(),
  deletePhotoAction: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) } }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  applyClassificacaoBatchAction.mockReset();
  push.mockClear();
});

const rowA = { itemTemplateId: "item-1", nome: "Pneu A", classificacao: "otimo", observacao: "Sem avarias", photos: [] };
const rowB = { itemTemplateId: "item-2", nome: "Pneu B", classificacao: "otimo", observacao: "Sem avarias", photos: [] };

describe("BatchApplyPanel", () => {
  it("renders one fieldset per row, pre-filled", () => {
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA, rowB]} onCancel={() => {}} />
    );

    expect(screen.getByText("Pneu A")).toBeInTheDocument();
    expect(screen.getByText("Pneu B")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Sem avarias")).toHaveLength(2);
  });

  it("blocks confirmation and names the row when a 'ruim' row has no photo, without calling the action", () => {
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByLabelText("Ruim"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Pneu A/);
    expect(applyClassificacaoBatchAction).not.toHaveBeenCalled();
  });

  it("submits the batch and navigates to groupListUrl on success", async () => {
    applyClassificacaoBatchAction.mockResolvedValue({});

    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA, rowB]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() =>
      expect(applyClassificacaoBatchAction).toHaveBeenCalledWith("insp-1", [
        { itemTemplateId: "item-1", classificacao: "otimo", observacao: "Sem avarias" },
        { itemTemplateId: "item-2", classificacao: "otimo", observacao: "Sem avarias" },
      ])
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/x"));
  });

  it("shows the action's error message and does not navigate on failure", async () => {
    applyClassificacaoBatchAction.mockResolvedValue({ error: "Não foi possível guardar." });

    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível guardar."));
    expect(push).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const onCancel = vi.fn();
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA]} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"
```

Expected: FAIL — `./batch-apply-panel` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyClassificacaoBatchAction } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";

const CLASSIFICACOES = [
  { value: "otimo", label: "Ótimo" },
  { value: "medio", label: "Médio" },
  { value: "ruim", label: "Ruim" },
  { value: "NF", label: "Não se aplica (NF)" },
] as const;

export type BatchRow = {
  itemTemplateId: string;
  nome: string;
  classificacao: string;
  observacao: string;
  photos: Photo[];
};

export function BatchApplyPanel({
  inspectionId,
  groupListUrl,
  initialRows,
  onCancel,
}: {
  inspectionId: string;
  groupListUrl: string;
  initialRows: BatchRow[];
  onCancel: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<BatchRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(itemTemplateId: string, patch: Partial<BatchRow>) {
    setRows((prev) => prev.map((r) => (r.itemTemplateId === itemTemplateId ? { ...r, ...patch } : r)));
  }

  function handleConfirm() {
    setError(null);

    const missingFoto = rows.filter((r) => r.classificacao === "ruim" && r.photos.length === 0);
    if (missingFoto.length > 0) {
      setError(`Anexe pelo menos 1 foto antes de confirmar: ${missingFoto.map((r) => r.nome).join(", ")}.`);
      return;
    }

    const nfCount = rows.filter((r) => r.classificacao === "NF").length;
    if (nfCount > 0) {
      const confirmed = window.confirm(
        `${nfCount} item(ns) será(ão) marcado(s) como Não se aplica (NF). Confirma?`
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const result = await applyClassificacaoBatchAction(
        inspectionId,
        rows.map((r) => ({
          itemTemplateId: r.itemTemplateId,
          classificacao: r.classificacao,
          observacao: r.observacao || null,
        }))
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      router.push(groupListUrl);
    });
  }

  return (
    <div>
      <h2>Aplicar aos selecionados</h2>
      {rows.map((row) => (
        <fieldset key={row.itemTemplateId}>
          <legend>{row.nome}</legend>

          {CLASSIFICACOES.map((c) => (
            <label key={c.value}>
              <input
                type="radio"
                name={`classificacao-${row.itemTemplateId}`}
                value={c.value}
                checked={row.classificacao === c.value}
                onChange={() => updateRow(row.itemTemplateId, { classificacao: c.value })}
              />
              {c.label}
            </label>
          ))}

          <label htmlFor={`observacao-${row.itemTemplateId}`}>Observação</label>
          <textarea
            id={`observacao-${row.itemTemplateId}`}
            value={row.observacao}
            onChange={(e) => updateRow(row.itemTemplateId, { observacao: e.target.value })}
          />

          <PhotoManager
            inspectionId={inspectionId}
            itemTemplateId={row.itemTemplateId}
            initialPhotos={row.photos}
            onPhotosChange={(photos) => updateRow(row.itemTemplateId, { photos })}
          />
        </fieldset>
      ))}

      {error && <p role="alert">{error}</p>}

      <button type="button" onClick={handleConfirm} disabled={isPending}>
        Confirmar aplicação
      </button>
      <button type="button" onClick={onCancel} disabled={isPending}>
        Cancelar
      </button>
    </div>
  );
}
```

Note: the radio labels use `label` text matching the classification (`"Ruim"`, etc.) so `screen.getByLabelText("Ruim")` in the test resolves to the first row's radio (only one row in that specific test case). When multiple rows render, tests that need a specific row's radio should scope with `within(screen.getByText("Pneu A").closest("fieldset")!)` — not needed by the tests specified above since each of those renders only the rows it needs to disambiguate.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"
```

Expected: PASS, all 5 tests green.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"
git commit -m "feat: add BatchApplyPanel for reviewing and confirming a cluster batch"
```

---

### Task 8: Wire siblings + batch panel into the item page

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx`

**Interfaces:**
- Consumes: `deriveSiblingRows`, `type SiblingRow` (Task 4); `BatchApplyPanel`, `type BatchRow` (Task 7).
- Produces: the wired page — no other task consumes this directly. No dedicated test for `page.tsx` (Global Constraints — pure fetch-and-render); `item-classificacao-form.tsx` also stays untested directly (its new branching logic — sibling toggling, entering/leaving batch mode — is thin glue over `BatchApplyPanel`, which Task 7 already tests; the form's pre-existing save flow is unchanged).

- [ ] **Step 1: Update `page.tsx`**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx`:

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria, findNextItemId } from "@/lib/checklist/progress";
import { deriveSiblingRows } from "@/lib/checklist/siblings";
import { ItemClassificacaoForm } from "./item-classificacao-form";
import { ItemMedicaoForm } from "./item-medicao-form";

export default async function ChecklistItemPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string; itemId: string }>;
}) {
  const { id, groupId, itemId } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("checklist_item_templates")
    .select("id, nome, tipo, qtd_pontos_medicao, observacoes, grupo_replicacao")
    .eq("id", itemId)
    .eq("group_id", groupId)
    .single();

  if (!item) notFound();

  const [{ data: response }, { data: groupItems, error: groupItemsError }, { data: groupResponses }] =
    await Promise.all([
      supabase
        .from("checklist_item_responses")
        .select("id, classificacao, observacao")
        .eq("inspection_id", id)
        .eq("item_template_id", itemId)
        .maybeSingle(),
      supabase
        .from("checklist_item_templates")
        .select("id, subcategoria, nome, grupo_replicacao")
        .eq("group_id", groupId),
      supabase.from("checklist_item_responses").select("item_template_id, status").eq("inspection_id", id),
    ]);

  if (groupItemsError) {
    console.error("checklist item page group fetch failed", groupItemsError);
  }

  let photos: { id: string; url: string }[] = [];
  let valoresUm: number[] = [];

  if (response) {
    const [{ data: photoRows }, { data: measurement }] = await Promise.all([
      supabase.from("photos").select("id, url").eq("item_response_id", response.id).eq("contexto", "item"),
      item.tipo === "medicao"
        ? supabase.from("paint_measurements").select("valores_um").eq("item_response_id", response.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    photos = photoRows ?? [];
    valoresUm = measurement?.valores_um ?? [];
  }

  const subcategorias = groupItemsBySubcategoria(groupItems ?? [], []);
  const nextItemId = findNextItemId(subcategorias, itemId);
  const groupListUrl = `/inspections/${id}/checklist/${groupId}`;
  const nextUrl = nextItemId ? `/inspections/${id}/checklist/${groupId}/${nextItemId}` : groupListUrl;

  const siblings = deriveSiblingRows(itemId, groupItems ?? [], groupResponses ?? []);

  return (
    <div>
      <h1>{item.nome}</h1>
      {item.observacoes && <p>{item.observacoes}</p>}
      {item.tipo === "medicao" ? (
        <ItemMedicaoForm
          inspectionId={id}
          itemTemplateId={itemId}
          nextUrl={nextUrl}
          qtdPontos={item.qtd_pontos_medicao as number}
          initialValores={valoresUm}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
        />
      ) : (
        <ItemClassificacaoForm
          inspectionId={id}
          itemTemplateId={itemId}
          nome={item.nome}
          nextUrl={nextUrl}
          groupListUrl={groupListUrl}
          initialClassificacao={response?.classificacao ?? null}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
          siblings={siblings}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `item-classificacao-form.tsx`**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx`:

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx
"use client";

import { useActionState, useState, type FormEvent } from "react";
import { saveClassificacaoAction, type SaveClassificacaoState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";
import { BatchApplyPanel, type BatchRow } from "./batch-apply-panel";
import type { SiblingRow } from "@/lib/checklist/siblings";

const CLASSIFICACOES = [
  { value: "otimo", label: "Ótimo" },
  { value: "medio", label: "Médio" },
  { value: "ruim", label: "Ruim" },
  { value: "NF", label: "Não se aplica (NF)" },
] as const;

const initialState: SaveClassificacaoState = { status: "idle" };

export function ItemClassificacaoForm({
  inspectionId,
  itemTemplateId,
  nome,
  nextUrl,
  groupListUrl,
  initialClassificacao,
  initialObservacao,
  initialPhotos,
  siblings,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nome: string;
  nextUrl: string;
  groupListUrl: string;
  initialClassificacao: string | null;
  initialObservacao: string | null;
  initialPhotos: Photo[];
  siblings: SiblingRow[];
}) {
  const [state, formAction] = useActionState(saveClassificacaoAction, initialState);
  const [classificacao, setClassificacao] = useState(initialClassificacao ?? "");
  const [observacao, setObservacao] = useState(initialObservacao ?? "");
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedSiblings, setSelectedSiblings] = useState<Set<string>>(
    new Set(siblings.filter((s) => s.defaultChecked).map((s) => s.id))
  );
  const [showBatchPanel, setShowBatchPanel] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (classificacao === "NF") {
      const confirmed = window.confirm("Confirma marcar este item como Não se aplica (NF)?");
      if (!confirmed) e.preventDefault();
    }
  }

  function toggleSibling(id: string) {
    setSelectedSiblings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (showBatchPanel) {
    const initialRows: BatchRow[] = [
      { itemTemplateId, nome, classificacao, observacao, photos },
      ...siblings
        .filter((s) => selectedSiblings.has(s.id))
        .map((s) => ({ itemTemplateId: s.id, nome: s.nome, classificacao, observacao, photos: [] as Photo[] })),
    ];

    return (
      <BatchApplyPanel
        inspectionId={inspectionId}
        groupListUrl={groupListUrl}
        initialRows={initialRows}
        onCancel={() => setShowBatchPanel(false)}
      />
    );
  }

  return (
    <form action={formAction} onSubmit={handleSubmit}>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />
      <input type="hidden" name="nextUrl" value={nextUrl} />

      <fieldset>
        <legend>Classificação</legend>
        {CLASSIFICACOES.map((c) => (
          <label key={c.value}>
            <input
              type="radio"
              name="classificacao"
              value={c.value}
              checked={classificacao === c.value}
              onChange={() => setClassificacao(c.value)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>

      <label htmlFor="observacao">Observação</label>
      <textarea
        id="observacao"
        name="observacao"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
      />

      <PhotoManager
        inspectionId={inspectionId}
        itemTemplateId={itemTemplateId}
        initialPhotos={initialPhotos}
        onPhotosChange={setPhotos}
      />

      {state.status === "error" && <p role="alert">{state.message}</p>}

      <button type="submit">Salvar e próximo</button>

      {siblings.length > 0 && (
        <fieldset>
          <legend>Este item se repete em</legend>
          {siblings.map((s) => (
            <label key={s.id}>
              <input type="checkbox" checked={selectedSiblings.has(s.id)} onChange={() => toggleSibling(s.id)} />
              {s.nome}
              {s.status !== "pendente" && ` (já respondido: ${s.status})`}
            </label>
          ))}
          <button
            type="button"
            disabled={!classificacao || selectedSiblings.size === 0}
            onClick={() => setShowBatchPanel(true)}
          >
            Aplicar aos selecionados
          </button>
        </fieldset>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Run the full suite to confirm no regression**

```bash
npm test
```

Expected: all test files pass, including the pre-existing tests for `item-classificacao-form.tsx`'s consumers and every test added in Tasks 4-7.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx"
git commit -m "feat: wire siblings checklist and batch apply panel into the item page"
```

---

### Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all test files pass, including every test added in Tasks 4-7.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
npx next build
```

Expected: build succeeds (no route changes — same `/inspections/[id]/checklist/[groupId]/[itemId]` route as Fase 2).

- [ ] **Step 4: Manual browser verification**

Using the técnico test account (`teste@checkauto.pt`), drive the full flow: open an inspection → checklist → a group with a clustered item (e.g. "Pneus e Rodas") → open one of the 4 "Pneu ... - estado geral" items → set classificação → confirm the "Este item se repete em" section lists the other 3 with checkboxes pre-checked (since none are answered yet) → click "Aplicar aos selecionados" → confirm the batch panel shows all 4 rows pre-filled → try "Confirmar aplicação" with one row set to `ruim` and no photo (expect the client-side block naming that row) → attach a photo to that row → confirm again (expect success, redirect to the group list, and the group list showing all 4 pneu items as ✅) → revisit one of the pneu items directly and confirm its value persisted → open a different clustered item, answer only one sibling manually first, then verify that sibling defaults to **unchecked** with the "já respondido" note when opening the source item's siblings section.

- [ ] **Step 5: Note completion**

No commit in this task — verification only. If Step 4 surfaces a bug, fix it as part of the task where the bug originated (a follow-up fix commit on that task), not here.
