# Ajustes em Histórico e Equipamentos (pós recorte 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar a aba Histórico (tipos de campo, gate Sim/Não, bloco de importação/IUC) e a aba Equipamentos (acordeão fechado por padrão, compactação automática do item, badge de progresso por categoria) no formulário de nova inspeção.

**Architecture:** Nova migração (`00040`) altera `vehicle_data` e recria `create_inspection`; três componentes novos e pequenos (`SimNaoRadio`, `PaisOrigemSelect`, `ValorMoedaInput`) seguem os padrões já estabelecidos (`TextareaWithCounter`, hidden-input-mirror do `objetivo`); `equipamento-categoria.tsx` ganha estado local de expansão por item mais um callback leve item→categoria só para contar o badge — sem levantar o resto do estado para o pai.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, Zod, Supabase/Postgres (RPC + RLS), Vitest + Testing Library, pgTAP-style `do $$ ... $$` tests em `supabase/tests/`.

## Global Constraints

- Trabalho continua na branch/worktree existente `peca3-recorte3-historico-equipamentos` (`.worktrees/peca3-recorte3-historico-equipamentos/`), **não** em `main`. Todos os caminhos de arquivo abaixo são relativos à raiz desse worktree.
- Sem dependências novas — `Intl.NumberFormat` (nativo) cobre a máscara de moeda; lista de países é uma constante hardcoded, não uma lib.
- `situacao_fiscal_observacoes` é removida (coluna e campo) — o novo campo de texto livre de `situacao_fiscal_regular` a substitui, não convive com ela.
- Migrações de RPC neste projeto sempre fazem `drop function` (assinatura completa) + `create function` — nunca `create or replace`. Confira a assinatura exata do `create function` anterior antes de escrever o `drop function` da nova migração.
- Badge de Equipamentos conta "verificados/total" (não só verificados); "verificado" = `selecionado && condicao !== ""`. Compactação do item vale igual para condição "Bom" e "Atenção", só dispara no blur do item inteiro (não no clique do radio), e o resumo compactado é clicável para reabrir.
- Todo campo novo de Histórico é opcional (só `quilometragem` é obrigatório nessa aba, sem mudança aqui).
- Cada task termina com `npm test -- --run` (suíte inteira) verde antes do commit — não só o arquivo de teste da task.

---

### Task 1: Migração — `situacao_fiscal_regular` vira texto, novos campos de Histórico, RPC recriado

**Files:**
- Create: `supabase/migrations/00040_historico_veiculo_v2.sql`
- Test: `supabase/tests/00040_historico_veiculo_v2.test.sql`

**Interfaces:**
- Consumes: colunas de `vehicle_data` de `00038_historico_veiculo.sql` (`situacao_fiscal_regular boolean`, `situacao_fiscal_observacoes text`, `indicios_adulteracao_km text`); assinatura de `create_inspection` de `00039_equipamentos_inspecao.sql` (31 parâmetros terminando em `p_equipamentos jsonb default '[]'::jsonb`).
- Produces: colunas novas/alteradas em `vehicle_data` — `situacao_fiscal_regular text` (era boolean), `situacao_fiscal_observacoes` **removida**, `indicios_adulteracao_presentes boolean not null default false`, `veiculo_importado boolean not null default false`, `pais_origem text`, `matricula_origem text`, `data_importacao date`, `possui_coc boolean`, `isencao_isv_aplicada boolean`, `numero_dav text`, `data_primeira_matricula date`, `valor_base_iuc_anual numeric`. `create_inspection` ganha os parâmetros `p_indicios_adulteracao_presentes boolean default false`, `p_veiculo_importado boolean default false`, `p_pais_origem text default null`, `p_matricula_origem text default null`, `p_data_importacao date default null`, `p_possui_coc boolean default null`, `p_isencao_isv_aplicada boolean default null`, `p_numero_dav text default null`, `p_data_primeira_matricula date default null`, `p_valor_base_iuc_anual numeric default null` (todos após `p_equipamentos`), e `p_situacao_fiscal_regular` muda de `boolean default false` para `text default null`; `p_situacao_fiscal_observacoes` é **removido**. Task 6 (Server Action) consome esses nomes de parâmetro exatos.

- [ ] **Step 1: Escrever a migração**

```sql
-- supabase/migrations/00040_historico_veiculo_v2.sql
-- Ajustes pós recorte 3 — ver docs/superpowers/specs/2026-07-30-historico-equipamentos-ajustes-design.md §2

alter table public.vehicle_data
  alter column situacao_fiscal_regular type text
    using (case when situacao_fiscal_regular then 'Sim' else '' end),
  alter column situacao_fiscal_regular drop not null,
  alter column situacao_fiscal_regular drop default,
  drop column situacao_fiscal_observacoes,
  add column indicios_adulteracao_presentes boolean not null default false,
  add column veiculo_importado boolean not null default false,
  add column pais_origem text,
  add column matricula_origem text,
  add column data_importacao date,
  add column possui_coc boolean,
  add column isencao_isv_aplicada boolean,
  add column numero_dav text,
  add column data_primeira_matricula date,
  add column valor_base_iuc_anual numeric;

drop function public.create_inspection(
  public.tipo_cliente, public.objetivo_inspecao, text, text, text, text,
  int, text, int, int, text, text, text, int, text, text, text, int, numeric,
  text, text, text, text, int, text, text, text, date, boolean, text, jsonb
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
  p_situacao_fiscal_regular text default null,
  p_equipamentos jsonb default '[]'::jsonb,
  p_indicios_adulteracao_presentes boolean default false,
  p_veiculo_importado boolean default false,
  p_pais_origem text default null,
  p_matricula_origem text default null,
  p_data_importacao date default null,
  p_possui_coc boolean default null,
  p_isencao_isv_aplicada boolean default null,
  p_numero_dav text default null,
  p_data_primeira_matricula date default null,
  p_valor_base_iuc_anual numeric default null
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
    situacao_fiscal_regular,
    indicios_adulteracao_presentes, veiculo_importado, pais_origem, matricula_origem,
    data_importacao, possui_coc, isencao_isv_aplicada, numero_dav,
    data_primeira_matricula, valor_base_iuc_anual
  ) values (
    v_inspection_id, p_matricula, p_marca, p_modelo, p_versao_trim, p_ano_fabrico, p_ano_modelo,
    p_cor, p_vin, p_numero_motor, p_numero_portas, p_combustivel, p_caixa_velocidades, p_tracao,
    p_potencia_cv, p_torque_nm, p_quilometragem,
    p_indicios_adulteracao_km, p_numero_proprietarios_anteriores, p_registo_acidentes_anteriores,
    p_historico_manutencao, p_inspecoes_periodicas_ipo_notas, p_inspecoes_periodicas_ipo_data,
    p_situacao_fiscal_regular,
    p_indicios_adulteracao_presentes, p_veiculo_importado, p_pais_origem, p_matricula_origem,
    p_data_importacao, p_possui_coc, p_isencao_isv_aplicada, p_numero_dav,
    p_data_primeira_matricula, p_valor_base_iuc_anual
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
-- supabase/tests/00040_historico_veiculo_v2.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'tecnicoE@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000041', 'Tecnico E', 'tecnicoE@test.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000041';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000041"}';

-- situacao_fiscal_regular agora é texto livre; bloco de importação completo
do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular',
    p_objetivo => 'compra',
    p_matricula => 'EE-55-FF',
    p_marca => 'Renault',
    p_modelo => 'Clio',
    p_nome_solicitante => 'Cliente E',
    p_quilometragem => 30000,
    p_situacao_fiscal_regular => 'IUC pago até 2026',
    p_indicios_adulteracao_presentes => true,
    p_indicios_adulteracao_km => 'Contador com dígitos desalinhados',
    p_veiculo_importado => true,
    p_pais_origem => 'Alemanha',
    p_matricula_origem => 'M-AB 1234',
    p_data_importacao => '2024-03-10',
    p_possui_coc => true,
    p_isencao_isv_aplicada => false,
    p_numero_dav => 'DAV-2024-000123',
    p_data_primeira_matricula => '2019-06-01',
    p_valor_base_iuc_anual => 145.50
  );

  select * into v_row from public.vehicle_data where inspection_id = v_id;

  if v_row.situacao_fiscal_regular <> 'IUC pago até 2026' then
    raise exception 'FALHOU: situacao_fiscal_regular deveria ser texto livre, foi %', v_row.situacao_fiscal_regular;
  end if;
  if v_row.indicios_adulteracao_presentes is not true then
    raise exception 'FALHOU: indicios_adulteracao_presentes deveria ser true';
  end if;
  if v_row.veiculo_importado is not true then
    raise exception 'FALHOU: veiculo_importado deveria ser true';
  end if;
  if v_row.pais_origem <> 'Alemanha' then
    raise exception 'FALHOU: pais_origem incorreto';
  end if;
  if v_row.data_primeira_matricula <> '2019-06-01' then
    raise exception 'FALHOU: data_primeira_matricula incorreta';
  end if;
  if v_row.valor_base_iuc_anual <> 145.50 then
    raise exception 'FALHOU: valor_base_iuc_anual incorreto, foi %', v_row.valor_base_iuc_anual;
  end if;

  raise notice 'OK: create_inspection grava situacao_fiscal_regular como texto e o bloco de importação';
end $$;

-- defaults: campos novos ficam false/null quando omitidos
do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'FF-66-GG',
    p_marca => 'Peugeot', p_modelo => '208', p_nome_solicitante => 'Cliente F', p_quilometragem => 5000
  );
  select * into v_row from public.vehicle_data where inspection_id = v_id;

  if v_row.indicios_adulteracao_presentes is not false then
    raise exception 'FALHOU: default de indicios_adulteracao_presentes deveria ser false';
  end if;
  if v_row.veiculo_importado is not false then
    raise exception 'FALHOU: default de veiculo_importado deveria ser false';
  end if;
  if v_row.pais_origem is not null then
    raise exception 'FALHOU: pais_origem deveria ficar null quando omitido';
  end if;
  if v_row.situacao_fiscal_regular is not null then
    raise exception 'FALHOU: situacao_fiscal_regular deveria ficar null quando omitido';
  end if;

  raise notice 'OK: defaults dos novos campos aplicados quando omitidos';
end $$;

-- regressão: parâmetros dos recortes anteriores (Histórico v1 + Equipamentos) continuam funcionando juntos
do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
  v_equip_count int;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'GG-77-HH',
    p_marca => 'Opel', p_modelo => 'Corsa', p_nome_solicitante => 'Cliente G', p_quilometragem => 12000,
    p_numero_proprietarios_anteriores => 1,
    p_historico_manutencao => 'Revisões em dia',
    p_equipamentos => '[{"ordem":0,"categoria":"seguranca","nome_equipamento":"Airbags","condicao":"bom","comentario":null,"personalizado":false}]'::jsonb
  );

  select * into v_row from public.vehicle_data where inspection_id = v_id;
  select count(*) into v_equip_count from public.equipamento_inspecao where inspection_id = v_id;

  if v_row.numero_proprietarios_anteriores <> 1 then
    raise exception 'FALHOU: numero_proprietarios_anteriores (recorte 3 v1) deveria continuar funcionando';
  end if;
  if v_equip_count <> 1 then
    raise exception 'FALHOU: p_equipamentos (recorte 3) deveria continuar inserindo em equipamento_inspecao';
  end if;

  raise notice 'OK: parâmetros de recortes anteriores continuam funcionando após 00040';
end $$;

-- situacao_fiscal_observacoes não existe mais
do $$
begin
  perform column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicle_data' and column_name = 'situacao_fiscal_observacoes';
  if found then
    raise exception 'FALHOU: situacao_fiscal_observacoes deveria ter sido removida';
  end if;
  raise notice 'OK: situacao_fiscal_observacoes removida de vehicle_data';
end $$;

rollback;
```

- [ ] **Step 3: Aplicar e rodar**

Run: `supabase db push --include-all` (ou o comando de push já usado nas migrações anteriores deste worktree), depois `psql "$DATABASE_URL" -f supabase/tests/00040_historico_veiculo_v2.test.sql`
Expected: todas as `raise notice 'OK: ...'` aparecem, nenhuma `raise exception`.

- [ ] **Step 4: Confirmar que os testes existentes de `create_inspection` continuam passando**

Run: `psql "$DATABASE_URL" -f supabase/tests/00038_historico_veiculo.test.sql && psql "$DATABASE_URL" -f supabase/tests/00039_equipamentos_inspecao.test.sql`
Expected: ambos ainda passam — se `00038`'s test chamar `p_situacao_fiscal_regular => true` ou `p_situacao_fiscal_observacoes => '...'` (tipos antigos), atualize esse teste para usar o novo formato (`p_situacao_fiscal_regular => 'IUC pago'`, sem `p_situacao_fiscal_observacoes`) antes de seguir — a assinatura antiga não existe mais.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00040_historico_veiculo_v2.sql supabase/tests/00040_historico_veiculo_v2.test.sql supabase/tests/00038_historico_veiculo.test.sql
git commit -m "feat: convert situação fiscal to free text, add importação/IUC fields to vehicle_data"
```

---

### Task 2: Schema Zod + mapeamento de aba

**Files:**
- Modify: `lib/inspection/schema.ts`
- Modify: `lib/inspection/tabs.ts`
- Modify: `app/(app)/inspections/new/actions.ts` (uma linha — ver Step 5; o resto do wiring é da Task 6)
- Test: `lib/inspection/schema.test.ts`
- Test: `lib/inspection/tabs.test.ts`
- Modify: `app/(app)/inspections/new/actions.test.ts` (um teste existente encapsula o tipo antigo de `situacaoFiscalRegular` — ver Step 5)

**Interfaces:**
- Consumes: nada de outras tasks (Zod é independente do banco).
- Produces: `InspectionFormValues` ganha `situacaoFiscalRegular: string | undefined` (era boolean), perde `situacaoFiscalObservacoes`, ganha `indiciosAdulteracaoPresentes: "sim" | "nao" | undefined`, `veiculoImportado: "sim" | "nao" | undefined`, `paisOrigem: string | undefined`, `matriculaOrigem: string | undefined`, `dataImportacao: string | undefined`, `possuiCoc: "sim" | "nao" | undefined`, `isencaoIsvAplicada: "sim" | "nao" | undefined`, `numeroDav: string | undefined`, `dataPrimeiraMatricula: string | undefined`, `valorBaseIucAnual: number | undefined`. `lib/inspection/tabs.ts` mapeia todos esses campos novos para `"historico"`. Task 3-5 (componentes) e Task 6 (Server Action) consomem esses nomes de campo exatos.

- [ ] **Step 1: Testes do schema — escrever primeiro**

Em `lib/inspection/schema.test.ts`, substitua o teste `"coerces situacaoFiscalRegular checkbox value 'on' to true"` (linhas finais do arquivo) por:

```ts
  it("accepts situacaoFiscalRegular as free text", () => {
    const result = inspectionFormSchema.safeParse({ ...base, situacaoFiscalRegular: "IUC pago até 2026" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.situacaoFiscalRegular).toBe("IUC pago até 2026");
  });

  it("accepts the importação block left blank", () => {
    const result = inspectionFormSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.veiculoImportado).toBeUndefined();
      expect(result.data.paisOrigem).toBeUndefined();
    }
  });

  it("accepts a full importação block", () => {
    const result = inspectionFormSchema.safeParse({
      ...base,
      veiculoImportado: "sim",
      paisOrigem: "Alemanha",
      matriculaOrigem: "M-AB 1234",
      dataImportacao: "2024-03-10",
      possuiCoc: "sim",
      isencaoIsvAplicada: "nao",
      numeroDav: "DAV-2024-000123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.veiculoImportado).toBe("sim");
      expect(result.data.possuiCoc).toBe("sim");
    }
  });

  it("coerces a blank valorBaseIucAnual to undefined instead of 0", () => {
    const result = inspectionFormSchema.safeParse({ ...base, valorBaseIucAnual: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.valorBaseIucAnual).toBeUndefined();
  });

  it("accepts a numeric valorBaseIucAnual", () => {
    const result = inspectionFormSchema.safeParse({ ...base, valorBaseIucAnual: "145.50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.valorBaseIucAnual).toBe(145.5);
  });

  it("accepts indiciosAdulteracaoPresentes left blank", () => {
    const result = inspectionFormSchema.safeParse(base);
    expect(result.success).toBe(true);
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run lib/inspection/schema.test.ts`
Expected: FAIL — `situacaoFiscalRegular` ainda é boolean-preprocessado, campos novos (`veiculoImportado`, `paisOrigem` etc.) não existem no schema.

- [ ] **Step 3: Implementar o schema**

Em `lib/inspection/schema.ts`, substitua as duas linhas:

```ts
    situacaoFiscalRegular: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
    situacaoFiscalObservacoes: z.string().optional(),
```

por:

```ts
    situacaoFiscalRegular: z.string().optional(),
    indiciosAdulteracaoPresentes: z.enum(["sim", "nao"]).optional(),
    veiculoImportado: z.enum(["sim", "nao"]).optional(),
    paisOrigem: z.string().optional(),
    matriculaOrigem: z.string().optional(),
    dataImportacao: z.string().optional(),
    possuiCoc: z.enum(["sim", "nao"]).optional(),
    isencaoIsvAplicada: z.enum(["sim", "nao"]).optional(),
    numeroDav: z.string().optional(),
    dataPrimeiraMatricula: z.string().optional(),
    valorBaseIucAnual: optionalNumber,
```

(`optionalNumber` já existe no topo do arquivo — mesmo helper usado por `torqueNm`.)

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run lib/inspection/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Corrigir `actions.ts`/`actions.test.ts` pro tipo novo de `situacaoFiscalRegular`**

Em `app/(app)/inspections/new/actions.test.ts`, o teste `"calls create_inspection with mapped params and redirects on success"` faz `formData.set("situacaoFiscalRegular", "on")` e espera `p_situacao_fiscal_regular: true`. Troque para:

```ts
    formData.set("situacaoFiscalRegular", "IUC em dia");
```

e troque a asserção `p_situacao_fiscal_regular: true,` por `p_situacao_fiscal_regular: "IUC em dia",`.

Em `app/(app)/inspections/new/actions.ts`, remova a linha `p_situacao_fiscal_observacoes: v.situacaoFiscalObservacoes || null,` — o campo `situacaoFiscalObservacoes` não existe mais em `InspectionFormValues` (Step 3 acima), então essa linha vira um erro de tipo (`Property 'situacaoFiscalObservacoes' does not exist`) assim que o schema mudar. Só remova a linha por agora; `p_situacao_fiscal_regular: v.situacaoFiscalRegular,` fica como está (a Task 6 ajusta o fallback `|| null` e adiciona os parâmetros novos).

- [ ] **Step 6: Rodar e confirmar sucesso**

Run: `npm test -- --run "app/(app)/inspections/new/actions.test.ts" && npx tsc --noEmit`
Expected: PASS, sem erros de tipo.

- [ ] **Step 7: Teste do mapeamento de aba — escrever primeiro**

Em `lib/inspection/tabs.test.ts`, substitua o array do teste `"maps every historico field to the historico tab"` por:

```ts
    for (const field of [
      "indiciosAdulteracaoKm",
      "indiciosAdulteracaoPresentes",
      "numeroProprietariosAnteriores",
      "registoAcidentesAnteriores",
      "historicoManutencao",
      "inspecoesPeriodicasIpoNotas",
      "inspecoesPeriodicasIpoData",
      "situacaoFiscalRegular",
      "veiculoImportado",
      "paisOrigem",
      "matriculaOrigem",
      "dataImportacao",
      "possuiCoc",
      "isencaoIsvAplicada",
      "numeroDav",
      "dataPrimeiraMatricula",
      "valorBaseIucAnual",
    ]) {
      expect(resolveTabForField(field)).toBe("historico");
    }
```

- [ ] **Step 8: Rodar e confirmar falha**

Run: `npm test -- --run lib/inspection/tabs.test.ts`
Expected: FAIL — os campos novos não estão em `FIELD_TO_TAB`.

- [ ] **Step 9: Implementar o mapeamento**

Em `lib/inspection/tabs.ts`, substitua:

```ts
  situacaoFiscalRegular: "historico",
  situacaoFiscalObservacoes: "historico",
```

por:

```ts
  situacaoFiscalRegular: "historico",
  indiciosAdulteracaoPresentes: "historico",
  veiculoImportado: "historico",
  paisOrigem: "historico",
  matriculaOrigem: "historico",
  dataImportacao: "historico",
  possuiCoc: "historico",
  isencaoIsvAplicada: "historico",
  numeroDav: "historico",
  dataPrimeiraMatricula: "historico",
  valorBaseIucAnual: "historico",
```

- [ ] **Step 10: Rodar e confirmar sucesso**

Run: `npm test -- --run lib/inspection/tabs.test.ts`
Expected: PASS

- [ ] **Step 11: Rodar toda a suíte e commit**

Run: `npm test -- --run`
Expected: PASS em todos os arquivos.

```bash
git add lib/inspection/schema.ts lib/inspection/schema.test.ts lib/inspection/tabs.ts lib/inspection/tabs.test.ts "app/(app)/inspections/new/actions.ts" "app/(app)/inspections/new/actions.test.ts"
git commit -m "feat: extend inspection schema with importação/IUC fields, situação fiscal as text"
```

---

### Task 3: Componente `SimNaoRadio`

**Files:**
- Create: `app/(app)/inspections/new/sim-nao-radio.tsx`
- Test: `app/(app)/inspections/new/sim-nao-radio.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `SimNaoRadio({ name, label, value, onChange }: { name: string; label: string; value: "" | "sim" | "nao"; onChange: (value: "sim" | "nao") => void })`. Task 7 (UI Histórico) usa este componente 4 vezes.

- [ ] **Step 1: Teste do componente**

```tsx
// app/(app)/inspections/new/sim-nao-radio.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SimNaoRadio } from "./sim-nao-radio";

describe("SimNaoRadio", () => {
  it("renders the label and both options unchecked when value is blank", () => {
    render(<SimNaoRadio name="veiculoImportado" label="Veículo importado?" value="" onChange={() => {}} />);
    expect(screen.getByText("Veículo importado?")).toBeInTheDocument();
    expect((screen.getByLabelText("Sim (Veículo importado?)") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Não (Veículo importado?)") as HTMLInputElement).checked).toBe(false);
  });

  it("reflects value='sim' as the checked option", () => {
    render(<SimNaoRadio name="veiculoImportado" label="Veículo importado?" value="sim" onChange={() => {}} />);
    expect((screen.getByLabelText("Sim (Veículo importado?)") as HTMLInputElement).checked).toBe(true);
  });

  it("calls onChange with 'nao' when the Não option is picked", () => {
    let picked: "sim" | "nao" | null = null;
    render(<SimNaoRadio name="veiculoImportado" label="Veículo importado?" value="" onChange={(v) => (picked = v)} />);
    fireEvent.click(screen.getByLabelText("Não (Veículo importado?)"));
    expect(picked).toBe("nao");
  });

  it("shares the same name attribute across both options", () => {
    render(<SimNaoRadio name="veiculoImportado" label="Veículo importado?" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Sim (Veículo importado?)")).toHaveAttribute("name", "veiculoImportado");
    expect(screen.getByLabelText("Não (Veículo importado?)")).toHaveAttribute("name", "veiculoImportado");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run app/\(app\)/inspections/new/sim-nao-radio.test.tsx`
Expected: FAIL with "Failed to resolve import" / module not found (`./sim-nao-radio` ainda não existe).

- [ ] **Step 3: Implementar o componente**

```tsx
// app/(app)/inspections/new/sim-nao-radio.tsx
"use client";

export function SimNaoRadio({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: "" | "sim" | "nao";
  onChange: (value: "sim" | "nao") => void;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="sim-nao-radio">
        <label>
          <input
            type="radio"
            name={name}
            value="sim"
            checked={value === "sim"}
            onChange={() => onChange("sim")}
            aria-label={`Sim (${label})`}
          />
          Sim
        </label>
        <label>
          <input
            type="radio"
            name={name}
            value="nao"
            checked={value === "nao"}
            onChange={() => onChange("nao")}
            aria-label={`Não (${label})`}
          />
          Não
        </label>
      </div>
    </div>
  );
}
```

Em `app/globals.css`, logo após o bloco `.equip-item__condicao` (linhas ~724-727), adicione:

```css
.sim-nao-radio {
  display: flex;
  gap: var(--space-4);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run app/\(app\)/inspections/new/sim-nao-radio.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/new/sim-nao-radio.tsx" "app/(app)/inspections/new/sim-nao-radio.test.tsx" app/globals.css
git commit -m "feat: add SimNaoRadio shared component"
```

---

### Task 4: Componente `PaisOrigemSelect`

**Files:**
- Create: `lib/historico/paises.ts`
- Create: `app/(app)/inspections/new/pais-origem-select.tsx`
- Test: `app/(app)/inspections/new/pais-origem-select.test.tsx`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `PAISES_ORIGEM_COMUNS: readonly string[]` (`lib/historico/paises.ts`). `PaisOrigemSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void })` — sempre renderiza **um único** campo submetido com `name="paisOrigem"` (select quando o país está na lista, input de texto quando é "Outro"), mesmo padrão do hidden-input-swap já usado para `objetivo` em `new-inspection-form.tsx:167`. Task 7 usa este componente.

- [ ] **Step 1: Teste do catálogo de países**

```ts
// lib/historico/paises.test.ts
import { describe, it, expect } from "vitest";
import { PAISES_ORIGEM_COMUNS } from "./paises";

describe("PAISES_ORIGEM_COMUNS", () => {
  it("has a short curated list of common origin countries", () => {
    expect(PAISES_ORIGEM_COMUNS.length).toBeGreaterThan(0);
    expect(PAISES_ORIGEM_COMUNS).toContain("Alemanha");
  });

  it("has no duplicate entries", () => {
    expect(new Set(PAISES_ORIGEM_COMUNS).size).toBe(PAISES_ORIGEM_COMUNS.length);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run lib/historico/paises.test.ts`
Expected: FAIL — módulo `./paises` não existe.

- [ ] **Step 3: Implementar o catálogo**

```ts
// lib/historico/paises.ts
export const PAISES_ORIGEM_COMUNS = [
  "Alemanha",
  "França",
  "Espanha",
  "Itália",
  "Bélgica",
  "Holanda",
  "Luxemburgo",
] as const;
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run lib/historico/paises.test.ts`
Expected: PASS

- [ ] **Step 5: Teste do componente `PaisOrigemSelect`**

```tsx
// app/(app)/inspections/new/pais-origem-select.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaisOrigemSelect } from "./pais-origem-select";

describe("PaisOrigemSelect", () => {
  it("renders a select with the common countries and an Outro option", () => {
    render(<PaisOrigemSelect id="paisOrigem" value="" onChange={() => {}} />);
    const select = screen.getByLabelText("País de origem / importação") as HTMLSelectElement;
    expect(select).toHaveAttribute("name", "paisOrigem");
    expect(screen.getByRole("option", { name: "Alemanha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Outro" })).toBeInTheDocument();
  });

  it("calls onChange with the picked country", () => {
    let picked = "";
    render(<PaisOrigemSelect id="paisOrigem" value="" onChange={(v) => (picked = v)} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "Alemanha" } });
    expect(picked).toBe("Alemanha");
  });

  it("switches to a free-text input named paisOrigem when Outro is picked", () => {
    render(<PaisOrigemSelect id="paisOrigem" value="" onChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "__outro__" } });

    const input = screen.getByLabelText("País de origem / importação") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("name", "paisOrigem");
  });

  it("lets typing in the Outro input drive onChange", () => {
    let value = "";
    const { rerender } = render(<PaisOrigemSelect id="paisOrigem" value={value} onChange={(v) => (value = v)} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "__outro__" } });
    rerender(<PaisOrigemSelect id="paisOrigem" value={value} onChange={(v) => (value = v)} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "Andorra" } });
    expect(value).toBe("Andorra");
  });

  it("returns to select mode when 'Escolher da lista' is clicked", () => {
    render(<PaisOrigemSelect id="paisOrigem" value="" onChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "__outro__" } });
    fireEvent.click(screen.getByText("Escolher da lista"));
    expect((screen.getByLabelText("País de origem / importação") as HTMLSelectElement).tagName).toBe("SELECT");
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `npm test -- --run app/\(app\)/inspections/new/pais-origem-select.test.tsx`
Expected: FAIL — módulo `./pais-origem-select` não existe.

- [ ] **Step 7: Implementar o componente**

```tsx
// app/(app)/inspections/new/pais-origem-select.tsx
"use client";

import { useState } from "react";
import { PAISES_ORIGEM_COMUNS } from "@/lib/historico/paises";

export function PaisOrigemSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [modoOutro, setModoOutro] = useState(
    value !== "" && !(PAISES_ORIGEM_COMUNS as readonly string[]).includes(value)
  );

  return (
    <div className="field">
      <label htmlFor={id} className="label">
        País de origem / importação
      </label>
      {modoOutro ? (
        <input
          id={id}
          name="paisOrigem"
          className="input"
          placeholder="Nome do país"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <select
          id={id}
          name="paisOrigem"
          className="input"
          value={value}
          onChange={(e) => {
            if (e.target.value === "__outro__") {
              setModoOutro(true);
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="">Selecione</option>
          {PAISES_ORIGEM_COMUNS.map((pais) => (
            <option key={pais} value={pais}>
              {pais}
            </option>
          ))}
          <option value="__outro__">Outro</option>
        </select>
      )}
      {modoOutro && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setModoOutro(false);
            onChange("");
          }}
        >
          Escolher da lista
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `npm test -- --run app/\(app\)/inspections/new/pais-origem-select.test.tsx`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add lib/historico/paises.ts lib/historico/paises.test.ts "app/(app)/inspections/new/pais-origem-select.tsx" "app/(app)/inspections/new/pais-origem-select.test.tsx"
git commit -m "feat: add PaisOrigemSelect component with hardcoded common-countries list"
```

---

### Task 5: Componente `ValorMoedaInput`

**Files:**
- Create: `app/(app)/inspections/new/valor-moeda-input.tsx`
- Test: `app/(app)/inspections/new/valor-moeda-input.test.tsx`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `ValorMoedaInput({ id, name, label, value, onChange }: { id: string; name: string; label: string; value: string; onChange: (value: string) => void })` — submete o valor numérico bruto via um `<input type="hidden" name={name}>` (nunca a string formatada em euros), e mostra um input visível sem `name` que formata em pt-PT/EUR ao perder o foco. Task 7 usa este componente pro campo "Valor base IUC anual".

- [ ] **Step 1: Teste do componente**

```tsx
// app/(app)/inspections/new/valor-moeda-input.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ValorMoedaInput } from "./valor-moeda-input";

describe("ValorMoedaInput", () => {
  it("shows the raw value while focused", () => {
    render(
      <ValorMoedaInput id="valorBaseIucAnual" name="valorBaseIucAnual" label="Valor base IUC anual (€)" value="145.5" onChange={() => {}} />
    );
    const input = screen.getByLabelText("Valor base IUC anual (€)") as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.value).toBe("145.5");
  });

  it("formats as pt-PT currency once blurred", () => {
    render(
      <ValorMoedaInput id="valorBaseIucAnual" name="valorBaseIucAnual" label="Valor base IUC anual (€)" value="145.5" onChange={() => {}} />
    );
    const input = screen.getByLabelText("Valor base IUC anual (€)") as HTMLInputElement;
    fireEvent.blur(input);
    expect(input.value).toContain("145,50");
    expect(input.value).toContain("€");
  });

  it("strips non-numeric characters on change and calls onChange with the raw string", () => {
    let raw = "";
    render(
      <ValorMoedaInput id="valorBaseIucAnual" name="valorBaseIucAnual" label="Valor base IUC anual (€)" value="" onChange={(v) => (raw = v)} />
    );
    fireEvent.change(screen.getByLabelText("Valor base IUC anual (€)"), { target: { value: "1a4b5" } });
    expect(raw).toBe("145");
  });

  it("submits the raw numeric value via a hidden input, not the formatted display", () => {
    const { container } = render(
      <ValorMoedaInput id="valorBaseIucAnual" name="valorBaseIucAnual" label="Valor base IUC anual (€)" value="145.5" onChange={() => {}} />
    );
    const hidden = container.querySelector('input[type="hidden"][name="valorBaseIucAnual"]') as HTMLInputElement;
    expect(hidden.value).toBe("145.5");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run app/\(app\)/inspections/new/valor-moeda-input.test.tsx`
Expected: FAIL — módulo `./valor-moeda-input` não existe.

- [ ] **Step 3: Implementar o componente**

```tsx
// app/(app)/inspections/new/valor-moeda-input.tsx
"use client";

import { useState } from "react";

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);
}

export function ValorMoedaInput({
  id,
  name,
  label,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [foco, setFoco] = useState(false);
  const numero = Number(value.replace(",", "."));
  const formatoValido = value !== "" && !Number.isNaN(numero);

  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input type="hidden" name={name} value={value} />
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={!foco && formatoValido ? formatarMoeda(numero) : value}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,.-]/g, ""))}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run app/\(app\)/inspections/new/valor-moeda-input.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/new/valor-moeda-input.tsx" "app/(app)/inspections/new/valor-moeda-input.test.tsx"
git commit -m "feat: add ValorMoedaInput component with pt-PT currency formatting on blur"
```

---

### Task 6: Server Action — repassar os novos parâmetros pro RPC

**Files:**
- Modify: `app/(app)/inspections/new/actions.ts:114-115`
- Test: `app/(app)/inspections/new/actions.test.ts`

**Interfaces:**
- Consumes: `InspectionFormValues` de Task 2 (`situacaoFiscalRegular: string | undefined`, `indiciosAdulteracaoPresentes`, `veiculoImportado`, `paisOrigem`, `matriculaOrigem`, `dataImportacao`, `possuiCoc`, `isencaoIsvAplicada`, `numeroDav`, `dataPrimeiraMatricula`, `valorBaseIucAnual`); parâmetros do RPC de Task 1 (`p_situacao_fiscal_regular text`, `p_indicios_adulteracao_presentes`, `p_veiculo_importado`, `p_pais_origem`, `p_matricula_origem`, `p_data_importacao`, `p_possui_coc`, `p_isencao_isv_aplicada`, `p_numero_dav`, `p_data_primeira_matricula`, `p_valor_base_iuc_anual`).
- Produces: nada de novo pra outras tasks — este é o ponto de wiring final entre schema e RPC.

- [ ] **Step 1: Teste — FormData vira os novos parâmetros do RPC**

Em `app/(app)/inspections/new/actions.test.ts`, adicione (após o teste `"calls create_inspection with mapped params and redirects on success"` já corrigido na Task 2):

```ts
  it("maps the importação block and IUC fields to the RPC params", async () => {
    rpc.mockResolvedValue({ data: "88888888-8888-8888-8888-888888888888", error: null });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");
    formData.set("indiciosAdulteracaoPresentes", "sim");
    formData.set("indiciosAdulteracaoKm", "Contador com dígitos desalinhados");
    formData.set("veiculoImportado", "sim");
    formData.set("paisOrigem", "Alemanha");
    formData.set("matriculaOrigem", "M-AB 1234");
    formData.set("dataImportacao", "2024-03-10");
    formData.set("possuiCoc", "sim");
    formData.set("isencaoIsvAplicada", "nao");
    formData.set("numeroDav", "DAV-2024-000123");
    formData.set("dataPrimeiraMatricula", "2019-06-01");
    formData.set("valorBaseIucAnual", "145.50");

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/88888888-8888-8888-8888-888888888888"
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_inspection",
      expect.objectContaining({
        p_indicios_adulteracao_presentes: true,
        p_veiculo_importado: true,
        p_pais_origem: "Alemanha",
        p_matricula_origem: "M-AB 1234",
        p_data_importacao: "2024-03-10",
        p_possui_coc: true,
        p_isencao_isv_aplicada: false,
        p_numero_dav: "DAV-2024-000123",
        p_data_primeira_matricula: "2019-06-01",
        p_valor_base_iuc_anual: 145.5,
      })
    );
  });

  it("defaults the importação block to false/null when veiculoImportado isn't set", async () => {
    rpc.mockResolvedValue({ data: "99999999-9999-9999-9999-999999999999", error: null });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/99999999-9999-9999-9999-999999999999"
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_inspection",
      expect.objectContaining({
        p_indicios_adulteracao_presentes: false,
        p_veiculo_importado: false,
        p_pais_origem: null,
        p_possui_coc: null,
        p_isencao_isv_aplicada: null,
        p_valor_base_iuc_anual: null,
      })
    );
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run "app/(app)/inspections/new/actions.test.ts"`
Expected: FAIL — os dois testes novos deste step falham porque `actions.ts` ainda não envia nenhum dos parâmetros do bloco importação/IUC (os outros testes do arquivo, já ajustados na Task 2, continuam passando).

- [ ] **Step 3: Implementar o wiring**

Em `app/(app)/inspections/new/actions.ts`, a linha `p_situacao_fiscal_observacoes: ...` já foi removida na Task 2 (Step 5). Substitua a linha restante:

```ts
    p_situacao_fiscal_regular: v.situacaoFiscalRegular,
```

por:

```ts
    p_situacao_fiscal_regular: v.situacaoFiscalRegular || null,
```

E, logo depois do bloco `p_equipamentos: equipamentos.map(...)` (fecha com `}),`), adicione:

```ts
    p_indicios_adulteracao_presentes: v.indiciosAdulteracaoPresentes === "sim",
    p_veiculo_importado: v.veiculoImportado === "sim",
    p_pais_origem: v.paisOrigem || null,
    p_matricula_origem: v.matriculaOrigem || null,
    p_data_importacao: v.dataImportacao || null,
    p_possui_coc: v.possuiCoc === undefined ? null : v.possuiCoc === "sim",
    p_isencao_isv_aplicada: v.isencaoIsvAplicada === undefined ? null : v.isencaoIsvAplicada === "sim",
    p_numero_dav: v.numeroDav || null,
    p_data_primeira_matricula: v.dataPrimeiraMatricula || null,
    p_valor_base_iuc_anual: v.valorBaseIucAnual ?? null,
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run "app/(app)/inspections/new/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Rodar toda a suíte**

Run: `npm test -- --run`
Expected: PASS em todos os arquivos.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/new/actions.ts" "app/(app)/inspections/new/actions.test.ts"
git commit -m "feat: pass importação/IUC fields and free-text situação fiscal to create_inspection"
```

---

### Task 7: UI da aba Histórico — integrar os componentes no formulário

**Files:**
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx`
- Test: `app/(app)/inspections/new/new-inspection-form.test.tsx`

**Interfaces:**
- Consumes: `SimNaoRadio` (Task 3), `PaisOrigemSelect` (Task 4), `ValorMoedaInput` (Task 5), campos do schema de Task 2.
- Produces: nada de novo pra outras tasks — ponto final da integração de UI de Histórico.

- [ ] **Step 1: Atualizar o teste existente que checava o campo antigo**

Em `app/(app)/inspections/new/new-inspection-form.test.tsx`, no teste `"shows the Histórico fields, including quilometragem moved from Identificação"` (linha ~146), troque a linha:

```ts
    expect(screen.getByLabelText("Indícios de adulteração de quilometragem")).toBeVisible();
```

por:

```ts
    expect(screen.getByText("Indícios de adulteração de quilometragem?")).toBeVisible();
```

- [ ] **Step 2: Novos testes — situação fiscal como texto único e bloco de importação condicional**

No mesmo arquivo, adicione ao final do `describe("NewInspectionForm", ...)`:

```tsx
  it("renders situação fiscal as a single free-text field, not a checkbox", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    const campo = screen.getByLabelText("Situação fiscal (ex.: IUC em dia)");
    expect(campo.tagName).toBe("TEXTAREA");
    expect(screen.queryByLabelText("Observações sobre a situação fiscal")).not.toBeInTheDocument();
  });

  it("shows the anotações field for indícios de adulteração only when 'Sim' is picked", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    const anotacoes = screen.getByLabelText("Anotações / Detalhes dos indícios de adulteração");
    expect(anotacoes).not.toBeVisible();

    fireEvent.click(screen.getByLabelText("Sim (Indícios de adulteração de quilometragem?)"));
    expect(anotacoes).toBeVisible();
  });

  it("shows the importação block only when 'Veículo importado?' is 'Sim'", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    const paisOrigem = screen.getByLabelText("País de origem / importação");
    expect(paisOrigem).not.toBeVisible();

    fireEvent.click(screen.getByLabelText("Sim (Veículo importado?)"));
    expect(paisOrigem).toBeVisible();
    expect(screen.getByLabelText("Matrícula de origem (estrangeira)")).toBeVisible();
    expect(screen.getByLabelText("Data de importação")).toBeVisible();
    expect(screen.getByText("Possui Certificado de Conformidade (COC)?")).toBeVisible();
    expect(screen.getByText("Isenção de ISV aplicada?")).toBeVisible();
    expect(screen.getByLabelText("Número da DAV / Registo de Legalização")).toBeVisible();

    fireEvent.click(screen.getByLabelText("Não (Veículo importado?)"));
    expect(paisOrigem).not.toBeVisible();
  });

  it("renders data da primeira matrícula and valor base IUC anual as standalone fields", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    expect(screen.getByLabelText("Data da primeira matrícula")).toBeVisible();
    expect(screen.getByLabelText("Valor base IUC anual (€)")).toBeVisible();
  });
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npm test -- --run "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: FAIL — o formulário ainda tem o checkbox antigo, não tem os componentes novos nem o bloco de importação.

- [ ] **Step 4: Implementar — imports e estado**

Em `app/(app)/inspections/new/new-inspection-form.tsx`, adicione aos imports (depois de `import { EquipamentoPersonalizadoDialog } ...`):

```tsx
import { SimNaoRadio } from "./sim-nao-radio";
import { PaisOrigemSelect } from "./pais-origem-select";
import { ValorMoedaInput } from "./valor-moeda-input";
```

Substitua as duas linhas de estado:

```tsx
  const [situacaoFiscalRegular, setSituacaoFiscalRegular] = useState(false);
  const [situacaoFiscalObservacoes, setSituacaoFiscalObservacoes] = useState("");
```

por:

```tsx
  const [situacaoFiscalRegular, setSituacaoFiscalRegular] = useState("");
  const [indiciosAdulteracaoPresentes, setIndiciosAdulteracaoPresentes] = useState<"" | "sim" | "nao">("");
  const [veiculoImportado, setVeiculoImportado] = useState<"" | "sim" | "nao">("");
  const [paisOrigem, setPaisOrigem] = useState("");
  const [matriculaOrigem, setMatriculaOrigem] = useState("");
  const [dataImportacao, setDataImportacao] = useState("");
  const [possuiCoc, setPossuiCoc] = useState<"" | "sim" | "nao">("");
  const [isencaoIsvAplicada, setIsencaoIsvAplicada] = useState<"" | "sim" | "nao">("");
  const [numeroDav, setNumeroDav] = useState("");
  const [dataPrimeiraMatricula, setDataPrimeiraMatricula] = useState("");
  const [valorBaseIucAnual, setValorBaseIucAnual] = useState("");
```

- [ ] **Step 5: Implementar — trocar o bloco de indícios de adulteração**

Substitua:

```tsx
            <TextareaWithCounter
              id="indiciosAdulteracaoKm"
              name="indiciosAdulteracaoKm"
              label="Indícios de adulteração de quilometragem"
              value={indiciosAdulteracaoKm}
              onChange={setIndiciosAdulteracaoKm}
              maxSoft={500}
            />
```

por:

```tsx
            <SimNaoRadio
              name="indiciosAdulteracaoPresentes"
              label="Indícios de adulteração de quilometragem?"
              value={indiciosAdulteracaoPresentes}
              onChange={setIndiciosAdulteracaoPresentes}
            />

            <div hidden={indiciosAdulteracaoPresentes !== "sim"}>
              <TextareaWithCounter
                id="indiciosAdulteracaoKm"
                name="indiciosAdulteracaoKm"
                label="Anotações / Detalhes dos indícios de adulteração"
                value={indiciosAdulteracaoKm}
                onChange={setIndiciosAdulteracaoKm}
                maxSoft={500}
              />
            </div>
```

- [ ] **Step 6: Implementar — trocar o bloco de situação fiscal e adicionar o bloco de importação + campos soltos**

Substitua:

```tsx
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

por:

```tsx
            <TextareaWithCounter
              id="situacaoFiscalRegular"
              name="situacaoFiscalRegular"
              label="Situação fiscal (ex.: IUC em dia)"
              value={situacaoFiscalRegular}
              onChange={setSituacaoFiscalRegular}
              maxSoft={200}
            />

            <SimNaoRadio
              name="veiculoImportado"
              label="Veículo importado?"
              value={veiculoImportado}
              onChange={setVeiculoImportado}
            />

            <div className="form-grid" hidden={veiculoImportado !== "sim"}>
              <PaisOrigemSelect id="paisOrigem" value={paisOrigem} onChange={setPaisOrigem} />

              <div className="field">
                <label htmlFor="matriculaOrigem" className="label">
                  Matrícula de origem (estrangeira)
                </label>
                <input
                  id="matriculaOrigem"
                  name="matriculaOrigem"
                  className="input"
                  value={matriculaOrigem}
                  onChange={(e) => setMatriculaOrigem(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="dataImportacao" className="label">
                  Data de importação
                </label>
                <input
                  id="dataImportacao"
                  name="dataImportacao"
                  type="date"
                  className="input"
                  value={dataImportacao}
                  onChange={(e) => setDataImportacao(e.target.value)}
                />
              </div>

              <SimNaoRadio
                name="possuiCoc"
                label="Possui Certificado de Conformidade (COC)?"
                value={possuiCoc}
                onChange={setPossuiCoc}
              />

              <SimNaoRadio
                name="isencaoIsvAplicada"
                label="Isenção de ISV aplicada?"
                value={isencaoIsvAplicada}
                onChange={setIsencaoIsvAplicada}
              />

              <div className="field">
                <label htmlFor="numeroDav" className="label">
                  Número da DAV / Registo de Legalização
                </label>
                <input
                  id="numeroDav"
                  name="numeroDav"
                  className="input"
                  value={numeroDav}
                  onChange={(e) => setNumeroDav(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="dataPrimeiraMatricula" className="label">
                Data da primeira matrícula
              </label>
              <input
                id="dataPrimeiraMatricula"
                name="dataPrimeiraMatricula"
                type="date"
                className="input"
                value={dataPrimeiraMatricula}
                onChange={(e) => setDataPrimeiraMatricula(e.target.value)}
              />
            </div>

            <ValorMoedaInput
              id="valorBaseIucAnual"
              name="valorBaseIucAnual"
              label="Valor base IUC anual (€)"
              value={valorBaseIucAnual}
              onChange={setValorBaseIucAnual}
            />
          </div>
        </fieldset>
      </div>
```

- [ ] **Step 7: Rodar e confirmar sucesso**

Run: `npm test -- --run "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: PASS

- [ ] **Step 8: Rodar toda a suíte e `tsc --noEmit`**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: PASS / sem erros de tipo (`situacaoFiscalObservacoes` não pode sobrar em nenhum arquivo — grep pra confirmar: `grep -rn situacaoFiscalObservacoes app lib` deve retornar vazio).

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/inspections/new/new-inspection-form.tsx" "app/(app)/inspections/new/new-inspection-form.test.tsx"
git commit -m "feat: wire situação fiscal, indícios de adulteração gate and importação block into Histórico tab"
```

---

### Task 8: Equipamentos — acordeão fechado por padrão + compactação automática do item

**Files:**
- Modify: `app/(app)/inspections/new/equipamento-categoria.tsx`
- Test: `app/(app)/inspections/new/equipamento-categoria.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nenhum de outras tasks desta plano (é uma mudança isolada ao componente já existente do recorte 3).
- Produces: `EquipamentoItem` ganha estado local `expandido` e a lógica de compactação/reabertura. Task 9 (badge) constrói em cima do mesmo arquivo, adicionando o prop `onVerificadoChange` — escreva esta task primeiro pra não conflitar.

- [ ] **Step 1: Teste — acordeão inicia fechado**

Em `app/(app)/inspections/new/equipamento-categoria.test.tsx`, adicione ao `describe("EquipamentoCategoria", ...)`:

```tsx
  it("starts the category accordion closed", () => {
    const { container } = renderCategoria();
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run "app/(app)/inspections/new/equipamento-categoria.test.tsx"`
Expected: FAIL — `<details open>` ainda começa aberto.

- [ ] **Step 3: Implementar — remover `open`**

Em `equipamento-categoria.tsx`, na função `EquipamentoCategoria`, troque:

```tsx
    <details className="equip-categoria" open>
```

por:

```tsx
    <details className="equip-categoria">
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run "app/(app)/inspections/new/equipamento-categoria.test.tsx"`
Expected: PASS

- [ ] **Step 5: Testes — compactação automática do item**

No mesmo arquivo, adicione:

```tsx
  it("compacts the item on blur after choosing condição Bom", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));

    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.blur(item, { relatedTarget: null });

    expect(screen.getByLabelText("Sistema ABS/ESP")).not.toBeVisible();
    expect(screen.getByText("Sistema ABS/ESP — ✓ Bom")).toBeVisible();
  });

  it("compacts the item on blur after choosing condição Atenção", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));
    fireEvent.change(screen.getByLabelText("Comentário (Sistema ABS/ESP)"), {
      target: { value: "Ruído no arranque" },
    });

    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.blur(item, { relatedTarget: null });

    expect(screen.getByText("Sistema ABS/ESP — ⚠️ Atenção")).toBeVisible();
  });

  it("does not compact when focus moves between fields inside the same item", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));

    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    const condicaoBom = screen.getByLabelText("✓ Bom (Sistema ABS/ESP)");
    fireEvent.blur(item, { relatedTarget: condicaoBom });

    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeVisible();
  });

  it("does not compact a selected item before a condição is chosen", () => {
    renderCategoria();
    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.blur(item, { relatedTarget: null });

    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeVisible();
  });

  it("reopens a compacted item when its summary is clicked", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));
    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.blur(item, { relatedTarget: null });

    fireEvent.click(screen.getByText("Sistema ABS/ESP — ✓ Bom"));

    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeVisible();
    expect(screen.queryByText("Sistema ABS/ESP — ✓ Bom")).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `npm test -- --run "app/(app)/inspections/new/equipamento-categoria.test.tsx"`
Expected: FAIL — nenhuma lógica de compactação existe ainda.

- [ ] **Step 7: Implementar a compactação em `EquipamentoItem`**

Em `equipamento-categoria.tsx`, substitua a função `EquipamentoItem` inteira por:

```tsx
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
  const [expandido, setExpandido] = useState(true);

  function handleSelecionadoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setSelecionado(checked);
    if (checked) setExpandido(true);
  }

  // Só compacta quando o foco sai do item inteiro (não ao tabular entre
  // condição/comentário/foto do mesmo item) e só depois de uma condição
  // escolhida — vale igual pra "Bom" e "Atenção".
  function handleItemBlur(e: React.FocusEvent<HTMLLIElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (condicao !== "") setExpandido(false);
  }

  const compactado = !expandido && condicao !== "";

  return (
    <li className={`equip-item${selecionado ? " equip-item--selecionado" : ""}`} onBlur={handleItemBlur}>
      <input type="hidden" name={`${prefix}__categoria`} value={categoriaId} />
      <input type="hidden" name={`${prefix}__nome`} value={nome} />
      <input type="hidden" name={`${prefix}__personalizado`} value={personalizado ? "1" : "0"} />

      <div hidden={compactado}>
        <label className="equip-item__check">
          <input type="checkbox" name={`${prefix}__selecionado`} checked={selecionado} onChange={handleSelecionadoChange} />
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
        </div>
      </div>

      {compactado && (
        <button type="button" className="equip-item__resumo" onClick={() => setExpandido(true)}>
          {nome} — {condicao === "bom" ? "✓ Bom" : "⚠️ Atenção"}
        </button>
      )}
    </li>
  );
}
```

Adicione `import { useState } from "react";` já existe no topo; agora precisa também do tipo de evento — como o arquivo já importa `useState` de `"react"`, troque essa linha por `import { type FocusEvent, type ChangeEvent, useState } from "react";` **ou** use `React.FocusEvent`/`React.ChangeEvent` como no código acima (requer `import * as React from "react"` ou os tipos globais do JSX runtime — este projeto usa `"jsx": "react-jsx"` sem import de namespace `React`; troque a assinatura das duas funções pra usar os tipos nomeados importados em vez de `React.FocusEvent`/`React.ChangeEvent`):

```tsx
import { useState, type ChangeEvent, type FocusEvent } from "react";
```

e ajuste as assinaturas para `(e: ChangeEvent<HTMLInputElement>)` e `(e: FocusEvent<HTMLLIElement>)`.

Em `app/globals.css`, logo após `.equip-item__condicao` (e depois do `.sim-nao-radio` adicionado na Task 3), adicione:

```css
.equip-item__resumo {
  display: block;
  width: 100%;
  text-align: left;
  cursor: pointer;
  background: none;
  border: none;
  padding: var(--space-1) 0;
  font-family: var(--font-family-body);
  font-size: inherit;
  color: inherit;
}
```

- [ ] **Step 8: Rodar toda a suíte e confirmar sucesso**

Run: `npm test -- --run`
Expected: PASS em todos os arquivos — inclusive os testes já existentes de `equipamento-categoria.test.tsx` que usam `fireEvent.click` sem blur (não devem ter sido afetados, já que clique sozinho não dispara blur em jsdom).

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/inspections/new/equipamento-categoria.tsx" "app/(app)/inspections/new/equipamento-categoria.test.tsx" app/globals.css
git commit -m "feat: close equipamento categories by default, auto-compact items on blur"
```

---

### Task 9: Equipamentos — badge de progresso por categoria

**Files:**
- Modify: `app/(app)/inspections/new/equipamento-categoria.tsx`
- Test: `app/(app)/inspections/new/equipamento-categoria.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `EquipamentoItem`/`EquipamentoCategoria` de Task 8.
- Produces: `EquipamentoItem` ganha prop opcional `onVerificadoChange?: (index: number, verificado: boolean) => void`. Nada mais consome isso — é o fim da cadeia desta plano.

- [ ] **Step 1: Testes — badge de progresso**

Em `app/(app)/inspections/new/equipamento-categoria.test.tsx`, adicione:

```tsx
  it("shows no badge when nothing is verified", () => {
    renderCategoria();
    expect(screen.queryByText(/verificados/)).not.toBeInTheDocument();
  });

  it("shows a verificados/total badge that updates as items get a condição", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));
    expect(screen.getByText("✓ 1/2 verificados")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Airbags (frontais, laterais e de cortina)"));
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Airbags (frontais, laterais e de cortina))"));
    expect(screen.getByText("✓ 2/2 verificados")).toBeInTheDocument();
  });

  it("removes an item from the badge count when it's unchecked", () => {
    renderCategoria();
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));
    expect(screen.getByText("✓ 1/2 verificados")).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(screen.queryByText(/verificados/)).not.toBeInTheDocument();
  });

  it("counts personalizado items in the badge total", () => {
    renderCategoria(["Bagageira de teto"]);
    fireEvent.click(screen.getByLabelText("Bagageira de teto"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Bagageira de teto)"));
    expect(screen.getByText("✓ 1/3 verificados")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run "app/(app)/inspections/new/equipamento-categoria.test.tsx"`
Expected: FAIL — nenhum badge é renderizado ainda.

- [ ] **Step 3: Implementar o callback e o badge**

Em `equipamento-categoria.tsx`, atualize a assinatura de `EquipamentoItem` pra aceitar o novo prop, e chame-o nos dois pontos que mudam se o item está "verificado":

```tsx
function EquipamentoItem({
  categoriaId,
  nome,
  index,
  personalizado,
  onVerificadoChange,
}: {
  categoriaId: EquipamentoCategoriaId;
  nome: string;
  index: number;
  personalizado: boolean;
  onVerificadoChange?: (index: number, verificado: boolean) => void;
}) {
```

Substitua `handleSelecionadoChange` e os dois `onChange` dos radios de condição:

```tsx
  function handleSelecionadoChange(e: ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setSelecionado(checked);
    if (checked) {
      setExpandido(true);
    } else {
      onVerificadoChange?.(index, false);
    }
  }

  function handleCondicaoChange(novaCondicao: Condicao) {
    setCondicao(novaCondicao);
    onVerificadoChange?.(index, novaCondicao !== "");
  }
```

e troque `onChange={() => setCondicao("bom")}` / `onChange={() => setCondicao("atencao")}` por `onChange={() => handleCondicaoChange("bom")}` / `onChange={() => handleCondicaoChange("atencao")}`.

Em `EquipamentoCategoria`, adicione o estado de contagem e passe o callback pra cada item; agrupe o label e o badge num `<span>` pra manter o `+` alinhado à direita:

```tsx
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
  const [verificados, setVerificados] = useState<Set<number>>(new Set());

  function handleVerificadoChange(index: number, verificado: boolean) {
    setVerificados((prev) => {
      const next = new Set(prev);
      if (verificado) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  return (
    <details className="equip-categoria">
      <summary className="equip-categoria__summary">
        <span className="equip-categoria__titulo">
          {label}
          {verificados.size > 0 && (
            <span className="equip-categoria__badge">
              ✓ {verificados.size}/{todosOsItens.length} verificados
            </span>
          )}
        </span>
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
            onVerificadoChange={handleVerificadoChange}
          />
        ))}
      </ul>
    </details>
  );
}
```

Em `app/globals.css`, logo após `.equip-categoria__summary` (linhas ~676-683), adicione:

```css
.equip-categoria__titulo {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.equip-categoria__badge {
  font-family: var(--font-family-body);
  font-weight: 400;
  font-size: 0.85em;
  color: var(--color-ink-muted);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run "app/(app)/inspections/new/equipamento-categoria.test.tsx"`
Expected: PASS

- [ ] **Step 5: Rodar toda a suíte e `tsc --noEmit`**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: PASS / sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/new/equipamento-categoria.tsx" "app/(app)/inspections/new/equipamento-categoria.test.tsx" app/globals.css
git commit -m "feat: add verificados/total progress badge to each equipamento category header"
```

---

## Self-Review

**Cobertura do spec:** §2.1 (situação fiscal texto) → Tasks 1, 2, 6, 7. §2.2 (gate indícios adulteração) → Tasks 1, 2, 6, 7. §2.3 (bloco importação) → Tasks 1, 2, 4, 6, 7. §2.4 (campos soltos + `ValorMoedaInput`) → Tasks 1, 2, 5, 6, 7. §2.5 (`SimNaoRadio`) → Task 3. §3.1 (acordeão fechado) → Task 8. §3.2 (compactação) → Task 8. §3.3 (badge) → Task 9. §4 (testes) → embutido em cada task. §5 (branch/integração) → fora desta plano, mesmo gate do recorte 3 (`finishing-a-development-branch` depois que todas as tasks passarem).

**Consistência de tipos:** `"" | "sim" | "nao"` usado identicamente em `SimNaoRadio` (Task 3), e nos 4 estados que o consomem em `new-inspection-form.tsx` (Task 7: `indiciosAdulteracaoPresentes`, `veiculoImportado`, `possuiCoc`, `isencaoIsvAplicada`) e no schema Zod (Task 2: `z.enum(["sim", "nao"]).optional()`, compatível — `""` nunca é submetido porque os radios não têm valor `""`, só o estado inicial de UI usa essa string vazia antes de qualquer clique). `onVerificadoChange?: (index: number, verificado: boolean) => void` idêntico entre `EquipamentoItem` (produz, Task 9) e `EquipamentoCategoria` (consome, Task 9) — mesma task, sem risco de divergência entre arquivos escritos em momentos diferentes. Nome do parâmetro RPC `p_situacao_fiscal_regular` muda de tipo (Task 1: `boolean`→`text`) mas mantém o nome — Task 6 usa exatamente esse nome.

**Placeholders:** nenhum `TBD`/`TODO` — todo step tem código completo, incluindo os testes SQL e os testes de componente.
