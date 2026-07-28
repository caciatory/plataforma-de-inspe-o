# Histórico e Equipamentos (Peça 3, recorte 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preencher as abas Histórico e Equipamentos do formulário de nova inspeção com campos reais, e remover do checklist os itens que ficaram duplicados pela nova aba Equipamentos.

**Architecture:** Histórico vira colunas novas em `vehicle_data` (mesma tabela 1:1-por-inspeção já usada por Identificação/Especificações). Equipamentos usa um catálogo fixo em TypeScript (não DB), mais 3 tabelas novas (`equipamento_sugestoes` global, `equipamento_inspecao` e `equipamento_fotos` por inspeção). Tudo continua sendo preenchido no mesmo formulário de criação de uma página só (`new-inspection-form.tsx`); nada é salvo até o clique em "Guardar" — inclusive fotos de equipamento, que ficam como `<input type="file">` nativos dentro do próprio `<form>` (sem upload assíncrono) e só sobem pro Storage dentro da Server Action, depois que a inspeção e os equipamentos já existem no banco. O checklist (`docs/data/checklist-inspecta-v7.md`) perde os itens agora cobertos pela nova aba, via o mesmo mecanismo de regeneração já usado no recorte anterior (script Python reescreve a migration de seed).

**Tech Stack:** Next.js 15 / React 19 (Server Actions, `useActionState`), Zod, Supabase (Postgres + Storage), Vitest + Testing Library, Python 3.9+ stdlib (gerador do seed do checklist).

## Global Constraints

- Spec aprovado: `docs/superpowers/specs/2026-07-28-peca3-recorte3-historico-equipamentos-design.md`. Toda decisão de escopo já está fechada lá — não reabrir.
- Working directory correto: `~/Desktop/bild app` (nunca `/Volumes/KINGSTON/...`).
- Migrations no banco remoto via `supabase db push --db-url "$DATABASE_URL"` (sem Docker local). Testes SQL via `psql "$DATABASE_URL" -f arquivo.test.sql`. Conectar antes com `export PATH="/opt/homebrew/opt/libpq/bin:$PATH" && set -a && source .env.local && set +a`. Se `db push` reclamar de migration já aplicada, usar `supabase migration repair <versão> --status reverted --db-url "$DATABASE_URL"` antes de tentar de novo (ver memória `reference-db-connection-inspecta`).
- `npm test` roda a suíte Vitest inteira (`vitest run`).
- Nomes de coluna/tabela em português, minúsculo, snake_case — segue o padrão de todo o schema existente.
- Nenhuma foto é comprimida antes do upload (mesmo comportamento do `PhotoManager` existente).
- Não editar `supabase/migrations/00037_seed_checklist_v7.sql` à mão — só via `scripts/generate_checklist_seed_v7.py`.

---

### Task 1: Migração — colunas de Histórico em `vehicle_data` + parâmetros novos no RPC `create_inspection`

**Files:**
- Create: `supabase/migrations/00038_historico_veiculo.sql`
- Test: `supabase/tests/00038_historico_veiculo.test.sql`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: colunas `vehicle_data.indicios_adulteracao_km`, `.numero_proprietarios_anteriores`, `.registo_acidentes_anteriores`, `.historico_manutencao`, `.inspecoes_periodicas_ipo_notas`, `.inspecoes_periodicas_ipo_data`, `.situacao_fiscal_regular`, `.situacao_fiscal_observacoes`. RPC `create_inspection` ganha os parâmetros `p_indicios_adulteracao_km text default null`, `p_numero_proprietarios_anteriores int default null`, `p_registo_acidentes_anteriores text default null`, `p_historico_manutencao text default null`, `p_inspecoes_periodicas_ipo_notas text default null`, `p_inspecoes_periodicas_ipo_data date default null`, `p_situacao_fiscal_regular boolean default false`, `p_situacao_fiscal_observacoes text default null` — mesmo tipo de retorno (`uuid`), assinatura anterior preservada por trás de defaults (Task 2/lib/inspection consome esses nomes).

- [ ] **Step 1: Escrever a migração**

```sql
-- supabase/migrations/00038_historico_veiculo.sql
-- Peça 3, recorte 3 — campos da aba Histórico. `quilometragem` já existe
-- (migração 00019); só muda de aba na UI, não de coluna.
-- Design: docs/superpowers/specs/2026-07-28-peca3-recorte3-historico-equipamentos-design.md §3

alter table public.vehicle_data
  add column indicios_adulteracao_km text,
  add column numero_proprietarios_anteriores int,
  add column registo_acidentes_anteriores text,
  add column historico_manutencao text,
  add column inspecoes_periodicas_ipo_notas text,
  add column inspecoes_periodicas_ipo_data date,
  add column situacao_fiscal_regular boolean not null default false,
  add column situacao_fiscal_observacoes text,
  add constraint numero_proprietarios_nao_negativo
    check (numero_proprietarios_anteriores is null or numero_proprietarios_anteriores >= 0);

drop function public.create_inspection(
  public.tipo_cliente, public.objetivo_inspecao, text, text, text, text,
  int, text, int, int, text, text, text, int, text, text, text, int, numeric,
  text, text, text
);

create function public.create_inspection(
  p_tipo_cliente public.tipo_cliente,
  p_objetivo public.objetivo_inspecao,
  p_matricula text,
  p_marca text,
  p_modelo text,
  p_nome_solicitante text,
  p_quilometragem int,
  p_versao_trim text default null,
  p_ano_fabrico int default null,
  p_ano_modelo int default null,
  p_cor text default null,
  p_vin text default null,
  p_numero_motor text default null,
  p_numero_portas int default null,
  p_combustivel text default null,
  p_caixa_velocidades text default null,
  p_tracao text default null,
  p_potencia_cv int default null,
  p_torque_nm numeric default null,
  p_contacto text default null,
  p_email text default null,
  p_responsavel_presente text default null,
  p_indicios_adulteracao_km text default null,
  p_numero_proprietarios_anteriores int default null,
  p_registo_acidentes_anteriores text default null,
  p_historico_manutencao text default null,
  p_inspecoes_periodicas_ipo_notas text default null,
  p_inspecoes_periodicas_ipo_data date default null,
  p_situacao_fiscal_regular boolean default false,
  p_situacao_fiscal_observacoes text default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_inspection_id uuid;
begin
  insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
  values ((select auth.uid()), p_tipo_cliente, p_objetivo)
  returning id into v_inspection_id;

  insert into public.vehicle_data (
    inspection_id, matricula, marca, modelo, versao_trim, ano_fabrico, ano_modelo,
    cor, vin, numero_motor, numero_portas, combustivel, caixa_velocidades, tracao,
    potencia_cv, torque_nm, quilometragem,
    indicios_adulteracao_km, numero_proprietarios_anteriores, registo_acidentes_anteriores,
    historico_manutencao, inspecoes_periodicas_ipo_notas, inspecoes_periodicas_ipo_data,
    situacao_fiscal_regular, situacao_fiscal_observacoes
  ) values (
    v_inspection_id, p_matricula, p_marca, p_modelo, p_versao_trim, p_ano_fabrico, p_ano_modelo,
    p_cor, p_vin, p_numero_motor, p_numero_portas, p_combustivel, p_caixa_velocidades, p_tracao,
    p_potencia_cv, p_torque_nm, p_quilometragem,
    p_indicios_adulteracao_km, p_numero_proprietarios_anteriores, p_registo_acidentes_anteriores,
    p_historico_manutencao, p_inspecoes_periodicas_ipo_notas, p_inspecoes_periodicas_ipo_data,
    p_situacao_fiscal_regular, p_situacao_fiscal_observacoes
  );

  insert into public.client_data (
    inspection_id, nome_solicitante, tipo, contacto, email, responsavel_presente
  ) values (
    v_inspection_id, p_nome_solicitante, p_tipo_cliente, p_contacto, p_email, p_responsavel_presente
  );

  return v_inspection_id;
end;
$$;
```

- [ ] **Step 2: Escrever o teste SQL**

```sql
-- supabase/tests/00038_historico_veiculo.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'tecnicoB@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000031', 'Tecnico B', 'tecnicoB@test.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000031';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000031"}';

do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular',
    p_objetivo => 'compra',
    p_matricula => 'BB-22-CC',
    p_marca => 'Honda',
    p_modelo => 'Civic',
    p_nome_solicitante => 'Cliente B',
    p_quilometragem => 80000,
    p_indicios_adulteracao_km => 'Contador com dígitos desalinhados',
    p_numero_proprietarios_anteriores => 2,
    p_registo_acidentes_anteriores => 'Colisão traseira em 2022, reparada',
    p_historico_manutencao => 'Revisão dos 60.000km em concessionário',
    p_inspecoes_periodicas_ipo_notas => 'IPO válida',
    p_inspecoes_periodicas_ipo_data => '2027-01-15',
    p_situacao_fiscal_regular => true,
    p_situacao_fiscal_observacoes => 'IUC pago'
  );

  select * into v_row from public.vehicle_data where inspection_id = v_id;

  if v_row.quilometragem <> 80000 then
    raise exception 'FALHOU: quilometragem deveria ser 80000, foi %', v_row.quilometragem;
  end if;
  if v_row.numero_proprietarios_anteriores <> 2 then
    raise exception 'FALHOU: numero_proprietarios_anteriores deveria ser 2, foi %', v_row.numero_proprietarios_anteriores;
  end if;
  if v_row.situacao_fiscal_regular is not true then
    raise exception 'FALHOU: situacao_fiscal_regular deveria ser true';
  end if;
  if v_row.indicios_adulteracao_km <> 'Contador com dígitos desalinhados' then
    raise exception 'FALHOU: indicios_adulteracao_km incorreto';
  end if;

  raise notice 'OK: create_inspection grava os campos de historico';
end $$;

-- default: situacao_fiscal_regular fica false quando omitido, resto null
do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'CC-33-DD',
    p_marca => 'Fiat', p_modelo => 'Punto', p_nome_solicitante => 'Cliente C', p_quilometragem => 1000
  );
  select * into v_row from public.vehicle_data where inspection_id = v_id;
  if v_row.situacao_fiscal_regular is not false then
    raise exception 'FALHOU: default de situacao_fiscal_regular deveria ser false';
  end if;
  if v_row.numero_proprietarios_anteriores is not null then
    raise exception 'FALHOU: numero_proprietarios_anteriores deveria ficar null quando omitido';
  end if;
  raise notice 'OK: defaults de historico aplicados quando campos omitidos';
end $$;

-- constraint: numero_proprietarios_anteriores negativo falha
do $$
begin
  begin
    perform public.create_inspection(
      p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'DD-44-EE',
      p_marca => 'Seat', p_modelo => 'Ibiza', p_nome_solicitante => 'Cliente D', p_quilometragem => 1000,
      p_numero_proprietarios_anteriores => -1
    );
    raise exception 'FALHOU: deveria ter rejeitado numero_proprietarios_anteriores negativo';
  exception
    when check_violation then
      raise notice 'OK: numero_proprietarios_anteriores negativo rejeitado pela constraint';
  end;
end $$;

rollback;
```

- [ ] **Step 3: Aplicar e rodar**

Run: `set -a && source .env.local && set +a && supabase db push --db-url "$DATABASE_URL"`
Run: `psql "$DATABASE_URL" -f supabase/tests/00038_historico_veiculo.test.sql`
Expected: três `NOTICE: OK: ...`, nenhum `ERROR`.

- [ ] **Step 4: Confirmar que os testes existentes do RPC continuam passando**

Run: `psql "$DATABASE_URL" -f supabase/tests/00017_fase1a_create_inspection.test.sql && psql "$DATABASE_URL" -f supabase/tests/00019_add_vehicle_quilometragem.test.sql`
Expected: PASS sem mudança — os novos parâmetros têm defaults, chamadas antigas continuam válidas.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00038_historico_veiculo.sql supabase/tests/00038_historico_veiculo.test.sql
git commit -m "feat: add Histórico fields to vehicle_data and create_inspection RPC"
```

---

### Task 2: Aba Histórico — UI, schema Zod, mapeamento de aba, Server Action

**Files:**
- Create: `app/(app)/inspections/new/textarea-with-counter.tsx`
- Test: `app/(app)/inspections/new/textarea-with-counter.test.tsx`
- Modify: `lib/inspection/schema.ts`
- Modify: `lib/inspection/schema.test.ts`
- Modify: `lib/inspection/tabs.ts`
- Modify: `lib/inspection/tabs.test.ts`
- Modify: `app/(app)/inspections/new/actions.ts`
- Modify: `app/(app)/inspections/new/actions.test.ts`
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx`
- Modify: `app/(app)/inspections/new/new-inspection-form.test.tsx`

**Interfaces:**
- Consumes: nada de outras tasks (Task 1 já forneceu as colunas/RPC).
- Produces: componente `TextareaWithCounter({ id, name, label, value, onChange, maxSoft }: { id: string; name: string; label: string; value: string; onChange: (v: string) => void; maxSoft: number })` — Task 5 (Equipamentos) não depende dele, mas é o único componente novo compartilhável desta task.

- [ ] **Step 1: Teste do `TextareaWithCounter`**

```tsx
// app/(app)/inspections/new/textarea-with-counter.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextareaWithCounter } from "./textarea-with-counter";

describe("TextareaWithCounter", () => {
  it("does not show a counter under the soft limit", () => {
    render(
      <TextareaWithCounter id="notas" name="notas" label="Notas" value="pouco texto" onChange={() => {}} maxSoft={500} />
    );
    expect(screen.queryByText(/caracteres/)).not.toBeInTheDocument();
  });

  it("shows a character count once the value passes the soft limit", () => {
    const longValue = "a".repeat(501);
    render(
      <TextareaWithCounter id="notas" name="notas" label="Notas" value={longValue} onChange={() => {}} maxSoft={500} />
    );
    expect(screen.getByText("501 caracteres")).toBeInTheDocument();
  });

  it("calls onChange with the new value", () => {
    let value = "";
    const { rerender } = render(
      <TextareaWithCounter id="notas" name="notas" label="Notas" value={value} onChange={(v) => (value = v)} maxSoft={500} />
    );
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "novo texto" } });
    expect(value).toBe("novo texto");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- textarea-with-counter`
Expected: FAIL — `Cannot find module './textarea-with-counter'`

- [ ] **Step 3: Implementar o componente**

```tsx
// app/(app)/inspections/new/textarea-with-counter.tsx
"use client";

export function TextareaWithCounter({
  id,
  name,
  label,
  value,
  onChange,
  maxSoft,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxSoft: number;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        className="input"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value.length > maxSoft && <p className="hint">{value.length} caracteres</p>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- textarea-with-counter`
Expected: PASS (3 testes)

- [ ] **Step 5: Estender o schema Zod**

Modify `lib/inspection/schema.ts` — adicionar ao `inspectionFormSchema` (antes do `.refine`):

```ts
    indiciosAdulteracaoKm: z.string().optional(),
    numeroProprietariosAnteriores: optionalInt,
    registoAcidentesAnteriores: z.string().optional(),
    historicoManutencao: z.string().optional(),
    inspecoesPeriodicasIpoNotas: z.string().optional(),
    inspecoesPeriodicasIpoData: z.string().optional(),
    situacaoFiscalRegular: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
    situacaoFiscalObservacoes: z.string().optional(),
```

`optionalInt` já existe no arquivo (usado por `anoFabrico`) e rejeita negativo? Não — adicionar checagem: usar `optionalInt.pipe(z.number().int().min(0).optional())` não funciona direto com preprocess; em vez disso, declarar localmente:

```ts
const optionalNonNegativeInt = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).optional());
```

e usar `optionalNonNegativeInt` para `numeroProprietariosAnteriores` no lugar de `optionalInt`.

- [ ] **Step 6: Teste do schema**

Adicionar a `lib/inspection/schema.test.ts` (seguir o padrão dos testes existentes de `anoFabrico`/`quilometragem` no arquivo):

```ts
  it("rejects a negative numeroProprietariosAnteriores", () => {
    const result = inspectionFormSchema.safeParse({
      ...validBase,
      numeroProprietariosAnteriores: "-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts historico fields left blank", () => {
    const result = inspectionFormSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("coerces situacaoFiscalRegular checkbox value 'on' to true", () => {
    const result = inspectionFormSchema.safeParse({ ...validBase, situacaoFiscalRegular: "on" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.situacaoFiscalRegular).toBe(true);
  });
```

(`validBase` é o objeto de fixture já usado no arquivo — se o arquivo não tiver um, usar o mesmo conjunto de campos obrigatórios do teste "calls create_inspection" em `actions.test.ts`.)

- [ ] **Step 7: Rodar e confirmar sucesso**

Run: `npm test -- schema`
Expected: PASS

- [ ] **Step 8: Mapear campos novos pra aba Histórico**

Modify `lib/inspection/tabs.ts` — remover `quilometragem: "identificacao"` e adicionar ao `FIELD_TO_TAB`:

```ts
  quilometragem: "historico",
  indiciosAdulteracaoKm: "historico",
  numeroProprietariosAnteriores: "historico",
  registoAcidentesAnteriores: "historico",
  historicoManutencao: "historico",
  inspecoesPeriodicasIpoNotas: "historico",
  inspecoesPeriodicasIpoData: "historico",
  situacaoFiscalRegular: "historico",
  situacaoFiscalObservacoes: "historico",
```

- [ ] **Step 9: Teste do mapeamento**

Adicionar a `lib/inspection/tabs.test.ts`:

```ts
  it("maps quilometragem to historico, not identificacao", () => {
    expect(resolveTabForField("quilometragem")).toBe("historico");
  });

  it("maps every historico field to the historico tab", () => {
    for (const field of [
      "indiciosAdulteracaoKm",
      "numeroProprietariosAnteriores",
      "registoAcidentesAnteriores",
      "historicoManutencao",
      "inspecoesPeriodicasIpoNotas",
      "inspecoesPeriodicasIpoData",
      "situacaoFiscalRegular",
      "situacaoFiscalObservacoes",
    ]) {
      expect(resolveTabForField(field)).toBe("historico");
    }
  });
```

- [ ] **Step 10: Rodar e confirmar sucesso**

Run: `npm test -- tabs`
Expected: PASS

- [ ] **Step 11: Repassar os novos campos na Server Action**

Modify `app/(app)/inspections/new/actions.ts` — dentro de `createInspectionAction`, no objeto passado a `supabase.rpc("create_inspection", {...})`, adicionar:

```ts
    p_indicios_adulteracao_km: v.indiciosAdulteracaoKm || null,
    p_numero_proprietarios_anteriores: v.numeroProprietariosAnteriores ?? null,
    p_registo_acidentes_anteriores: v.registoAcidentesAnteriores || null,
    p_historico_manutencao: v.historicoManutencao || null,
    p_inspecoes_periodicas_ipo_notas: v.inspecoesPeriodicasIpoNotas || null,
    p_inspecoes_periodicas_ipo_data: v.inspecoesPeriodicasIpoData || null,
    p_situacao_fiscal_regular: v.situacaoFiscalRegular,
    p_situacao_fiscal_observacoes: v.situacaoFiscalObservacoes || null,
```

- [ ] **Step 12: Teste da action**

Adicionar a `app/(app)/inspections/new/actions.test.ts`, no `formData` do teste "calls create_inspection with mapped params and redirects on success":

```ts
    formData.set("numeroProprietariosAnteriores", "3");
    formData.set("situacaoFiscalRegular", "on");
```

e no `expect.objectContaining`:

```ts
        p_numero_proprietarios_anteriores: 3,
        p_situacao_fiscal_regular: true,
```

- [ ] **Step 13: Rodar e confirmar sucesso**

Run: `npm test -- actions`
Expected: PASS

- [ ] **Step 14: UI — mover quilometragem, adicionar aba Histórico**

Modify `app/(app)/inspections/new/new-inspection-form.tsx`:

1. Adicionar estados: `indiciosAdulteracaoKm`, `numeroProprietariosAnteriores`, `registoAcidentesAnteriores`, `historicoManutencao`, `inspecoesPeriodicasIpoNotas`, `inspecoesPeriodicasIpoData`, `situacaoFiscalRegular` (boolean, default `false`), `situacaoFiscalObservacoes` — todos `useState`, mesmo padrão dos demais campos.
2. Importar `TextareaWithCounter` de `./textarea-with-counter`.
3. Remover o bloco `<div className="field">` de `quilometragem` de dentro do painel `identificacao` (linhas atuais ~251-265).
4. Substituir o painel `historico` (linhas atuais 325-327, hoje só `<p className="hint">Nenhum dado ainda.</p>`) por:

```tsx
      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "historico"}>
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Histórico</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="quilometragem" className="label">
                Quilometragem atual
              </label>
              <input
                id="quilometragem"
                name="quilometragem"
                type="number"
                className="input"
                required
                min={0}
                value={quilometragem}
                onChange={(e) => setQuilometragem(e.target.value)}
              />
            </div>

            <TextareaWithCounter
              id="indiciosAdulteracaoKm"
              name="indiciosAdulteracaoKm"
              label="Indícios de adulteração de quilometragem"
              value={indiciosAdulteracaoKm}
              onChange={setIndiciosAdulteracaoKm}
              maxSoft={500}
            />

            <div className="field">
              <label htmlFor="numeroProprietariosAnteriores" className="label">
                Número de proprietários anteriores
              </label>
              <input
                id="numeroProprietariosAnteriores"
                name="numeroProprietariosAnteriores"
                type="number"
                className="input"
                min={0}
                value={numeroProprietariosAnteriores}
                onChange={(e) => setNumeroProprietariosAnteriores(e.target.value)}
              />
            </div>

            <TextareaWithCounter
              id="registoAcidentesAnteriores"
              name="registoAcidentesAnteriores"
              label="Registo de acidentes anteriores"
              value={registoAcidentesAnteriores}
              onChange={setRegistoAcidentesAnteriores}
              maxSoft={500}
            />

            <TextareaWithCounter
              id="historicoManutencao"
              name="historicoManutencao"
              label="Histórico de manutenção"
              value={historicoManutencao}
              onChange={setHistoricoManutencao}
              maxSoft={500}
            />

            <TextareaWithCounter
              id="inspecoesPeriodicasIpoNotas"
              name="inspecoesPeriodicasIpoNotas"
              label="Inspeções periódicas (IPO) — notas"
              value={inspecoesPeriodicasIpoNotas}
              onChange={setInspecoesPeriodicasIpoNotas}
              maxSoft={500}
            />

            <div className="field">
              <label htmlFor="inspecoesPeriodicasIpoData" className="label">
                Data da última IPO
              </label>
              <input
                id="inspecoesPeriodicasIpoData"
                name="inspecoesPeriodicasIpoData"
                type="date"
                className="input"
                value={inspecoesPeriodicasIpoData}
                onChange={(e) => setInspecoesPeriodicasIpoData(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">
                <input
                  type="checkbox"
                  name="situacaoFiscalRegular"
                  checked={situacaoFiscalRegular}
                  onChange={(e) => setSituacaoFiscalRegular(e.target.checked)}
                />{" "}
                Situação fiscal regular (ex.: IUC em dia)
              </label>
            </div>

            <TextareaWithCounter
              id="situacaoFiscalObservacoes"
              name="situacaoFiscalObservacoes"
              label="Observações sobre a situação fiscal"
              value={situacaoFiscalObservacoes}
              onChange={setSituacaoFiscalObservacoes}
              maxSoft={500}
            />
          </div>
        </fieldset>
      </div>
```

- [ ] **Step 15: Atualizar os testes existentes que dependiam de `quilometragem` na aba Identificação**

Em `new-inspection-form.test.tsx`, o teste `"shows only the active tab's fields, keeping the others mounted"` não referencia `quilometragem`; não muda. Se algum outro teste checar `getByLabelText("Quilometragem")` dentro da aba Identificação, atualizar pra clicar na aba `"Histórico"` antes. (Nenhum teste atual faz isso — conferir com `grep -n "Quilometragem" app/\(app\)/inspections/new/new-inspection-form.test.tsx` antes de seguir; se vazio, nenhuma mudança necessária aqui.)

- [ ] **Step 16: Novo teste — Histórico renderiza e valida**

```tsx
  it("shows the Histórico fields, including quilometragem moved from Identificação", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    expect(screen.getByLabelText("Quilometragem atual")).toBeVisible();
    expect(screen.getByLabelText("Indícios de adulteração de quilometragem")).toBeVisible();
    expect(screen.getByLabelText("Número de proprietários anteriores")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));
    expect(screen.queryByLabelText("Quilometragem")).not.toBeInTheDocument();
  });
```

- [ ] **Step 17: Rodar toda a suíte e confirmar sucesso**

Run: `npm test`
Expected: PASS em tudo

- [ ] **Step 18: Commit**

```bash
git add app/\(app\)/inspections/new/ lib/inspection/
git commit -m "feat: fill in the Histórico tab with real fields"
```

---

### Task 3: Migração — tabelas de Equipamentos (catálogo de sugestões, seleções, fotos) + RLS + RPC

**Files:**
- Create: `supabase/migrations/00039_equipamentos_inspecao.sql`
- Test: `supabase/tests/00039_equipamentos_inspecao.test.sql`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: tabelas `equipamento_sugestoes(id, categoria, nome, criado_em)`, `equipamento_inspecao(id, inspection_id, categoria, nome_equipamento, condicao, comentario, ordem, criado_em)`, `equipamento_fotos(id, inspection_id, equipamento_inspecao_id, url, ordem, criado_em)`. RPC `create_inspection` ganha o parâmetro `p_equipamentos jsonb default '[]'::jsonb`, cada elemento no formato `{"ordem": int, "categoria": text, "nome_equipamento": text, "condicao": "bom"|"atencao", "comentario": text|null, "personalizado": boolean}`. Task 7 consome esse formato exato pra montar o payload no cliente.

- [ ] **Step 1: Escrever a migração**

```sql
-- supabase/migrations/00039_equipamentos_inspecao.sql
-- Peça 3, recorte 3 — aba Equipamentos.
-- Design: docs/superpowers/specs/2026-07-28-peca3-recorte3-historico-equipamentos-design.md §4

create table public.equipamento_sugestoes (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  nome text not null,
  criado_em timestamptz not null default now()
);

create unique index equipamento_sugestoes_categoria_nome_uidx
  on public.equipamento_sugestoes (lower(categoria), lower(nome));

create table public.equipamento_inspecao (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  categoria text not null,
  nome_equipamento text not null,
  condicao text not null check (condicao in ('bom', 'atencao')),
  comentario text,
  ordem int not null,
  criado_em timestamptz not null default now()
);

create index on public.equipamento_inspecao (inspection_id);

-- inspection_id duplicado aqui (em vez de só via join a equipamento_inspecao)
-- pelo mesmo motivo de public.photos: mantém a policy de insert simples,
-- sem subquery.
create table public.equipamento_fotos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  equipamento_inspecao_id uuid not null references public.equipamento_inspecao(id) on delete cascade,
  url text not null,
  ordem int,
  criado_em timestamptz not null default now()
);

create index on public.equipamento_fotos (equipamento_inspecao_id);

alter table public.equipamento_sugestoes enable row level security;

create policy equipamento_sugestoes_select on public.equipamento_sugestoes
  for select to authenticated
  using (true);

create policy equipamento_sugestoes_insert on public.equipamento_sugestoes
  for insert to authenticated
  with check (true);

alter table public.equipamento_inspecao enable row level security;

create policy equipamento_inspecao_select on public.equipamento_inspecao
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy equipamento_inspecao_insert on public.equipamento_inspecao
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

alter table public.equipamento_fotos enable row level security;

create policy equipamento_fotos_select on public.equipamento_fotos
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy equipamento_fotos_insert on public.equipamento_fotos
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

drop function public.create_inspection(
  public.tipo_cliente, public.objetivo_inspecao, text, text, text, text,
  int, text, int, int, text, text, text, int, text, text, text, int, numeric,
  text, text, text, text, int, text, text, text, date, boolean, text
);

create function public.create_inspection(
  p_tipo_cliente public.tipo_cliente,
  p_objetivo public.objetivo_inspecao,
  p_matricula text,
  p_marca text,
  p_modelo text,
  p_nome_solicitante text,
  p_quilometragem int,
  p_versao_trim text default null,
  p_ano_fabrico int default null,
  p_ano_modelo int default null,
  p_cor text default null,
  p_vin text default null,
  p_numero_motor text default null,
  p_numero_portas int default null,
  p_combustivel text default null,
  p_caixa_velocidades text default null,
  p_tracao text default null,
  p_potencia_cv int default null,
  p_torque_nm numeric default null,
  p_contacto text default null,
  p_email text default null,
  p_responsavel_presente text default null,
  p_indicios_adulteracao_km text default null,
  p_numero_proprietarios_anteriores int default null,
  p_registo_acidentes_anteriores text default null,
  p_historico_manutencao text default null,
  p_inspecoes_periodicas_ipo_notas text default null,
  p_inspecoes_periodicas_ipo_data date default null,
  p_situacao_fiscal_regular boolean default false,
  p_situacao_fiscal_observacoes text default null,
  p_equipamentos jsonb default '[]'::jsonb
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_inspection_id uuid;
  v_equip jsonb;
begin
  insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
  values ((select auth.uid()), p_tipo_cliente, p_objetivo)
  returning id into v_inspection_id;

  insert into public.vehicle_data (
    inspection_id, matricula, marca, modelo, versao_trim, ano_fabrico, ano_modelo,
    cor, vin, numero_motor, numero_portas, combustivel, caixa_velocidades, tracao,
    potencia_cv, torque_nm, quilometragem,
    indicios_adulteracao_km, numero_proprietarios_anteriores, registo_acidentes_anteriores,
    historico_manutencao, inspecoes_periodicas_ipo_notas, inspecoes_periodicas_ipo_data,
    situacao_fiscal_regular, situacao_fiscal_observacoes
  ) values (
    v_inspection_id, p_matricula, p_marca, p_modelo, p_versao_trim, p_ano_fabrico, p_ano_modelo,
    p_cor, p_vin, p_numero_motor, p_numero_portas, p_combustivel, p_caixa_velocidades, p_tracao,
    p_potencia_cv, p_torque_nm, p_quilometragem,
    p_indicios_adulteracao_km, p_numero_proprietarios_anteriores, p_registo_acidentes_anteriores,
    p_historico_manutencao, p_inspecoes_periodicas_ipo_notas, p_inspecoes_periodicas_ipo_data,
    p_situacao_fiscal_regular, p_situacao_fiscal_observacoes
  );

  insert into public.client_data (
    inspection_id, nome_solicitante, tipo, contacto, email, responsavel_presente
  ) values (
    v_inspection_id, p_nome_solicitante, p_tipo_cliente, p_contacto, p_email, p_responsavel_presente
  );

  for v_equip in select * from jsonb_array_elements(p_equipamentos)
  loop
    insert into public.equipamento_inspecao (
      inspection_id, categoria, nome_equipamento, condicao, comentario, ordem
    ) values (
      v_inspection_id,
      v_equip->>'categoria',
      v_equip->>'nome_equipamento',
      v_equip->>'condicao',
      v_equip->>'comentario',
      (v_equip->>'ordem')::int
    );

    if (v_equip->>'personalizado')::boolean then
      insert into public.equipamento_sugestoes (categoria, nome)
      values (v_equip->>'categoria', v_equip->>'nome_equipamento')
      on conflict (lower(categoria), lower(nome)) do nothing;
    end if;
  end loop;

  return v_inspection_id;
end;
$$;
```

- [ ] **Step 2: Escrever o teste SQL**

```sql
-- supabase/tests/00039_equipamentos_inspecao.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'tecnicoE@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000041', 'Tecnico E', 'tecnicoE@test.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000041';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000041"}';

do $$
declare
  v_id uuid;
  v_count int;
  v_sugestao_count int;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'EE-55-FF',
    p_marca => 'VW', p_modelo => 'Golf', p_nome_solicitante => 'Cliente E', p_quilometragem => 1000,
    p_equipamentos => '[
      {"ordem": 0, "categoria": "audio-multimedia", "nome_equipamento": "Bluetooth", "condicao": "bom", "comentario": null, "personalizado": false},
      {"ordem": 1, "categoria": "outros-equipamentos", "nome_equipamento": "Bagageira de teto", "condicao": "atencao", "comentario": "Fecho solto", "personalizado": true}
    ]'::jsonb
  );

  select count(*) into v_count from public.equipamento_inspecao where inspection_id = v_id;
  if v_count <> 2 then
    raise exception 'FALHOU: esperava 2 equipamentos, achei %', v_count;
  end if;

  select count(*) into v_sugestao_count from public.equipamento_sugestoes
    where lower(categoria) = 'outros-equipamentos' and lower(nome) = 'bagageira de teto';
  if v_sugestao_count <> 1 then
    raise exception 'FALHOU: item personalizado deveria ter virado sugestao, achei %', v_sugestao_count;
  end if;

  select count(*) into v_sugestao_count from public.equipamento_sugestoes
    where lower(nome) = 'bluetooth';
  if v_sugestao_count <> 0 then
    raise exception 'FALHOU: item pre-definido (personalizado=false) nao deveria virar sugestao';
  end if;

  raise notice 'OK: create_inspection grava equipamentos e sugestao personalizada';
end $$;

-- ordem preservada
do $$
declare
  v_id uuid;
  v_primeiro text;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'FF-66-GG',
    p_marca => 'Opel', p_modelo => 'Corsa', p_nome_solicitante => 'Cliente F', p_quilometragem => 1000,
    p_equipamentos => '[
      {"ordem": 0, "categoria": "seguranca", "nome_equipamento": "Airbags", "condicao": "bom", "comentario": null, "personalizado": false},
      {"ordem": 1, "categoria": "seguranca", "nome_equipamento": "ABS/ESP", "condicao": "bom", "comentario": null, "personalizado": false}
    ]'::jsonb
  );
  select nome_equipamento into v_primeiro from public.equipamento_inspecao
    where inspection_id = v_id order by ordem asc limit 1;
  if v_primeiro <> 'Airbags' then
    raise exception 'FALHOU: ordem nao preservada, primeiro item foi %', v_primeiro;
  end if;
  raise notice 'OK: ordem dos equipamentos preservada';
end $$;

-- dedupe de sugestao (mesmo nome/categoria, capitalizacao diferente)
do $$
declare
  v_id uuid;
  v_count int;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'GG-77-HH',
    p_marca => 'Kia', p_modelo => 'Rio', p_nome_solicitante => 'Cliente G', p_quilometragem => 1000,
    p_equipamentos => '[{"ordem": 0, "categoria": "outros-equipamentos", "nome_equipamento": "BAGAGEIRA DE TETO", "condicao": "bom", "comentario": null, "personalizado": true}]'::jsonb
  );
  select count(*) into v_count from public.equipamento_sugestoes
    where lower(categoria) = 'outros-equipamentos' and lower(nome) = 'bagageira de teto';
  if v_count <> 1 then
    raise exception 'FALHOU: deveria ter deduplicado por lower(), achei % linhas', v_count;
  end if;
  raise notice 'OK: sugestao personalizada deduplicada por categoria+nome case-insensitive';
end $$;

rollback;
```

- [ ] **Step 3: Aplicar e rodar**

Run: `set -a && source .env.local && set +a && supabase db push --db-url "$DATABASE_URL"`
Run: `psql "$DATABASE_URL" -f supabase/tests/00039_equipamentos_inspecao.test.sql`
Expected: três `NOTICE: OK: ...`, nenhum `ERROR`.

- [ ] **Step 4: Confirmar que os testes de Task 1 continuam passando**

Run: `psql "$DATABASE_URL" -f supabase/tests/00038_historico_veiculo.test.sql`
Expected: PASS sem mudança (novo parâmetro `p_equipamentos` tem default).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00039_equipamentos_inspecao.sql supabase/tests/00039_equipamentos_inspecao.test.sql
git commit -m "feat: add equipamento tables (sugestoes/inspecao/fotos), extend create_inspection RPC"
```

---

### Task 4: Catálogo de equipamentos (constante TypeScript)

**Files:**
- Create: `lib/equipamento/catalog.ts`
- Test: `lib/equipamento/catalog.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `EQUIPAMENTO_CATEGORIAS: readonly { id: string; label: string; itens: readonly string[] }[]`, tipo `EquipamentoCategoriaId` (união dos `id`). Task 5 consome essa constante e o tipo diretamente.

- [ ] **Step 1: Teste do catálogo**

```ts
// lib/equipamento/catalog.test.ts
import { describe, it, expect } from "vitest";
import { EQUIPAMENTO_CATEGORIAS } from "./catalog";

describe("EQUIPAMENTO_CATEGORIAS", () => {
  it("has the 5 categories from the spec, in order", () => {
    expect(EQUIPAMENTO_CATEGORIAS.map((c) => c.id)).toEqual([
      "audio-multimedia",
      "conforto",
      "assistencia-conducao",
      "seguranca",
      "outros-equipamentos",
    ]);
  });

  it("has 41 items total across all categories", () => {
    const total = EQUIPAMENTO_CATEGORIAS.reduce((sum, c) => sum + c.itens.length, 0);
    expect(total).toBe(41);
  });

  it("has no duplicate item names within a category", () => {
    for (const categoria of EQUIPAMENTO_CATEGORIAS) {
      expect(new Set(categoria.itens).size).toBe(categoria.itens.length);
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- catalog`
Expected: FAIL — `Cannot find module './catalog'`

- [ ] **Step 3: Implementar o catálogo**

```ts
// lib/equipamento/catalog.ts
export const EQUIPAMENTO_CATEGORIAS = [
  {
    id: "audio-multimedia",
    label: "Áudio e Multimédia",
    itens: [
      "Android Auto / Apple CarPlay",
      "Bluetooth (com streaming de áudio)",
      "Ecrã Central (Touchscreen)",
      "Entrada USB (múltiplas)",
      "Sistema de Som (múltiplos altifalantes e subwoofer)",
      "Volante Multifunções",
      "Sistema de Navegação (GPS)",
      "Comandos de Voz",
      "Carregamento sem fio para dispositivos móveis",
    ],
  },
  {
    id: "conforto",
    label: "Conforto",
    itens: [
      "Ar Condicionado / Climatização (automática e dual zone)",
      "Direção Assistida (elétrica)",
      'Vidros Elétricos (com função "um toque")',
      "Espelhos Elétricos (com aquecimento e rebatimento automático)",
      "Fecho Centralizado (com controlo remoto)",
      "Bancos Elétricos (com memória)",
      "Bancos Aquecidos / Ventilados",
      "Teto de Abrir / Panorâmico",
      "Sensor de Chuva",
      "Sensor de Luz",
    ],
  },
  {
    id: "assistencia-conducao",
    label: "Assistência à Condução",
    itens: [
      "Sensores de Estacionamento (dianteiros e traseiros)",
      "Câmara de Ré / Câmara 360°",
      "Cruise Control / Cruise Control Adaptativo (ACC)",
      "Assistente de Faixa de Rodagem",
      "Sensor de Ângulo Morto",
      "Leitor de Placas de Trânsito",
      "Assistente de Estacionamento Automático",
      "Head-Up Display",
    ],
  },
  {
    id: "seguranca",
    label: "Segurança",
    itens: [
      "Airbags (frontais, laterais e de cortina)",
      "Sistema ABS/ESP",
      "Travões (com assistência de travagem de emergência)",
      "Cintos de Segurança (com pré-tensores e limitadores de força)",
      "Luzes (faróis LED, luzes de condução diurna)",
      "Sistema de Monitorização da Pressão dos Pneus",
      "Sistema de Alerta de Colisão Frontal",
      "Travagem Automática de Emergência",
    ],
  },
  {
    id: "outros-equipamentos",
    label: "Outros Equipamentos",
    itens: [
      "Roda Sobressalente / Kit de Reparação de Pneus",
      "Ferramentas básicas (macaco, chave de rodas)",
      "Alarme",
      "Sistema Start/Stop",
      "Travão de Mão Elétrico",
      "Sistema Isofix",
    ],
  },
] as const;

export type EquipamentoCategoriaId = (typeof EQUIPAMENTO_CATEGORIAS)[number]["id"];
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- catalog`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/equipamento/
git commit -m "feat: add hardcoded equipamento catalog (5 categories, 41 items)"
```

---

### Task 5: Aba Equipamentos — seleção, condição obrigatória, comentário

**Files:**
- Create: `app/(app)/inspections/new/equipamento-categoria.tsx`
- Test: `app/(app)/inspections/new/equipamento-categoria.test.tsx`
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx`
- Modify: `app/(app)/inspections/new/new-inspection-form.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `EQUIPAMENTO_CATEGORIAS`, `EquipamentoCategoriaId` de `lib/equipamento/catalog.ts` (Task 4).
- Produces: componente `EquipamentoCategoria({ categoriaId, label, itensPreDefinidos, itensPersonalizados, onAddPersonalizado }: { categoriaId: EquipamentoCategoriaId; label: string; itensPreDefinidos: readonly string[]; itensPersonalizados: string[]; onAddPersonalizado: () => void })` — renderiza um `<details>` com um item por linha; cada linha tem `name` de campo previsível: `equip__${categoriaId}--${indiceOuSlug}__selecionado|condicao|comentario|categoria|nome|personalizado`. Task 6 consome esses `name`s pra adicionar os inputs de foto na mesma linha; Task 7 consome o mesmo padrão de `name` pra fazer o parse no servidor.

**Nota de design (refinamento sobre o spec):** o spec descreve a persistência de item desmarcado como "um Map local". Aqui ela é obtida de graça mantendo cada linha de item **sempre montada no DOM** (igual ao padrão já usado pelas 5 abas do formulário — `hidden` via CSS, nunca desmontar) em vez de um Map em JS: desmarcar só esconde a sub-seção de condição/comentário via CSS, sem apagar o `value` dos inputs. "Item selecionado sobe pro topo" é obtido com `order: -1` no item marcado, dentro de um container flex — sem reordenar o DOM.

- [ ] **Step 1: Teste do componente**

```tsx
// app/(app)/inspections/new/equipamento-categoria.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EquipamentoCategoria } from "./equipamento-categoria";

function renderCategoria(itensPersonalizados: string[] = []) {
  return render(
    <form>
      <EquipamentoCategoria
        categoriaId="seguranca"
        label="Segurança"
        itensPreDefinidos={["Airbags (frontais, laterais e de cortina)", "Sistema ABS/ESP"]}
        itensPersonalizados={itensPersonalizados}
        onAddPersonalizado={() => {}}
      />
    </form>
  );
}

describe("EquipamentoCategoria", () => {
  it("renders the category as a collapsible section with its predefined items", () => {
    renderCategoria();
    expect(screen.getByText("Segurança")).toBeInTheDocument();
    expect(screen.getByLabelText("Airbags (frontais, laterais e de cortina)")).toBeInTheDocument();
    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeInTheDocument();
  });

  it("hides the condição fields until the item is checked", () => {
    renderCategoria();
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    const condicaoBom = screen.getByLabelText("✓ Bom (Sistema ABS/ESP)") as HTMLInputElement;

    expect(condicaoBom.closest("[hidden]")).not.toBeNull();
    fireEvent.click(checkbox);
    expect(condicaoBom.closest("[hidden]")).toBeNull();
  });

  it("keeps condição and comentário filled after unchecking and rechecking", () => {
    renderCategoria();
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));
    fireEvent.change(screen.getByLabelText("Comentário (Sistema ABS/ESP)"), {
      target: { value: "Luz acesa no painel" },
    });

    fireEvent.click(checkbox); // desmarca
    fireEvent.click(checkbox); // remarca

    expect((screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Comentário (Sistema ABS/ESP)") as HTMLTextAreaElement).value).toBe(
      "Luz acesa no painel"
    );
  });

  it("shows comentário only when condição is Atenção", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    const comentarioField = screen.getByLabelText("Comentário (Sistema ABS/ESP)");

    expect(comentarioField.closest("[hidden]")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));
    expect(comentarioField.closest("[hidden]")).toBeNull();
  });

  it("renders personalizado items passed in, alongside predefined ones", () => {
    renderCategoria(["Bagageira de teto"]);
    expect(screen.getByLabelText("Bagageira de teto")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- equipamento-categoria`
Expected: FAIL — módulo não existe

- [ ] **Step 3: Implementar o componente**

```tsx
// app/(app)/inspections/new/equipamento-categoria.tsx
"use client";

import { useState } from "react";
import type { EquipamentoCategoriaId } from "@/lib/equipamento/catalog";

type Condicao = "" | "bom" | "atencao";

function itemKey(categoriaId: string, nome: string, index: number): string {
  return `${categoriaId}--${index}`;
}

function EquipamentoItem({
  categoriaId,
  nome,
  index,
  personalizado,
}: {
  categoriaId: EquipamentoCategoriaId;
  nome: string;
  index: number;
  personalizado: boolean;
}) {
  const key = itemKey(categoriaId, nome, index);
  const prefix = `equip__${key}`;
  const [selecionado, setSelecionado] = useState(false);
  const [condicao, setCondicao] = useState<Condicao>("");

  return (
    <li className={`equip-item${selecionado ? " equip-item--selecionado" : ""}`}>
      <input type="hidden" name={`${prefix}__categoria`} value={categoriaId} />
      <input type="hidden" name={`${prefix}__nome`} value={nome} />
      <input type="hidden" name={`${prefix}__personalizado`} value={personalizado ? "1" : "0"} />

      <label className="equip-item__check">
        <input
          type="checkbox"
          name={`${prefix}__selecionado`}
          checked={selecionado}
          onChange={(e) => setSelecionado(e.target.checked)}
        />
        {nome}
      </label>

      <div className="equip-item__answer" hidden={!selecionado}>
        <div className="equip-item__condicao">
          <label>
            <input
              type="radio"
              name={`${prefix}__condicao`}
              value="bom"
              required={selecionado}
              checked={condicao === "bom"}
              onChange={() => setCondicao("bom")}
              aria-label={`✓ Bom (${nome})`}
            />
            ✓ Bom
          </label>
          <label>
            <input
              type="radio"
              name={`${prefix}__condicao`}
              value="atencao"
              required={selecionado}
              checked={condicao === "atencao"}
              onChange={() => setCondicao("atencao")}
              aria-label={`⚠️ Atenção (${nome})`}
            />
            ⚠️ Atenção
          </label>
        </div>

        <div className="field" hidden={condicao !== "atencao"}>
          <label htmlFor={`${prefix}__comentario`} className="label">
            {`Comentário (${nome})`}
          </label>
          <textarea
            id={`${prefix}__comentario`}
            name={`${prefix}__comentario`}
            className="input"
            placeholder="Adicionar comentário..."
          />
        </div>
      </div>
    </li>
  );
}

export function EquipamentoCategoria({
  categoriaId,
  label,
  itensPreDefinidos,
  itensPersonalizados,
  onAddPersonalizado,
}: {
  categoriaId: EquipamentoCategoriaId;
  label: string;
  itensPreDefinidos: readonly string[];
  itensPersonalizados: string[];
  onAddPersonalizado: () => void;
}) {
  const todosOsItens = [...itensPreDefinidos, ...itensPersonalizados];

  return (
    <details className="equip-categoria" open>
      <summary className="equip-categoria__summary">
        {label}
        <button
          type="button"
          className="btn btn-secondary equip-categoria__add"
          onClick={(e) => {
            e.preventDefault();
            onAddPersonalizado();
          }}
        >
          +
        </button>
      </summary>
      <ul className="equip-categoria__lista">
        {todosOsItens.map((nome, index) => (
          <EquipamentoItem
            key={itemKey(categoriaId, nome, index)}
            categoriaId={categoriaId}
            nome={nome}
            index={index}
            personalizado={index >= itensPreDefinidos.length}
          />
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- equipamento-categoria`
Expected: PASS (5 testes)

- [ ] **Step 5: CSS**

Adicionar a `app/globals.css` (perto de `.escolha-options`, reaproveitando os mesmos tokens):

```css
/* Equipamentos — categorias em <details> nativo (Peça 3, recorte 3) */

.equip-categoria {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}

.equip-categoria__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-family-display);
  font-weight: 600;
  cursor: pointer;
}

.equip-categoria__add {
  min-height: 32px;
  padding: 0 var(--space-3);
}

.equip-categoria__lista {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  list-style: none;
  margin: var(--space-4) 0 0;
  padding: 0;
}

.equip-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  order: 0;
}

.equip-item--selecionado {
  order: -1;
  border-color: var(--color-green-600);
}

.equip-item__check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-family-body);
}

.equip-item__answer {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.equip-item__condicao {
  display: flex;
  gap: var(--space-4);
}
```

- [ ] **Step 6: Integrar ao formulário**

Modify `app/(app)/inspections/new/new-inspection-form.tsx`:

1. Importar `EquipamentoCategoria` e `EQUIPAMENTO_CATEGORIAS` (de `@/lib/equipamento/catalog`).
2. Adicionar estado: `const [personalizadosPorCategoria, setPersonalizadosPorCategoria] = useState<Record<string, string[]>>({})` (populado na Task 6).
3. Substituir o painel `equipamentos` (hoje só `<p className="hint">Nenhum dado ainda.</p>`) por:

```tsx
      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "equipamentos"}>
        {EQUIPAMENTO_CATEGORIAS.map((categoria) => (
          <EquipamentoCategoria
            key={categoria.id}
            categoriaId={categoria.id}
            label={categoria.label}
            itensPreDefinidos={categoria.itens}
            itensPersonalizados={personalizadosPorCategoria[categoria.id] ?? []}
            onAddPersonalizado={() => {
              /* Task 6 substitui isto por abrir o dialog */
            }}
          />
        ))}
      </div>
```

- [ ] **Step 7: Teste — Equipamentos exige condição antes de avançar**

Adicionar a `new-inspection-form.test.tsx`:

```tsx
  it("blocks advancing past Equipamentos when a selected item has no condição set", () => {
    render(<NewInspectionForm />);
    fireEvent.change(screen.getByLabelText("Nome do solicitante"), { target: { value: "Cliente Teste" } });
    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));

    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));

    const saveButton = screen.getByRole("button", { name: "Guardar" });
    const form = saveButton.closest("form") as HTMLFormElement;
    const reportValiditySpy = vi.spyOn(HTMLInputElement.prototype, "reportValidity");

    fireEvent.click(saveButton);

    expect(reportValiditySpy).toHaveBeenCalled();
    reportValiditySpy.mockRestore();
  });
```

(Este teste confirma que o `required` nativo dos radios de condição é pego pelo mecanismo de validação já existente — não é preciso nenhuma lógica de validação nova no componente do formulário.)

- [ ] **Step 8: Rodar toda a suíte e confirmar sucesso**

Run: `npm test`
Expected: PASS em tudo

- [ ] **Step 9: Commit**

```bash
git add app/\(app\)/inspections/new/equipamento-categoria.tsx app/\(app\)/inspections/new/equipamento-categoria.test.tsx app/\(app\)/inspections/new/new-inspection-form.tsx app/\(app\)/inspections/new/new-inspection-form.test.tsx app/globals.css
git commit -m "feat: add Equipamentos tab — category accordions, condição/comentário per item"
```

---

### Task 6: Item personalizado (dialog) + fotos (até 2 por item)

**Files:**
- Create: `app/(app)/inspections/new/equipamento-personalizado-dialog.tsx`
- Test: `app/(app)/inspections/new/equipamento-personalizado-dialog.test.tsx`
- Modify: `app/(app)/inspections/new/equipamento-categoria.tsx`
- Modify: `app/(app)/inspections/new/equipamento-categoria.test.tsx`
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nada de novas interfaces externas.
- Produces: componente `EquipamentoPersonalizadoDialog({ categoriaLabel, onConfirm, onCancel }: { categoriaLabel: string; onConfirm: (nome: string, condicao: "bom" | "atencao") => void; onCancel: () => void })`, chamado via `ref.current?.showModal()` do lado de fora (mesmo padrão de `<dialog>` de `checklist-item-table.tsx`).

- [ ] **Step 1: Adicionar campos de foto ao `EquipamentoItem` — teste primeiro**

Adicionar a `equipamento-categoria.test.tsx`:

```tsx
  it("shows up to 2 file inputs only when condição is Atenção", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));

    const fileInputs = screen.getAllByLabelText(/^Foto \d \(Sistema ABS\/ESP\)$/);
    expect(fileInputs).toHaveLength(2);
    fileInputs.forEach((input) => expect(input).toHaveAttribute("type", "file"));
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- equipamento-categoria`
Expected: FAIL — foto inputs não existem ainda

- [ ] **Step 3: Adicionar os inputs de foto**

Modify `app/(app)/inspections/new/equipamento-categoria.tsx` — dentro do bloco `<div className="field" hidden={condicao !== "atencao"}>` do comentário, logo depois do `<textarea>`, adicionar:

```tsx
        <div className="equip-item__fotos" hidden={condicao !== "atencao"}>
          <div className="field">
            <label htmlFor={`${prefix}__foto1`} className="label">
              {`Foto 1 (${nome})`}
            </label>
            <input id={`${prefix}__foto1`} name={`${prefix}__foto1`} type="file" accept="image/*" className="input" />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}__foto2`} className="label">
              {`Foto 2 (${nome})`}
            </label>
            <input id={`${prefix}__foto2`} name={`${prefix}__foto2`} type="file" accept="image/*" className="input" />
          </div>
        </div>
```

(Nota: o bloco de comentário já está dentro de `hidden={condicao !== "atencao"}` no elemento pai `equip-item__answer`'s filho — ajustar a estrutura pra que `hidden` do comentário e das fotos usem a mesma condição `condicao !== "atencao"`, já presente no JSX de comentário do Step anterior.)

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- equipamento-categoria`
Expected: PASS

- [ ] **Step 5: Teste do dialog de item personalizado**

```tsx
// app/(app)/inspections/new/equipamento-personalizado-dialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EquipamentoPersonalizadoDialog } from "./equipamento-personalizado-dialog";

describe("EquipamentoPersonalizadoDialog", () => {
  it("requires a nome and a condição before confirming", () => {
    const onConfirm = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={onConfirm} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with the typed nome and selected condição", () => {
    const onConfirm = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={onConfirm} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Nome do equipamento"), { target: { value: "Bagageira de teto" } });
    fireEvent.click(screen.getByLabelText("⚠️ Atenção"));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onConfirm).toHaveBeenCalledWith("Bagageira de teto", "atencao");
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const onCancel = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `npm test -- equipamento-personalizado-dialog`
Expected: FAIL — módulo não existe

- [ ] **Step 7: Implementar o dialog**

```tsx
// app/(app)/inspections/new/equipamento-personalizado-dialog.tsx
"use client";

import { useState } from "react";

export function EquipamentoPersonalizadoDialog({
  categoriaLabel,
  onConfirm,
  onCancel,
}: {
  categoriaLabel: string;
  onConfirm: (nome: string, condicao: "bom" | "atencao") => void;
  onCancel: () => void;
}) {
  const [nome, setNome] = useState("");
  const [condicao, setCondicao] = useState<"" | "bom" | "atencao">("");

  function handleConfirm() {
    if (!nome.trim() || condicao === "") return;
    onConfirm(nome.trim(), condicao);
  }

  return (
    <div className="stack">
      <h3>{`Adicionar equipamento personalizado — ${categoriaLabel}`}</h3>
      <div className="field">
        <label htmlFor="personalizadoNome" className="label">
          Nome do equipamento
        </label>
        <input
          id="personalizadoNome"
          className="input"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>
      <div className="equip-item__condicao">
        <label>
          <input type="radio" name="personalizadoCondicao" checked={condicao === "bom"} onChange={() => setCondicao("bom")} aria-label="✓ Bom" />
          ✓ Bom
        </label>
        <label>
          <input type="radio" name="personalizadoCondicao" checked={condicao === "atencao"} onChange={() => setCondicao("atencao")} aria-label="⚠️ Atenção" />
          ⚠️ Atenção
        </label>
      </div>
      <div className="stack-row">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm}>
          Adicionar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `npm test -- equipamento-personalizado-dialog`
Expected: PASS (3 testes)

- [ ] **Step 9: Ligar o dialog ao formulário**

Modify `app/(app)/inspections/new/new-inspection-form.tsx`:

1. Adicionar `import { useRef } from "react"` (se ainda não importado com esse nome — já está, junto de `useState`).
2. Adicionar `const personalizadoDialogRef = useRef<HTMLDialogElement>(null)` e `const [categoriaAbrindoDialog, setCategoriaAbrindoDialog] = useState<{ id: string; label: string } | null>(null)`.
3. Trocar o `onAddPersonalizado` do Step 6 da Task 5 por:

```tsx
            onAddPersonalizado={() => {
              setCategoriaAbrindoDialog({ id: categoria.id, label: categoria.label });
              personalizadoDialogRef.current?.showModal();
            }}
```

4. Logo depois do `</div>` que fecha o painel `equipamentos`, adicionar:

```tsx
      <dialog ref={personalizadoDialogRef} className="dialog-panel">
        {categoriaAbrindoDialog && (
          <EquipamentoPersonalizadoDialog
            categoriaLabel={categoriaAbrindoDialog.label}
            onCancel={() => personalizadoDialogRef.current?.close()}
            onConfirm={(nome, _condicao) => {
              setPersonalizadosPorCategoria((prev) => ({
                ...prev,
                [categoriaAbrindoDialog.id]: [...(prev[categoriaAbrindoDialog.id] ?? []), nome],
              }));
              personalizadoDialogRef.current?.close();
            }}
          />
        )}
      </dialog>
```

Nota: a condição escolhida no dialog (`_condicao`) não precisa ser repassada manualmente — o item recém-adicionado aparece na lista já **desmarcado** (igual a um item pré-definido), o técnico marca o checkbox e escolhe a condição normalmente na própria linha, que já suporta isso desde a Task 5. Isso evita duplicar o estado de condição em dois lugares.

- [ ] **Step 10: Rodar toda a suíte e confirmar sucesso**

Run: `npm test`
Expected: PASS em tudo

- [ ] **Step 11: Commit**

```bash
git add app/\(app\)/inspections/new/
git commit -m "feat: add custom equipment dialog and photo inputs (up to 2 per item)"
```

---

### Task 7: Server Action — persistir equipamentos e enviar fotos pendentes

**Files:**
- Modify: `app/(app)/inspections/new/actions.ts`
- Modify: `app/(app)/inspections/new/actions.test.ts`

**Interfaces:**
- Consumes: convenção de `name` de campo `equip__${key}__{selecionado,condicao,comentario,categoria,nome,personalizado,foto1,foto2}` (Task 5/6). Formato `p_equipamentos` do RPC (Task 3).
- Produces: nenhuma interface nova consumida por outra task — esta é a última peça do fluxo de criação.

- [ ] **Step 1: Teste — FormData de equipamento vira `p_equipamentos` e fotos sobem**

Adicionar a `actions.test.ts` (o mock de `createClient` precisa ganhar `storage.from().upload()`/`.getPublicUrl()` e uma segunda query encadeável pra `equipamento_inspecao`):

```ts
const storageUpload = vi.fn(async () => ({ error: null }));
const storageGetPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://example.test/foto.jpg" } }));
const equipamentoInspecaoQuery = {
  select: vi.fn(() => equipamentoInspecaoQuery),
  eq: vi.fn(() => equipamentoInspecaoQuery),
  order: vi.fn(async () => ({
    data: [{ id: "equip-id-0", ordem: 0 }],
    error: null,
  })),
};
const equipamentoFotosInsert = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: (table: string) => {
      if (table === "equipamento_inspecao") return equipamentoInspecaoQuery;
      if (table === "equipamento_fotos") return { insert: equipamentoFotosInsert };
      return from(table);
    },
    storage: { from: () => ({ upload: storageUpload, getPublicUrl: storageGetPublicUrl }) },
  }),
}));
```

```ts
  it("builds p_equipamentos from equip__ FormData fields and uploads pending photos", async () => {
    rpc.mockResolvedValue({ data: "11111111-1111-1111-1111-111111111111", error: null });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");

    formData.set("equip__seguranca--0__selecionado", "on");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");
    formData.set("equip__seguranca--0__condicao", "atencao");
    formData.set("equip__seguranca--0__comentario", "Luz acesa");
    formData.set("equip__seguranca--0__foto1", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/11111111-1111-1111-1111-111111111111"
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_inspection",
      expect.objectContaining({
        p_equipamentos: [
          {
            ordem: 0,
            categoria: "seguranca",
            nome_equipamento: "Sistema ABS/ESP",
            condicao: "atencao",
            comentario: "Luz acesa",
            personalizado: false,
          },
        ],
      })
    );
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(equipamentoFotosInsert).toHaveBeenCalledWith(
      expect.objectContaining({ equipamento_inspecao_id: "equip-id-0", inspection_id: "11111111-1111-1111-1111-111111111111" })
    );
  });

  it("ignores equip__ rows whose selecionado checkbox is unchecked", async () => {
    rpc.mockResolvedValue({ data: "22222222-2222-2222-2222-222222222222", error: null });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");
    // sem __selecionado

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(/REDIRECT/);

    expect(rpc).toHaveBeenCalledWith("create_inspection", expect.objectContaining({ p_equipamentos: [] }));
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- actions`
Expected: FAIL — `p_equipamentos` ainda não é enviado, upload não acontece.

- [ ] **Step 3: Implementar o parsing e upload**

Modify `app/(app)/inspections/new/actions.ts` — adicionar antes de `createInspectionAction`:

```ts
type EquipamentoParsed = {
  key: string;
  categoria: string;
  nome_equipamento: string;
  condicao: string;
  comentario: string | null;
  personalizado: boolean;
  foto1: File | null;
  foto2: File | null;
};

function parseEquipamentos(formData: FormData): EquipamentoParsed[] {
  const keys = new Set<string>();
  for (const name of formData.keys()) {
    const match = name.match(/^equip__(.+)__selecionado$/);
    if (match) keys.add(match[1]);
  }

  const result: EquipamentoParsed[] = [];
  for (const key of keys) {
    const prefix = `equip__${key}`;
    const foto1 = formData.get(`${prefix}__foto1`);
    const foto2 = formData.get(`${prefix}__foto2`);
    result.push({
      key,
      categoria: String(formData.get(`${prefix}__categoria`) ?? ""),
      nome_equipamento: String(formData.get(`${prefix}__nome`) ?? ""),
      condicao: String(formData.get(`${prefix}__condicao`) ?? ""),
      comentario: (formData.get(`${prefix}__comentario`) as string) || null,
      personalizado: formData.get(`${prefix}__personalizado`) === "1",
      foto1: foto1 instanceof File && foto1.size > 0 ? foto1 : null,
      foto2: foto2 instanceof File && foto2.size > 0 ? foto2 : null,
    });
  }
  return result;
}

function buildPhotoPath(inspectionId: string, equipamentoId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/${equipamentoId}/${Date.now()}-${safeName}`;
}
```

No corpo de `createInspectionAction`, logo antes de montar `raw`/`parsed`, chamar `const equipamentos = parseEquipamentos(formData);`. No objeto passado a `supabase.rpc`, adicionar:

```ts
    p_equipamentos: equipamentos.map((e, ordem) => ({
      ordem,
      categoria: e.categoria,
      nome_equipamento: e.nome_equipamento,
      condicao: e.condicao,
      comentario: e.comentario,
      personalizado: e.personalizado,
    })),
```

Depois do `if (error) { ... }` e antes do `redirect(...)` final, adicionar o upload de fotos pendentes:

```ts
  const equipamentosComFoto = equipamentos.filter((e) => e.foto1 || e.foto2);
  if (equipamentosComFoto.length > 0) {
    const { data: equipRows } = await supabase
      .from("equipamento_inspecao")
      .select("id, ordem")
      .eq("inspection_id", inspectionId)
      .order("ordem", { ascending: true });

    for (let ordem = 0; ordem < equipamentos.length; ordem++) {
      const equip = equipamentos[ordem];
      if (!equip.foto1 && !equip.foto2) continue;
      const equipamentoId = equipRows?.find((r) => r.ordem === ordem)?.id;
      if (!equipamentoId) continue;

      for (const foto of [equip.foto1, equip.foto2]) {
        if (!foto) continue;
        const path = buildPhotoPath(inspectionId, equipamentoId, foto.name);
        const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, foto);
        if (uploadError) {
          console.error("upload de foto de equipamento falhou", uploadError);
          continue;
        }
        const { data: publicUrl } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
        await supabase
          .from("equipamento_fotos")
          .insert({ inspection_id: inspectionId, equipamento_inspecao_id: equipamentoId, url: publicUrl.publicUrl });
      }
    }
  }
```

(Falha de upload não bloqueia a criação da inspeção — mesma filosofia do resto do app: a inspeção já existe e é o dado principal; uma foto que falhou pode ser adicionada depois. `console.error` fica pra investigação, igual ao resto do arquivo.)

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- actions`
Expected: PASS

- [ ] **Step 5: Rodar toda a suíte**

Run: `npm test`
Expected: PASS em tudo

- [ ] **Step 6: Verificação manual no navegador**

Run: `npm run dev`, logar com `teste1@checkauto.pt`, criar uma inspeção nova preenchendo Cliente/Identificação/Histórico, marcar 2-3 equipamentos (um deles "Atenção" com comentário + 1 foto), clicar Guardar.
Expected: redireciona pra `/inspections/{id}` sem erro; conferir no Supabase Studio (ou via `psql`) que `equipamento_inspecao` e `equipamento_fotos` têm as linhas esperadas pra essa inspeção.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/inspections/new/actions.ts app/\(app\)/inspections/new/actions.test.ts
git commit -m "feat: persist equipamento selections and upload pending photos on create_inspection"
```

---

### Task 8: Limpeza do checklist — remover os 41 itens duplicados

**Files:**
- Modify: `docs/data/checklist-inspecta-v7.md`
- Modify: `scripts/generate_checklist_seed_v7.py`
- Modify: `scripts/test_generate_checklist_seed_v7.py`
- Modify: `supabase/migrations/00037_seed_checklist_v7.sql` (regenerado pelo script — não editar à mão)
- Modify: `supabase/tests/00037_seed_checklist_v7.test.sql`

**Interfaces:**
- Consumes: nada de outras tasks — pode ser feita em paralelo com Tasks 1-7.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Remover as linhas duplicadas do `.md`**

Em `docs/data/checklist-inspecta-v7.md`:

1. Linhas 237, 239, 240 (grupo `### Painel`, itens 148... não — **manter 148**; remover só 150 e 151): apagar as linhas `| 150 | GPS / navegação integrada | ... |` e `| 151 | Bluetooth – funcionamento | ... |`.
2. No grupo `### Teto` (linhas 246-249): apagar `| 154 | Teto de abrir manual... |` e `| 155 | Teto de abrir elétrico... |`.
3. No grupo `### Porta-bagagens` (linhas 255-257): apagar `| 157 | Presença do pneu suplente | ... |` e `| 158 | Presença do macaco e chave de rodas | ... |`.
4. No grupo `### Elétrico` (linhas 405-414): apagar as linhas 249-253 (`Fecho centralizado`, `Alarme antifurto`, `Sistema Start/Stop`, `Travão de mão elétrico`, `Sistema ISOFIX`).
5. Na seção `## 10. Equipamentos` (linhas 453-519): apagar inteiramente as subseções `### Multimédia` (271-277), `### Conforto` (278-284), `### ADAS` (285-294) e `### Segurança` (295-300) — cabeçalho `###` e tabela inteira de cada uma. **Manter** `### Acessórios e Itens Obrigatórios` (301-310) exatamente como está.

Total removido: 41 linhas de item (30 da seção 10 + 11 espalhadas).

- [ ] **Step 2: Renumerar a coluna `#` sequencialmente**

As linhas restantes ficam com números não-contíguos (gaps onde os itens foram removidos). O parser (`scripts/generate_checklist_seed_v7.py`) não usa o número pra nada na inserção, mas o self-test do gerador (`scripts/test_generate_checklist_seed_v7.py::test_parse_360_rows_13_grupos`) exige uma sequência contígua 1..N — e `ITEM_NOTA_EXCLUIDA = 351` no gerador referencia o item-nota pelo número antigo. Renumerar com um script descartável:

```python
#!/usr/bin/env python3
"""One-off: renumera a coluna '#' de docs/data/checklist-inspecta-v7.md
sequencialmente depois da remoção dos itens duplicados de Equipamentos
(Peça 3 recorte 3). Rodar uma vez, depois descartar."""
import re
from pathlib import Path

PATH = Path("docs/data/checklist-inspecta-v7.md")
ROW_RE = re.compile(r"^\|\s*(\d+)\s*\|(.*)\|$")
OLD_NOTA_NUM = 351  # scripts/generate_checklist_seed_v7.py ITEM_NOTA_EXCLUIDA

lines = PATH.read_text(encoding="utf-8").splitlines()
new_lines = []
counter = 0
new_nota_num = None
for line in lines:
    m = ROW_RE.match(line)
    if not m:
        new_lines.append(line)
        continue
    counter += 1
    if int(m.group(1)) == OLD_NOTA_NUM:
        new_nota_num = counter
    new_lines.append(f"| {counter} |{m.group(2)}|")

PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
print(f"Renumerado: {counter} linhas. Nota (antes #{OLD_NOTA_NUM}) agora e' #{new_nota_num}.")
```

Run: `python3 scripts/renumber_checklist_v7.py` (criar o arquivo com o conteúdo acima, rodar, depois apagar o arquivo — é um script de uso único, não faz parte do repo final).
Expected: imprime `Renumerado: 319 linhas. Nota (antes #351) agora e' #<N>` — anotar o `<N>` impresso.

- [ ] **Step 3: Atualizar `ITEM_NOTA_EXCLUIDA` no gerador**

Modify `scripts/generate_checklist_seed_v7.py` — trocar `ITEM_NOTA_EXCLUIDA = 351` pelo `<N>` impresso no Step 2.

- [ ] **Step 4: Atualizar o self-test do gerador**

Modify `scripts/test_generate_checklist_seed_v7.py`:
- `test_parse_360_rows_13_grupos`: `assert len(rows) == 360` → `== 319`; `list(range(1, 361))` → `list(range(1, 320))`.
- `test_contagem_por_tipo_e_exclusao_351` (e qualquer outro teste com `359`/`360`): `359` → `318`.

Run: `cd scripts && python3 test_generate_checklist_seed_v7.py && cd ..`
Expected: sem `AssertionError`.

- [ ] **Step 5: Regenerar a migration de seed**

Run: `python3 scripts/generate_checklist_seed_v7.py`
Expected: sobrescreve `supabase/migrations/00037_seed_checklist_v7.sql` (não editar esse arquivo à mão — é sempre saída do script).

- [ ] **Step 6: Atualizar as contagens no teste SQL do seed**

Modify `supabase/tests/00037_seed_checklist_v7.test.sql`: trocar `esperava 359 itens` → `esperava 318 itens` e a checagem `v_count <> 359` → `v_count <> 318` (a contagem do grupo 13, "34 itens", não muda — nenhum item removido pertence ao grupo 13). Rodar `grep -n "271\|278\|285\|295\|150\|151\|154\|155\|157\|158\|249\|250\|251\|252\|253" supabase/tests/00037_seed_checklist_v7.test.sql` pra confirmar que nenhuma outra asserção referencia os itens removidos; se alguma referenciar, ajustar/remover essa asserção específica.

- [ ] **Step 7: Aplicar a migration regenerada**

O arquivo `00037_seed_checklist_v7.sql` já foi aplicado antes (recorte 2) — reaplicar a versão editada exige repará-lo no ledger primeiro:

Run: `set -a && source .env.local && set +a`
Run: `supabase migration repair 00037 --status reverted --db-url "$DATABASE_URL"`
Run: `supabase db push --db-url "$DATABASE_URL"`
Expected: `00037_seed_checklist_v7.sql` reaplicado sem erro (o próprio SQL gerado começa apagando o seed antigo antes de inserir o novo — mesmo padrão da vez anterior que essa migration foi regenerada).

- [ ] **Step 8: Rodar os testes SQL do checklist**

Run: `psql "$DATABASE_URL" -f supabase/tests/00037_seed_checklist_v7.test.sql`
Expected: só `NOTICE: OK: ...`, nenhum `ERROR`.

Run: `psql "$DATABASE_URL" -f supabase/tests/00016_seed_checklist_groups_and_items.test.sql` (se ainda existir e for relevante) e qualquer outro teste SQL que referencie contagem de itens do checklist — confirmar que nenhum quebrou.

- [ ] **Step 9: Confirmar visualmente que a UI do checklist não quebrou**

Run: `npm run dev`, abrir uma inspeção existente (ou criar uma nova) e navegar até o grupo "10. Equipamentos" no checklist.
Expected: mostra só os itens de "Acessórios e Itens Obrigatórios" (10 itens); nenhum erro no console; navegação entre grupos continua funcionando.

- [ ] **Step 10: Commit**

```bash
git add docs/data/checklist-inspecta-v7.md scripts/generate_checklist_seed_v7.py scripts/test_generate_checklist_seed_v7.py supabase/migrations/00037_seed_checklist_v7.sql supabase/tests/00037_seed_checklist_v7.test.sql
git commit -m "refactor: remove 41 checklist items now covered by the Equipamentos tab"
```

---

## Self-Review

**Cobertura do spec:** §2 (decisões) coberto pelas Tasks 1-8; §3 (Histórico) → Tasks 1-2; §4 (modelo Equipamentos) → Task 3; §5 (UI Equipamentos) → Tasks 4-6; §6 (limpeza checklist) → Task 8; §7 (testes) → embutido em cada task; §8 (branch/gate) → fora do plano, tratado por `finishing-a-development-branch` depois que todas as tasks passarem.

**Consistência de tipos:** `EquipamentoCategoriaId` (Task 4) usado igual em Task 5/6; convenção de `name` `equip__${key}__campo` idêntica entre Task 5 (produz), Task 6 (estende com `foto1`/`foto2`) e Task 7 (consome via regex `^equip__(.+)__selecionado$`); formato de `p_equipamentos` idêntico entre Task 3 (RPC) e Task 7 (payload). RPC `create_inspection` tem uma única assinatura final (Task 3 já inclui todos os parâmetros de Task 1 + os novos de equipamentos, evitando um terceiro `drop function`).
