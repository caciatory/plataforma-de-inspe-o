# Remoção da duplicação Identificação/Histórico (checklist × "Nova Inspeção") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 21 checklist items (subcategorias "Identificação"/"Histórico", grupo `ordem = 1`) that duplicate data already collected in the "Nova Inspeção" form, and give técnico/admin a real way to correct that data after creation by reusing `NewInspectionForm` in an edit mode that writes directly to `vehicle_data`/`client_data`/`equipamento_inspecao`.

**Architecture:** A new `update_inspection` RPC mirrors `create_inspection` (same param shape, `UPDATE` instead of `INSERT` on `vehicle_data`/`client_data`), plus equipamento reconciliation (update-by-id / insert-new / delete-removed). `NewInspectionForm` gains optional `inspectionId`/`initialData`/`initialEquipamentos` props: when `inspectionId` is present, every `useState` initializes from `initialData` instead of `""`, and the form submits to a new `updateInspectionAction` instead of `createInspectionAction`. A new route `/inspections/[id]/editar` fetches the current data and renders the form in edit mode, gated by the existing `isInspectionEditable(status, role)`.

**Tech Stack:** Next.js 15 App Router (Server Components + Server Actions), Supabase (Postgres RPC via `plpgsql`), Zod (`inspectionFormSchema`, reused unchanged), Vitest + Testing Library, TypeScript.

## Global Constraints

- `docs/superpowers/specs/2026-08-10-remocao-duplicacao-identificacao-historico-design.md` is the source of truth for product decisions — this plan implements it, doesn't re-decide it.
- Every task must leave `npm test` and `npx tsc --noEmit` green. Commit after each task.
- `checklist_item_responses.item_template_id references checklist_item_templates(id)` has **no** `on delete cascade` (confirmed in `00003_checklist_responses_media.sql`) — any migration deleting templates must delete referencing responses first.
- `equipamento_fotos.equipamento_inspecao_id references equipamento_inspecao(id) on delete cascade` (confirmed in `00039_equipamentos_inspecao.sql`) — deleting an `equipamento_inspecao` row automatically removes its photo rows. Storage objects themselves are not cleaned up on delete — matches the existing (lax) behavior of the create flow, not a new gap introduced here.
- Reuse `inspectionFormSchema` (`lib/inspection/schema.ts`) unchanged for validating the edit form — its shape already matches every field this plan touches.
- Group `ordem = 1` ("Identificação e Documentação") has **three** subcategorias: "Identificação" (14 items, all removed here), "Documentação" (4 items — DUA, IPO, Seguro, Livro de revisões — **not** duplicated anywhere, **not** touched), "Histórico" (7 items, all removed here). Every migration/query in this plan must filter by `subcategoria in ('Identificação', 'Histórico')`, never the whole group.
- Follow existing conventions: Server Actions return a state union consumed via `useActionState`; native `<dialog className="dialog-panel">` for any confirmation, never a from-scratch modal; `console.error` on every Supabase error path (no silent swallowing).

---

### Task 1: Migration — remove the 21 duplicate checklist items

**Files:**
- Create: `supabase/migrations/00047_remove_duplicate_identificacao_historico.sql`
- Test: `supabase/tests/00047_remove_duplicate_identificacao_historico.test.sql`

**Interfaces:**
- Produces: no application-code interface — this is a pure schema/data migration. Later tasks rely on these 21 templates no longer existing so the checklist UI naturally stops rendering them (no app-code change needed for that part).

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/00047_remove_duplicate_identificacao_historico.test.sql
-- Cobre a migration 00047: os 21 itens de Identificação/Histórico (grupo
-- ordem=1) somem do checklist; "Documentação" (mesmo grupo) fica intacta;
-- nenhuma checklist_item_responses fica orfã.

begin;

do $$
declare
  v_removidos int;
  v_documentacao int;
  v_orfas int;
begin
  select count(*) into v_removidos
  from public.checklist_item_templates t
  join public.checklist_group_templates g on g.id = t.group_id
  where g.ordem = 1 and t.subcategoria in ('Identificação', 'Histórico');
  if v_removidos <> 0 then
    raise exception 'FALHOU: % itens de Identificação/Histórico ainda existem', v_removidos;
  end if;
  raise notice 'OK: itens de Identificação/Histórico removidos';

  select count(*) into v_documentacao
  from public.checklist_item_templates t
  join public.checklist_group_templates g on g.id = t.group_id
  where g.ordem = 1 and t.subcategoria = 'Documentação';
  if v_documentacao <> 4 then
    raise exception 'FALHOU: esperava 4 itens em Documentação, achou %', v_documentacao;
  end if;
  raise notice 'OK: itens de Documentação intactos';

  select count(*) into v_orfas
  from public.checklist_item_responses r
  where not exists (select 1 from public.checklist_item_templates t where t.id = r.item_template_id);
  if v_orfas <> 0 then
    raise exception 'FALHOU: % checklist_item_responses orfas', v_orfas;
  end if;
  raise notice 'OK: nenhuma checklist_item_responses orfa';
end $$;

rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Apply this test file against a database that does **not** yet have migration `00047` — the first `raise exception` fires (the 21 items still exist). This project's SQL tests are applied and verified directly against the real Supabase database by the user (see `supabase/tests/00046_users_insert_policy.test.sql` for the established convention this file follows), not run in CI.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/00047_remove_duplicate_identificacao_historico.sql
-- Ver docs/superpowers/specs/2026-08-10-remocao-duplicacao-identificacao-historico-design.md §3.1
-- Os 21 itens de "Identificação"/"Histórico" (grupo ordem=1) duplicam dados já
-- coletados no formulário "Nova Inspeção" (vehicle_data/client_data). "Documentação"
-- (mesmo grupo) não é tocada — não é duplicada em lugar nenhum.

delete from public.checklist_item_responses
where item_template_id in (
  select t.id
  from public.checklist_item_templates t
  join public.checklist_group_templates g on g.id = t.group_id
  where g.ordem = 1 and t.subcategoria in ('Identificação', 'Histórico')
);

delete from public.checklist_item_templates t
using public.checklist_group_templates g
where g.id = t.group_id
  and g.ordem = 1
  and t.subcategoria in ('Identificação', 'Histórico');
```

- [ ] **Step 4: Apply and verify**

This migration must be applied manually against the real Supabase database (same process as every other migration in this project — see `.env.local`/README for the Supabase dashboard SQL editor). After applying, re-run the test file from Step 1 against the real database and confirm all 3 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00047_remove_duplicate_identificacao_historico.sql supabase/tests/00047_remove_duplicate_identificacao_historico.test.sql
git commit -m "fix: remove checklist items duplicating Nova Inspeção form data"
```

---

### Task 2: `update_inspection` RPC — vehicle_data/client_data + equipamento reconciliation

**Files:**
- Create: `supabase/migrations/00048_update_inspection.sql`
- Test: `supabase/tests/00048_update_inspection.test.sql`

**Interfaces:**
- Produces: SQL function `public.update_inspection(p_inspection_id uuid, p_tipo_cliente, p_objetivo, ... same params as create_inspection ..., p_equipamentos jsonb, p_equipamentos_removidos jsonb) returns void`. `p_equipamentos` elements optionally carry an `id` key (existing `equipamento_inspecao.id` as text) — present means `UPDATE` that row, absent means `INSERT` a new row. `p_equipamentos_removidos` is a jsonb array of `equipamento_inspecao.id` (text) to delete. Task 4's `updateInspectionAction` calls this RPC.

- [ ] **Step 1: Write the failing test**

```sql
-- supabase/tests/00048_update_inspection.test.sql
-- Cobre a migration 00048: update_inspection corrige vehicle_data e
-- reconcilia equipamento_inspecao (update por id existente + insert de novo
-- item numa mesma chamada). security invoker + auth.uid() exige simular a
-- sessão do técnico dono da inspeção, mesmo padrão de
-- supabase/tests/00046_users_insert_policy.test.sql.

begin;

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'tecnico-00048@example.com');
insert into public.users (id, nome, email, role) values
  ('11111111-1111-1111-1111-111111111111', 'Técnico 00048', 'tecnico-00048@example.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare
  v_inspection_id uuid;
  v_marca text;
  v_km int;
  v_condicao text;
  v_count int;
begin
  v_inspection_id := public.create_inspection(
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-048',
    p_marca => 'Marca Original',
    p_modelo => 'Modelo Original',
    p_nome_solicitante => 'Cliente Original',
    p_quilometragem => 10000
  );

  perform public.update_inspection(
    p_inspection_id => v_inspection_id,
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-048',
    p_marca => 'Marca Corrigida',
    p_modelo => 'Modelo Original',
    p_nome_solicitante => 'Cliente Original',
    p_quilometragem => 12000
  );

  select marca, quilometragem into v_marca, v_km from public.vehicle_data where inspection_id = v_inspection_id;
  if v_marca <> 'Marca Corrigida' or v_km <> 12000 then
    raise exception 'FALHOU: vehicle_data nao foi corrigido (marca=%, km=%)', v_marca, v_km;
  end if;
  raise notice 'OK: update_inspection corrige vehicle_data';

  -- Equipamento reconciliation: um item já existe (simula create anterior);
  -- update_inspection recebe uma edição por id + um item novo sem id.
  insert into public.equipamento_inspecao (id, inspection_id, categoria, nome_equipamento, condicao, ordem)
  values ('22222222-2222-2222-2222-222222222222', v_inspection_id, 'interior', 'Ar condicionado', 'bom', 0);

  perform public.update_inspection(
    p_inspection_id => v_inspection_id,
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-048',
    p_marca => 'Marca Corrigida',
    p_modelo => 'Modelo Original',
    p_nome_solicitante => 'Cliente Original',
    p_quilometragem => 12000,
    p_equipamentos => jsonb_build_array(
      jsonb_build_object('id', '22222222-2222-2222-2222-222222222222', 'categoria', 'interior', 'nome_equipamento', 'Ar condicionado', 'condicao', 'atencao', 'comentario', 'Fraco', 'ordem', 0),
      jsonb_build_object('categoria', 'exterior', 'nome_equipamento', 'Jantes', 'condicao', 'bom', 'comentario', null, 'ordem', 1)
    )
  );

  select condicao into v_condicao from public.equipamento_inspecao where id = '22222222-2222-2222-2222-222222222222';
  if v_condicao <> 'atencao' then
    raise exception 'FALHOU: equipamento existente deveria ter sido atualizado (condicao=%)', v_condicao;
  end if;
  raise notice 'OK: update_inspection atualiza equipamento existente por id';

  select count(*) into v_count from public.equipamento_inspecao where inspection_id = v_inspection_id;
  if v_count <> 2 then
    raise exception 'FALHOU: esperava 2 equipamentos (1 atualizado + 1 novo), achou %', v_count;
  end if;
  raise notice 'OK: update_inspection insere equipamento novo junto com a atualizacao';
end $$;

reset role;
rollback;
```

- [ ] **Step 2: Run test to verify it fails**

Apply against a database without migration `00048` — the first `perform public.update_inspection(...)` fails with `function public.update_inspection(...) does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/00048_update_inspection.sql
-- Ver docs/superpowers/specs/2026-08-10-remocao-duplicacao-identificacao-historico-design.md §3.3
-- Mirrors create_inspection (00040_historico_veiculo_v2.sql) but UPDATEs
-- vehicle_data/client_data instead of inserting, and reconciles equipamento_inspecao:
-- an element with `id` in p_equipamentos is an UPDATE to an existing row, an element
-- without `id` is a new INSERT, and every id in p_equipamentos_removidos is DELETEd
-- (equipamento_fotos cascades automatically — see Global Constraints).

create function public.update_inspection(
  p_inspection_id uuid,
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
  p_indicios_adulteracao_presentes boolean default false,
  p_veiculo_importado boolean default false,
  p_pais_origem text default null,
  p_matricula_origem text default null,
  p_data_importacao date default null,
  p_possui_coc boolean default null,
  p_isencao_isv_aplicada boolean default null,
  p_numero_dav text default null,
  p_data_primeira_matricula date default null,
  p_valor_base_iuc_anual numeric default null,
  p_equipamentos jsonb default '[]'::jsonb,
  p_equipamentos_removidos jsonb default '[]'::jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_equip jsonb;
  v_id uuid;
begin
  update public.inspections
  set tipo_cliente = p_tipo_cliente, objetivo = p_objetivo
  where id = p_inspection_id;

  update public.vehicle_data set
    matricula = p_matricula, marca = p_marca, modelo = p_modelo, versao_trim = p_versao_trim,
    ano_fabrico = p_ano_fabrico, ano_modelo = p_ano_modelo, cor = p_cor, vin = p_vin,
    numero_motor = p_numero_motor, numero_portas = p_numero_portas, combustivel = p_combustivel,
    caixa_velocidades = p_caixa_velocidades, tracao = p_tracao, potencia_cv = p_potencia_cv,
    torque_nm = p_torque_nm, quilometragem = p_quilometragem,
    indicios_adulteracao_km = p_indicios_adulteracao_km,
    numero_proprietarios_anteriores = p_numero_proprietarios_anteriores,
    registo_acidentes_anteriores = p_registo_acidentes_anteriores,
    historico_manutencao = p_historico_manutencao,
    inspecoes_periodicas_ipo_notas = p_inspecoes_periodicas_ipo_notas,
    inspecoes_periodicas_ipo_data = p_inspecoes_periodicas_ipo_data,
    situacao_fiscal_regular = p_situacao_fiscal_regular,
    indicios_adulteracao_presentes = p_indicios_adulteracao_presentes,
    veiculo_importado = p_veiculo_importado, pais_origem = p_pais_origem,
    matricula_origem = p_matricula_origem, data_importacao = p_data_importacao,
    possui_coc = p_possui_coc, isencao_isv_aplicada = p_isencao_isv_aplicada,
    numero_dav = p_numero_dav, data_primeira_matricula = p_data_primeira_matricula,
    valor_base_iuc_anual = p_valor_base_iuc_anual
  where inspection_id = p_inspection_id;

  update public.client_data set
    nome_solicitante = p_nome_solicitante, tipo = p_tipo_cliente, contacto = p_contacto,
    email = p_email, responsavel_presente = p_responsavel_presente
  where inspection_id = p_inspection_id;

  for v_equip in select * from jsonb_array_elements(p_equipamentos)
  loop
    if v_equip ? 'id' then
      update public.equipamento_inspecao set
        categoria = v_equip->>'categoria',
        nome_equipamento = v_equip->>'nome_equipamento',
        condicao = v_equip->>'condicao',
        comentario = v_equip->>'comentario',
        ordem = (v_equip->>'ordem')::int
      where id = (v_equip->>'id')::uuid and inspection_id = p_inspection_id;
    else
      insert into public.equipamento_inspecao (
        inspection_id, categoria, nome_equipamento, condicao, comentario, ordem
      ) values (
        p_inspection_id, v_equip->>'categoria', v_equip->>'nome_equipamento',
        v_equip->>'condicao', v_equip->>'comentario', (v_equip->>'ordem')::int
      );
    end if;

    if (v_equip->>'personalizado')::boolean then
      insert into public.equipamento_sugestoes (categoria, nome)
      values (v_equip->>'categoria', v_equip->>'nome_equipamento')
      on conflict (lower(categoria), lower(nome)) do nothing;
    end if;
  end loop;

  for v_id in select (jsonb_array_elements_text(p_equipamentos_removidos))::uuid
  loop
    delete from public.equipamento_inspecao
    where id = v_id and inspection_id = p_inspection_id;
  end loop;
end;
$$;
```

- [ ] **Step 4: Apply and verify**

Apply manually against the real Supabase database, then re-run the test file from Step 1 and confirm all 4 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00048_update_inspection.sql supabase/tests/00048_update_inspection.test.sql
git commit -m "feat: add update_inspection RPC for post-creation corrections"
```

---

### Task 3: `updateInspectionAction` Server Action

**Files:**
- Create: `app/(app)/inspections/[id]/editar/actions.ts`
- Test: `app/(app)/inspections/[id]/editar/actions.test.ts`

**Interfaces:**
- Consumes: `inspectionFormSchema` from `@/lib/inspection/schema` (unchanged); `getCurrentUser` from `@/lib/auth/session`.
- Produces: `updateInspectionAction(prevState: UpdateInspectionState, formData: FormData): Promise<UpdateInspectionState>` where `UpdateInspectionState = { status: "idle" } | { status: "error"; message: string; field?: string }` — **no `"success"` variant**, matching `CreateInspectionState` in `app/(app)/inspections/new/actions.ts`: success always ends in `redirect()`, which throws and interrupts execution, so a success value is never actually returned (confirmed by that file's own test, which asserts success via `.rejects.toThrow("REDIRECT:...")`, not a returned status). Task 5's `NewInspectionForm` binds to this via `useActionState` when in edit mode. `formData` must carry a hidden `inspectionId` field and, for equipamentos, the same `equip__<key>__*` naming convention `parseEquipamentos` already uses in `app/(app)/inspections/new/actions.ts`, plus a new `equip__<key>__id` (existing `equipamento_inspecao.id`, blank for new items) and a top-level `equipamentosRemovidos` field (comma-separated ids, written by Task 6's confirmation dialog).

- [ ] **Step 1: Write the failing test**

```ts
// app/(app)/inspections/[id]/editar/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const rpc = vi.fn();
const insertAudit = vi.fn(() => ({ error: null }));
const storageUpload = vi.fn(() => Promise.resolve({ error: null }));
const storageGetPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://example.com/foto.jpg" } }));
const equipRowsQuery: any = {
  select: vi.fn(() => equipRowsQuery),
  eq: vi.fn(() => equipRowsQuery),
  order: vi.fn(() => Promise.resolve({ data: [] })),
};
const from = vi.fn((table: string) => {
  if (table === "equipamento_inspecao") return equipRowsQuery;
  if (table === "equipamento_fotos") return { insert: insertAudit };
  if (table === "audit_log_entries") return { insert: insertAudit };
  throw new Error(`unexpected table ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from,
    storage: { from: () => ({ upload: storageUpload, getPublicUrl: storageGetPublicUrl }) },
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));

// Same pattern as app/(app)/inspections/new/actions.test.ts: next/navigation's
// redirect() throws in the real runtime, so success is asserted via
// .rejects.toThrow(), never via a returned status.
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    inspectionId: "insp-1",
    tipoCliente: "particular",
    objetivo: "compra",
    nomeSolicitante: "Cliente Teste",
    matricula: "AA-11-BB",
    marca: "Toyota",
    modelo: "Corolla",
    quilometragem: "10000",
    equipamentosRemovidos: "",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  getCurrentUser.mockReset();
  rpc.mockReset();
  insertAudit.mockClear();
  storageUpload.mockClear();
  redirect.mockClear();
  equipRowsQuery.order.mockResolvedValue({ data: [] });
});

describe("updateInspectionAction", () => {
  it("returns a validation error without calling the RPC when required fields are missing", async () => {
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    const { updateInspectionAction } = await import("./actions");

    const result = await updateInspectionAction({ status: "idle" }, buildFormData({ matricula: "" }));

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls update_inspection with the parsed fields and redirects to the summary page on success", async () => {
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    rpc.mockResolvedValue({ error: null });
    const { updateInspectionAction } = await import("./actions");

    await expect(updateInspectionAction({ status: "idle" }, buildFormData())).rejects.toThrow(
      "REDIRECT:/inspections/insp-1"
    );
    expect(rpc).toHaveBeenCalledWith(
      "update_inspection",
      expect.objectContaining({ p_inspection_id: "insp-1", p_matricula: "AA-11-BB", p_quilometragem: 10000 })
    );
  });

  it("returns an error when the RPC fails, without redirecting", async () => {
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    rpc.mockResolvedValue({ error: { message: "db error" } });
    const { updateInspectionAction } = await import("./actions");

    const result = await updateInspectionAction({ status: "idle" }, buildFormData());

    expect(result.status).toBe("error");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("logs an audit entry when the caller is admin, not when técnico", async () => {
    rpc.mockResolvedValue({ error: null });
    const { updateInspectionAction } = await import("./actions");

    getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    await expect(updateInspectionAction({ status: "idle" }, buildFormData())).rejects.toThrow("REDIRECT:");
    expect(insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ inspection_id: "insp-1", admin_id: "admin-1" })
    );

    insertAudit.mockClear();
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    await expect(updateInspectionAction({ status: "idle" }, buildFormData())).rejects.toThrow("REDIRECT:");
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("passes equipamentosRemovidos through to the RPC as an array", async () => {
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    rpc.mockResolvedValue({ error: null });
    const { updateInspectionAction } = await import("./actions");

    await expect(
      updateInspectionAction({ status: "idle" }, buildFormData({ equipamentosRemovidos: "equip-1,equip-2" }))
    ).rejects.toThrow("REDIRECT:");

    expect(rpc).toHaveBeenCalledWith(
      "update_inspection",
      expect.objectContaining({ p_equipamentos_removidos: ["equip-1", "equip-2"] })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/inspections/[id]/editar/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`

- [ ] **Step 3: Write the implementation**

```ts
// app/(app)/inspections/[id]/editar/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { inspectionFormSchema } from "@/lib/inspection/schema";

export type UpdateInspectionState =
  | { status: "idle" }
  | { status: "error"; message: string; field?: string };

type EquipamentoParsed = {
  id: string | null;
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
    const condicao = String(formData.get(`${prefix}__condicao`) ?? "");
    const id = formData.get(`${prefix}__id`);
    result.push({
      id: typeof id === "string" && id !== "" ? id : null,
      key,
      categoria: String(formData.get(`${prefix}__categoria`) ?? ""),
      nome_equipamento: String(formData.get(`${prefix}__nome`) ?? ""),
      condicao,
      comentario: condicao === "atencao" ? (formData.get(`${prefix}__comentario`) as string) || null : null,
      personalizado: formData.get(`${prefix}__personalizado`) === "1",
      foto1: foto1 instanceof File && foto1.size > 0 ? foto1 : null,
      foto2: foto2 instanceof File && foto2.size > 0 ? foto2 : null,
    });
  }
  return result;
}

function isEquipamentoValido(e: EquipamentoParsed): boolean {
  return (e.condicao === "bom" || e.condicao === "atencao") && e.nome_equipamento.trim() !== "";
}

function buildPhotoPath(inspectionId: string, equipamentoId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/${equipamentoId}/${Date.now()}-${safeName}`;
}

export async function updateInspectionAction(
  _prevState: UpdateInspectionState,
  formData: FormData
): Promise<UpdateInspectionState> {
  const inspectionId = String(formData.get("inspectionId") ?? "");
  const equipamentos = parseEquipamentos(formData).filter(isEquipamentoValido);
  const equipamentosRemovidos = String(formData.get("equipamentosRemovidos") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const raw = Object.fromEntries(formData.entries());
  const parsed = inspectionFormSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      status: "error",
      message: firstIssue?.message ?? "Dados inválidos.",
      field: firstIssue?.path[0] !== undefined ? String(firstIssue.path[0]) : undefined,
    };
  }

  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_inspection", {
    p_inspection_id: inspectionId,
    p_tipo_cliente: v.tipoCliente,
    p_objetivo: v.objetivo,
    p_matricula: v.matricula,
    p_marca: v.marca,
    p_modelo: v.modelo,
    p_nome_solicitante: v.nomeSolicitante,
    p_quilometragem: v.quilometragem,
    p_versao_trim: v.versaoTrim || null,
    p_ano_fabrico: v.anoFabrico ?? null,
    p_ano_modelo: v.anoModelo ?? null,
    p_cor: v.cor || null,
    p_vin: v.vin || null,
    p_numero_motor: v.numeroMotor || null,
    p_numero_portas: v.numeroPortas ?? null,
    p_combustivel: v.combustivel || null,
    p_caixa_velocidades: v.caixaVelocidades || null,
    p_tracao: v.tracao || null,
    p_potencia_cv: v.potenciaCv ?? null,
    p_torque_nm: v.torqueNm ?? null,
    p_contacto: v.contacto || null,
    p_email: v.email || null,
    p_responsavel_presente: v.responsavelPresente || null,
    p_indicios_adulteracao_km: v.indiciosAdulteracaoPresentes === "sim" ? v.indiciosAdulteracaoKm || null : null,
    p_numero_proprietarios_anteriores: v.numeroProprietariosAnteriores ?? null,
    p_registo_acidentes_anteriores: v.registoAcidentesAnteriores || null,
    p_historico_manutencao: v.historicoManutencao || null,
    p_inspecoes_periodicas_ipo_notas: v.inspecoesPeriodicasIpoNotas || null,
    p_inspecoes_periodicas_ipo_data: v.inspecoesPeriodicasIpoData || null,
    p_situacao_fiscal_regular: v.situacaoFiscalRegular || null,
    p_indicios_adulteracao_presentes: v.indiciosAdulteracaoPresentes === "sim",
    p_veiculo_importado: v.veiculoImportado === "sim",
    p_pais_origem: v.veiculoImportado === "sim" ? v.paisOrigem || null : null,
    p_matricula_origem: v.veiculoImportado === "sim" ? v.matriculaOrigem || null : null,
    p_data_importacao: v.veiculoImportado === "sim" ? v.dataImportacao || null : null,
    p_possui_coc: v.veiculoImportado === "sim" ? (v.possuiCoc === undefined ? null : v.possuiCoc === "sim") : null,
    p_isencao_isv_aplicada:
      v.veiculoImportado === "sim" ? (v.isencaoIsvAplicada === undefined ? null : v.isencaoIsvAplicada === "sim") : null,
    p_numero_dav: v.veiculoImportado === "sim" ? v.numeroDav || null : null,
    p_data_primeira_matricula: v.dataPrimeiraMatricula || null,
    p_valor_base_iuc_anual: v.valorBaseIucAnual ?? null,
    p_equipamentos: equipamentos.map((e, ordem) => ({
      ...(e.id ? { id: e.id } : {}),
      ordem,
      categoria: e.categoria,
      nome_equipamento: e.nome_equipamento,
      condicao: e.condicao,
      comentario: e.comentario,
      personalizado: e.personalizado,
    })),
    p_equipamentos_removidos: equipamentosRemovidos,
  });

  if (error) {
    console.error("update_inspection failed", error);
    return { status: "error", message: "Não foi possível guardar as alterações. Tente novamente." };
  }

  const equipamentosComFoto = equipamentos.filter((e) => e.foto1 || e.foto2);
  if (equipamentosComFoto.length > 0) {
    try {
      await uploadEquipamentoFotos(supabase, inspectionId, equipamentos);
    } catch (err) {
      console.error("erro inesperado ao processar fotos de equipamento na edição", err);
    }
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    const { error: auditError } = await supabase.from("audit_log_entries").insert({
      inspection_id: inspectionId,
      admin_id: currentUser.id,
      descricao: "Editou dados básicos da inspeção",
    });
    if (auditError) console.error("audit_log_entries insert failed (update_inspection)", auditError);
  }

  redirect(`/inspections/${inspectionId}`);
}

async function uploadEquipamentoFotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inspectionId: string,
  equipamentos: EquipamentoParsed[]
): Promise<void> {
  // Existing items already carry their own id (Task 6 threads it through as
  // `equip__<key>__id`); only newly-inserted items need the ordem-based lookup
  // create_inspection's uploader already relies on.
  const { data: equipRows } = await supabase
    .from("equipamento_inspecao")
    .select("id, ordem")
    .eq("inspection_id", inspectionId)
    .order("ordem", { ascending: true });

  for (let ordem = 0; ordem < equipamentos.length; ordem++) {
    const equip = equipamentos[ordem];
    if (!equip.foto1 && !equip.foto2) continue;
    const equipamentoId = equip.id ?? equipRows?.find((r) => r.ordem === ordem)?.id;
    if (!equipamentoId) continue;

    for (const [fotoOrdem, foto] of [equip.foto1, equip.foto2].entries()) {
      if (!foto) continue;
      try {
        // Replacing an existing slot: remove the old row at this ordem before
        // inserting the new one, per the design's "picking a new file replaces
        // the slot" decision.
        await supabase
          .from("equipamento_fotos")
          .delete()
          .eq("equipamento_inspecao_id", equipamentoId)
          .eq("ordem", fotoOrdem);

        const path = buildPhotoPath(inspectionId, equipamentoId, foto.name);
        const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, foto);
        if (uploadError) {
          console.error("upload de foto de equipamento falhou (edição)", uploadError);
          continue;
        }
        const { data: publicUrl } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
        const { error: insertError } = await supabase.from("equipamento_fotos").insert({
          inspection_id: inspectionId,
          equipamento_inspecao_id: equipamentoId,
          url: publicUrl.publicUrl,
          ordem: fotoOrdem,
        });
        if (insertError) console.error("insert de equipamento_fotos falhou (edição)", insertError);
      } catch (err) {
        console.error("erro inesperado ao processar foto de equipamento (edição)", err);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/inspections/[id]/editar/actions.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/editar/actions.ts" "app/(app)/inspections/[id]/editar/actions.test.ts"
git commit -m "feat: add updateInspectionAction for post-creation edits"
```

---

### Task 4: `NewInspectionForm` — edit mode (`inspectionId` + `initialData` props)

**Files:**
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx`
- Test: `app/(app)/inspections/new/new-inspection-form.test.tsx` (add cases to the existing file)

**Interfaces:**
- Consumes: `updateInspectionAction` from `./[id]/editar/actions` (Task 3, imported via relative path from the shared component — see Step 3 for the exact import), `UpdateInspectionState`.
- Produces: `NewInspectionForm` gains two new optional props — `inspectionId?: string` and `initialData?: InspectionFormInitialData` (a new exported type, one optional string field per existing `useState`, named identically to each state variable: `tipoCliente`, `objetivo`, `nomeSolicitante`, `contacto`, `email`, `responsavelPresente`, `matricula`, `marca`, `modelo`, `quilometragem`, `versaoTrim`, `anoFabrico`, `anoModelo`, `cor`, `vin`, `numeroMotor`, `numeroPortas`, `combustivel`, `caixaVelocidades`, `tracao`, `potenciaCv`, `torqueNm`, `indiciosAdulteracaoKm`, `numeroProprietariosAnteriores`, `registoAcidentesAnteriores`, `historicoManutencao`, `inspecoesPeriodicasIpoNotas`, `inspecoesPeriodicasIpoData`, `situacaoFiscalRegular`, `indiciosAdulteracaoPresentes`, `veiculoImportado`, `paisOrigem`, `matriculaOrigem`, `dataImportacao`, `possuiCoc`, `isencaoIsvAplicada`, `numeroDav`, `dataPrimeiraMatricula`, `valorBaseIucAnual`). A third prop, `initialEquipamentosPorCategoria`, is added later by Task 6 (not here — its type comes from Task 5, which hasn't run yet at this point in the sequence).

- [ ] **Step 1: Write the failing test**

Add to the existing `app/(app)/inspections/new/new-inspection-form.test.tsx` (the file already mocks `createInspectionAction` — check its existing mock setup at the top and extend it, don't replace it):

```tsx
// added to app/(app)/inspections/new/new-inspection-form.test.tsx
import { updateInspectionAction } from "../[id]/editar/actions";

vi.mock("../[id]/editar/actions", () => ({
  updateInspectionAction: vi.fn(async () => ({ status: "idle" })),
}));

describe("NewInspectionForm in edit mode", () => {
  it("pre-fills fields from initialData instead of starting blank", async () => {
    render(
      <NewInspectionForm
        inspectionId="insp-1"
        initialData={{ matricula: "AA-11-BB", marca: "Toyota", modelo: "Corolla", quilometragem: "50000" }}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Identificação" }));

    expect(screen.getByLabelText("Matrícula")).toHaveValue("AA-11-BB");
    expect(screen.getByLabelText("Marca")).toHaveValue("Toyota");
    expect(screen.getByLabelText("Modelo")).toHaveValue("Corolla");
  });

  it("submits via updateInspectionAction, not createInspectionAction, when inspectionId is set", () => {
    render(<NewInspectionForm inspectionId="insp-1" initialData={{ matricula: "AA-11-BB" }} />);

    // The form's action prop is bound to whichever action useActionState received;
    // asserting a hidden inspectionId field is present is the observable proxy for
    // "this render is in edit mode" without reaching into React internals.
    expect(document.querySelector('input[name="inspectionId"]')).toHaveValue("insp-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: FAIL — `initialData`/`inspectionId` props don't exist yet, fields render blank.

- [ ] **Step 3: Write the implementation**

Add the type and thread `initialData`/`inspectionId` through every relevant `useState`. Key edits to `app/(app)/inspections/new/new-inspection-form.tsx`:

```tsx
// near the top, after the existing imports
import { updateInspectionAction, type UpdateInspectionState } from "../[id]/editar/actions";

export type InspectionFormInitialData = Partial<{
  tipoCliente: TipoCliente;
  objetivo: Objetivo;
  nomeSolicitante: string;
  contacto: string;
  email: string;
  responsavelPresente: string;
  matricula: string;
  marca: string;
  modelo: string;
  quilometragem: string;
  versaoTrim: string;
  anoFabrico: string;
  anoModelo: string;
  cor: string;
  vin: string;
  numeroMotor: string;
  numeroPortas: string;
  combustivel: string;
  caixaVelocidades: string;
  tracao: string;
  potenciaCv: string;
  torqueNm: string;
  indiciosAdulteracaoKm: string;
  numeroProprietariosAnteriores: string;
  registoAcidentesAnteriores: string;
  historicoManutencao: string;
  inspecoesPeriodicasIpoNotas: string;
  inspecoesPeriodicasIpoData: string;
  situacaoFiscalRegular: string;
  indiciosAdulteracaoPresentes: "" | "sim" | "nao";
  veiculoImportado: "" | "sim" | "nao";
  paisOrigem: string;
  matriculaOrigem: string;
  dataImportacao: string;
  possuiCoc: "" | "sim" | "nao";
  isencaoIsvAplicada: "" | "sim" | "nao";
  numeroDav: string;
  dataPrimeiraMatricula: string;
  valorBaseIucAnual: string;
}>;
```

```tsx
// signature change (Task 6 adds a third prop, initialEquipamentosPorCategoria,
// on top of this — not added here because its type, EquipamentoInitial,
// doesn't exist until Task 5)
export function NewInspectionForm({
  sugestoesPorCategoria = {},
  inspectionId,
  initialData = {},
}: {
  sugestoesPorCategoria?: Record<string, string[]>;
  inspectionId?: string;
  initialData?: InspectionFormInitialData;
} = {}) {
```

Every `useState` initializer for a field present in `InspectionFormInitialData` (39 fields) changes to read from `initialData` first, falling back to the same default the line already had — no other part of any of these lines changes. The complete set of edits, in the order the fields already appear in the file:

```tsx
const [tipoCliente, setTipoCliente] = useState<TipoCliente>(initialData.tipoCliente ?? "particular");
const [objetivo, setObjetivo] = useState<Objetivo>(initialData.objetivo ?? "compra");
const [nomeSolicitante, setNomeSolicitante] = useState(initialData.nomeSolicitante ?? "");
const [contacto, setContacto] = useState(initialData.contacto ?? "");
const [email, setEmail] = useState(initialData.email ?? "");
const [responsavelPresente, setResponsavelPresente] = useState(initialData.responsavelPresente ?? "");
const [matricula, setMatricula] = useState(initialData.matricula ?? "");
const [marca, setMarca] = useState(initialData.marca ?? "");
const [modelo, setModelo] = useState(initialData.modelo ?? "");
const [quilometragem, setQuilometragem] = useState(initialData.quilometragem ?? "");
const [versaoTrim, setVersaoTrim] = useState(initialData.versaoTrim ?? "");
const [anoFabrico, setAnoFabrico] = useState(initialData.anoFabrico ?? "");
const [anoModelo, setAnoModelo] = useState(initialData.anoModelo ?? "");
const [cor, setCor] = useState(initialData.cor ?? "");
const [vin, setVin] = useState(initialData.vin ?? "");
const [numeroMotor, setNumeroMotor] = useState(initialData.numeroMotor ?? "");
const [numeroPortas, setNumeroPortas] = useState(initialData.numeroPortas ?? "");
const [combustivel, setCombustivel] = useState(initialData.combustivel ?? "");
const [caixaVelocidades, setCaixaVelocidades] = useState(initialData.caixaVelocidades ?? "");
const [tracao, setTracao] = useState(initialData.tracao ?? "");
const [potenciaCv, setPotenciaCv] = useState(initialData.potenciaCv ?? "");
const [torqueNm, setTorqueNm] = useState(initialData.torqueNm ?? "");
const [indiciosAdulteracaoKm, setIndiciosAdulteracaoKm] = useState(initialData.indiciosAdulteracaoKm ?? "");
const [numeroProprietariosAnteriores, setNumeroProprietariosAnteriores] = useState(
  initialData.numeroProprietariosAnteriores ?? ""
);
const [registoAcidentesAnteriores, setRegistoAcidentesAnteriores] = useState(
  initialData.registoAcidentesAnteriores ?? ""
);
const [historicoManutencao, setHistoricoManutencao] = useState(initialData.historicoManutencao ?? "");
const [inspecoesPeriodicasIpoNotas, setInspecoesPeriodicasIpoNotas] = useState(
  initialData.inspecoesPeriodicasIpoNotas ?? ""
);
const [inspecoesPeriodicasIpoData, setInspecoesPeriodicasIpoData] = useState(
  initialData.inspecoesPeriodicasIpoData ?? ""
);
const [situacaoFiscalRegular, setSituacaoFiscalRegular] = useState(initialData.situacaoFiscalRegular ?? "");
const [indiciosAdulteracaoPresentes, setIndiciosAdulteracaoPresentes] = useState<"" | "sim" | "nao">(
  initialData.indiciosAdulteracaoPresentes ?? ""
);
const [veiculoImportado, setVeiculoImportado] = useState<"" | "sim" | "nao">(initialData.veiculoImportado ?? "");
const [paisOrigem, setPaisOrigem] = useState(initialData.paisOrigem ?? "");
const [matriculaOrigem, setMatriculaOrigem] = useState(initialData.matriculaOrigem ?? "");
const [dataImportacao, setDataImportacao] = useState(initialData.dataImportacao ?? "");
const [possuiCoc, setPossuiCoc] = useState<"" | "sim" | "nao">(initialData.possuiCoc ?? "");
const [isencaoIsvAplicada, setIsencaoIsvAplicada] = useState<"" | "sim" | "nao">(initialData.isencaoIsvAplicada ?? "");
const [numeroDav, setNumeroDav] = useState(initialData.numeroDav ?? "");
const [dataPrimeiraMatricula, setDataPrimeiraMatricula] = useState(initialData.dataPrimeiraMatricula ?? "");
const [valorBaseIucAnual, setValorBaseIucAnual] = useState(initialData.valorBaseIucAnual ?? "");
```

`activeTab`, `personalizadosPorCategoria`, `categoriaAbrindoDialog`, `state`, and the two `useRef`s are untouched — none of them are in `InspectionFormInitialData`.

Then swap the action binding:

```tsx
const initialActionState: CreateInspectionState | UpdateInspectionState = { status: "idle" };
const [state, formAction] = useActionState(
  inspectionId ? updateInspectionAction : createInspectionAction,
  initialActionState
);
```

And add the hidden field + submit label change near the top of the `<form>`:

```tsx
{inspectionId && <input type="hidden" name="inspectionId" value={inspectionId} />}
```

```tsx
{activeTab === TAB_IDS[TAB_IDS.length - 1] ? (
  <button type="submit" className="btn btn-primary" onClick={handleGuardarClick}>
    {inspectionId ? "Guardar alterações" : "Guardar"}
  </button>
) : (
```

`handleFillTestData` and its dev-only button stay create-mode-only — wrap the existing block: `{!inspectionId && process.env.NODE_ENV !== "production" && (...)}`. It exists to speed up manual testing of a brand-new inspection; pre-filled edit-mode data makes it redundant and its checkbox-clicking logic assumes nothing is selected yet.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/new/new-inspection-form.tsx" "app/(app)/inspections/new/new-inspection-form.test.tsx"
git commit -m "feat: NewInspectionForm supports edit mode via inspectionId/initialData"
```

---

### Task 5: `EquipamentoCategoria`/`EquipamentoItem` — pre-fill + removal confirmation

**Files:**
- Modify: `app/(app)/inspections/new/equipamento-categoria.tsx`
- Test: `app/(app)/inspections/new/equipamento-categoria.test.tsx` (extend existing file)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: exported type `EquipamentoInitial = { id: string; condicao: "bom" | "atencao"; comentario: string | null; foto1Url: string | null; foto2Url: string | null }`. `EquipamentoCategoria` gains `initialSelecionados?: Record<string, EquipamentoInitial>` (keyed by item `nome`), and a new `onRemovido?: (id: string) => void` callback that fires once a previously-existing item is confirmed removed — Task 4's `NewInspectionForm` collects these into the `equipamentosRemovidos` hidden field (comma-joined ids) consumed by Task 3's action.

- [ ] **Step 1: Write the failing test**

Add to the existing `app/(app)/inspections/new/equipamento-categoria.test.tsx`:

```tsx
// added to app/(app)/inspections/new/equipamento-categoria.test.tsx
describe("EquipamentoCategoria in edit mode", () => {
  const initial = {
    "Ar condicionado": { id: "equip-1", condicao: "bom" as const, comentario: null, foto1Url: null, foto2Url: null },
  };

  it("pre-checks and pre-fills condição for an item present in initialSelecionados", () => {
    render(
      <EquipamentoCategoria
        categoriaId="interior"
        label="Interior"
        itensPreDefinidos={["Ar condicionado"]}
        itensPersonalizados={[]}
        onAddPersonalizado={() => {}}
        initialSelecionados={initial}
      />
    );

    expect(screen.getByRole("checkbox", { name: "Ar condicionado" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Bom \(Ar condicionado\)/ })).toBeChecked();
  });

  it("asks for confirmation before unchecking a previously-selected item, and only calls onRemovido after confirming", async () => {
    const onRemovido = vi.fn();
    render(
      <EquipamentoCategoria
        categoriaId="interior"
        label="Interior"
        itensPreDefinidos={["Ar condicionado"]}
        itensPersonalizados={[]}
        onAddPersonalizado={() => {}}
        initialSelecionados={initial}
        onRemovido={onRemovido}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Ar condicionado" }));

    // Still checked — unchecking is pending confirmation, not applied yet.
    expect(screen.getByRole("checkbox", { name: "Ar condicionado" })).toBeChecked();
    expect(onRemovido).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmar remo/i }));

    expect(screen.getByRole("checkbox", { name: "Ar condicionado" })).not.toBeChecked();
    expect(onRemovido).toHaveBeenCalledWith("equip-1");
  });

  it("does not show a confirmation dialog for a freshly-checked item with no initial data", async () => {
    render(
      <EquipamentoCategoria
        categoriaId="interior"
        label="Interior"
        itensPreDefinidos={["Ar condicionado"]}
        itensPersonalizados={[]}
        onAddPersonalizado={() => {}}
      />
    );

    const user = userEvent.setup();
    const checkbox = screen.getByRole("checkbox", { name: "Ar condicionado" });
    await user.click(checkbox);
    await user.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /confirmar remo/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/inspections/new/equipamento-categoria.test.tsx"`
Expected: FAIL — `initialSelecionados`/`onRemovido` props don't exist, no confirmation dialog rendered.

- [ ] **Step 3: Write the implementation**

```tsx
// app/(app)/inspections/new/equipamento-categoria.tsx
"use client";

import { useRef, useState, type ChangeEvent, type FocusEvent } from "react";
import type { EquipamentoCategoriaId } from "@/lib/equipamento/catalog";

type Condicao = "" | "bom" | "atencao";

export type EquipamentoInitial = {
  id: string;
  condicao: "bom" | "atencao";
  comentario: string | null;
  foto1Url: string | null;
  foto2Url: string | null;
};

function itemKey(categoriaId: string, nome: string, index: number): string {
  return `${categoriaId}--${index}`;
}

function EquipamentoItem({
  categoriaId,
  nome,
  index,
  personalizado,
  initial,
  onVerificadoChange,
  onRemovido,
}: {
  categoriaId: EquipamentoCategoriaId;
  nome: string;
  index: number;
  personalizado: boolean;
  initial?: EquipamentoInitial;
  onVerificadoChange?: (index: number, verificado: boolean) => void;
  onRemovido?: (id: string) => void;
}) {
  const key = itemKey(categoriaId, nome, index);
  const prefix = `equip__${key}`;
  const [selecionado, setSelecionado] = useState(initial !== undefined);
  const [condicao, setCondicao] = useState<Condicao>(initial?.condicao ?? "");
  const [expandido, setExpandido] = useState(true);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);

  function handleSelecionadoChange(e: ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    if (!checked && initial) {
      // Unchecking a previously-existing item: don't apply it yet, ask first.
      // Reverting the native checkbox back to checked (it already unchecked
      // itself visually) keeps state and DOM in sync until confirmed.
      e.target.checked = true;
      confirmDialogRef.current?.showModal();
      return;
    }
    setSelecionado(checked);
    if (checked) {
      setExpandido(true);
      onVerificadoChange?.(index, condicao !== "");
    } else {
      onVerificadoChange?.(index, false);
    }
  }

  function handleConfirmRemocao() {
    confirmDialogRef.current?.close();
    setSelecionado(false);
    onVerificadoChange?.(index, false);
    if (initial) onRemovido?.(initial.id);
  }

  function handleCondicaoChange(novaCondicao: Condicao) {
    setCondicao(novaCondicao);
    onVerificadoChange?.(index, novaCondicao !== "");
  }

  function handleItemBlur(e: FocusEvent<HTMLLIElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (condicao !== "") setExpandido(false);
  }

  const compactado = !expandido && selecionado && condicao !== "";

  return (
    <li className={`equip-item${selecionado ? " equip-item--selecionado" : ""}`} onBlur={handleItemBlur}>
      <input type="hidden" name={`${prefix}__categoria`} value={categoriaId} />
      <input type="hidden" name={`${prefix}__nome`} value={nome} />
      <input type="hidden" name={`${prefix}__personalizado`} value={personalizado ? "1" : "0"} />
      {initial && <input type="hidden" name={`${prefix}__id`} value={initial.id} />}

      <dialog ref={confirmDialogRef} className="dialog-panel">
        <div className="stack">
          <p>Remover "{nome}"? Isto apaga as fotos anexadas.</p>
          <div className="stack-row">
            <button type="button" className="btn btn-secondary" onClick={() => confirmDialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={handleConfirmRemocao}>
              Confirmar remoção
            </button>
          </div>
        </div>
      </dialog>

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
                onChange={() => handleCondicaoChange("bom")}
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
                onChange={() => handleCondicaoChange("atencao")}
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
              defaultValue={initial?.comentario ?? ""}
            />
          </div>

          <div className="equip-item__fotos" hidden={condicao !== "atencao"}>
            <div className="field">
              <label htmlFor={`${prefix}__foto1`} className="label">
                {`Foto 1 (${nome})`}
              </label>
              {initial?.foto1Url && (
                <p className="hint">
                  Foto atual anexada — escolher um novo arquivo substitui.
                </p>
              )}
              <input id={`${prefix}__foto1`} name={`${prefix}__foto1`} type="file" accept="image/*" className="input" />
            </div>
            <div className="field">
              <label htmlFor={`${prefix}__foto2`} className="label">
                {`Foto 2 (${nome})`}
              </label>
              {initial?.foto2Url && (
                <p className="hint">
                  Foto atual anexada — escolher um novo arquivo substitui.
                </p>
              )}
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

export function EquipamentoCategoria({
  categoriaId,
  label,
  itensPreDefinidos,
  itensPersonalizados,
  onAddPersonalizado,
  initialSelecionados = {},
  onRemovido,
}: {
  categoriaId: EquipamentoCategoriaId;
  label: string;
  itensPreDefinidos: readonly string[];
  itensPersonalizados: string[];
  onAddPersonalizado: () => void;
  initialSelecionados?: Record<string, EquipamentoInitial>;
  onRemovido?: (id: string) => void;
}) {
  const todosOsItens = [...itensPreDefinidos, ...itensPersonalizados];
  const [verificados, setVerificados] = useState<Set<number>>(
    new Set(todosOsItens.map((nome, i) => (initialSelecionados[nome] ? i : -1)).filter((i) => i >= 0))
  );

  function handleVerificadoChange(index: number, verificado: boolean) {
    setVerificados((prev) => {
      const next = new Set(prev);
      if (verificado) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  return (
    <details className="equip-categoria" open={verificados.size > 0}>
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
            initial={initialSelecionados[nome]}
            onVerificadoChange={handleVerificadoChange}
            onRemovido={onRemovido}
          />
        ))}
      </ul>
    </details>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/inspections/new/equipamento-categoria.test.tsx"`
Expected: PASS (all existing tests plus the 3 new ones)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/new/equipamento-categoria.tsx" "app/(app)/inspections/new/equipamento-categoria.test.tsx"
git commit -m "feat: EquipamentoCategoria supports pre-filled edit mode with removal confirmation"
```

---

### Task 6: Wire equipamento edit-mode props through `NewInspectionForm`

**Files:**
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx`

**Interfaces:**
- Consumes: `EquipamentoInitial` type from Task 5 (`./equipamento-categoria`).
- Produces: the `equipamentosRemovidos` hidden input Task 3's `updateInspectionAction` reads.

- [ ] **Step 1: Write the failing test**

Add to `app/(app)/inspections/new/new-inspection-form.test.tsx`:

```tsx
// added to app/(app)/inspections/new/new-inspection-form.test.tsx
it("threads initialEquipamentosPorCategoria into EquipamentoCategoria and collects removals into a hidden field", async () => {
  render(
    <NewInspectionForm
      inspectionId="insp-1"
      initialData={{ matricula: "AA-11-BB" }}
      initialEquipamentosPorCategoria={{
        interior: {
          "Ar condicionado": { id: "equip-1", condicao: "bom", comentario: null, foto1Url: null, foto2Url: null },
        },
      }}
    />
  );

  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Equipamentos" }));
  expect(screen.getByRole("checkbox", { name: "Ar condicionado" })).toBeChecked();

  await user.click(screen.getByRole("checkbox", { name: "Ar condicionado" }));
  await user.click(screen.getByRole("button", { name: /confirmar remo/i }));

  expect(document.querySelector('input[name="equipamentosRemovidos"]')).toHaveValue("equip-1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: FAIL — `initialEquipamentosPorCategoria` isn't a prop on `NewInspectionForm` yet (TypeScript error), and no `equipamentosRemovidos` field exists yet.

- [ ] **Step 3: Write the implementation**

In `app/(app)/inspections/new/new-inspection-form.tsx`, import the type and add removal-tracking state:

```tsx
import { EquipamentoCategoria, type EquipamentoInitial } from "./equipamento-categoria";
```

```tsx
const [equipamentosRemovidos, setEquipamentosRemovidos] = useState<string[]>([]);

function handleEquipamentoRemovido(id: string) {
  setEquipamentosRemovidos((prev) => [...prev, id]);
}
```

Add the third prop to the signature Task 4 left at two props (`inspectionId`, `initialData`):

```tsx
export function NewInspectionForm({
  sugestoesPorCategoria = {},
  inspectionId,
  initialData = {},
  initialEquipamentosPorCategoria = {},
}: {
  sugestoesPorCategoria?: Record<string, string[]>;
  inspectionId?: string;
  initialData?: InspectionFormInitialData;
  initialEquipamentosPorCategoria?: Record<string, Record<string, EquipamentoInitial>>;
} = {}) {
```

Wire it into the render loop:

```tsx
{EQUIPAMENTO_CATEGORIAS.map((categoria) => (
  <EquipamentoCategoria
    key={categoria.id}
    categoriaId={categoria.id}
    label={categoria.label}
    itensPreDefinidos={categoria.itens}
    itensPersonalizados={personalizadosPorCategoria[categoria.id] ?? []}
    initialSelecionados={initialEquipamentosPorCategoria[categoria.id] ?? {}}
    onRemovido={handleEquipamentoRemovido}
    onAddPersonalizado={() => {
      setCategoriaAbrindoDialog({ id: categoria.id, label: categoria.label });
      personalizadoDialogRef.current?.showModal();
    }}
  />
))}
```

And add the hidden field near the `inspectionId` one:

```tsx
{inspectionId && equipamentosRemovidos.length > 0 && (
  <input type="hidden" name="equipamentosRemovidos" value={equipamentosRemovidos.join(",")} />
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/new/new-inspection-form.tsx"
git commit -m "feat: wire equipamento edit-mode props and removal tracking into NewInspectionForm"
```

---

### Task 7: Edit route `/inspections/[id]/editar`

**Files:**
- Create: `app/(app)/inspections/[id]/editar/page.tsx`

**Interfaces:**
- Consumes: `NewInspectionForm`, `InspectionFormInitialData` (Task 4), `EquipamentoInitial` (Task 5), `isInspectionEditable` (`@/lib/inspection/status`), `getCurrentUser` (`@/lib/auth/session`).
- Produces: the route Task 8's link points to.

- [ ] **Step 1: Write the implementation**

No dedicated test file — this project doesn't unit-test Server Component pages (`app/(app)/admin/page.tsx`, `app/(app)/inspections/[id]/page.tsx` have no `.test.tsx` counterpart either); Step 2 below is the manual verification this task relies on instead, same convention.

```tsx
// app/(app)/inspections/[id]/editar/page.tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { NewInspectionForm, type InspectionFormInitialData } from "../../new/new-inspection-form";
import type { EquipamentoInitial } from "../../new/equipamento-categoria";

export default async function EditarInspecaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inspection } = await supabase
    .from("inspections")
    .select("status, objetivo, vehicle_data(*), client_data(*)")
    .eq("id", id)
    .single();

  if (!inspection) notFound();

  const currentUser = await getCurrentUser();
  if (!currentUser || !isInspectionEditable(inspection.status as InspectionStatus, currentUser.role)) {
    redirect(`/inspections/${id}`);
  }

  const vd = inspection.vehicle_data;
  const cd = inspection.client_data;

  const initialData: InspectionFormInitialData = {
    tipoCliente: cd?.tipo,
    objetivo: inspection.objetivo,
    nomeSolicitante: cd?.nome_solicitante ?? "",
    contacto: cd?.contacto ?? "",
    email: cd?.email ?? "",
    responsavelPresente: cd?.responsavel_presente ?? "",
    matricula: vd?.matricula ?? "",
    marca: vd?.marca ?? "",
    modelo: vd?.modelo ?? "",
    quilometragem: vd?.quilometragem != null ? String(vd.quilometragem) : "",
    versaoTrim: vd?.versao_trim ?? "",
    anoFabrico: vd?.ano_fabrico != null ? String(vd.ano_fabrico) : "",
    anoModelo: vd?.ano_modelo != null ? String(vd.ano_modelo) : "",
    cor: vd?.cor ?? "",
    vin: vd?.vin ?? "",
    numeroMotor: vd?.numero_motor ?? "",
    numeroPortas: vd?.numero_portas != null ? String(vd.numero_portas) : "",
    combustivel: vd?.combustivel ?? "",
    caixaVelocidades: vd?.caixa_velocidades ?? "",
    tracao: vd?.tracao ?? "",
    potenciaCv: vd?.potencia_cv != null ? String(vd.potencia_cv) : "",
    torqueNm: vd?.torque_nm != null ? String(vd.torque_nm) : "",
    indiciosAdulteracaoKm: vd?.indicios_adulteracao_km ?? "",
    numeroProprietariosAnteriores:
      vd?.numero_proprietarios_anteriores != null ? String(vd.numero_proprietarios_anteriores) : "",
    registoAcidentesAnteriores: vd?.registo_acidentes_anteriores ?? "",
    historicoManutencao: vd?.historico_manutencao ?? "",
    inspecoesPeriodicasIpoNotas: vd?.inspecoes_periodicas_ipo_notas ?? "",
    inspecoesPeriodicasIpoData: vd?.inspecoes_periodicas_ipo_data ?? "",
    situacaoFiscalRegular: vd?.situacao_fiscal_regular ?? "",
    indiciosAdulteracaoPresentes: vd?.indicios_adulteracao_presentes ? "sim" : "nao",
    veiculoImportado: vd?.veiculo_importado ? "sim" : "nao",
    paisOrigem: vd?.pais_origem ?? "",
    matriculaOrigem: vd?.matricula_origem ?? "",
    dataImportacao: vd?.data_importacao ?? "",
    possuiCoc: vd?.possui_coc === null ? "" : vd?.possui_coc ? "sim" : "nao",
    isencaoIsvAplicada: vd?.isencao_isv_aplicada === null ? "" : vd?.isencao_isv_aplicada ? "sim" : "nao",
    numeroDav: vd?.numero_dav ?? "",
    dataPrimeiraMatricula: vd?.data_primeira_matricula ?? "",
    valorBaseIucAnual: vd?.valor_base_iuc_anual != null ? String(vd.valor_base_iuc_anual) : "",
  };

  const { data: equipamentos } = await supabase
    .from("equipamento_inspecao")
    .select("id, categoria, nome_equipamento, condicao, comentario, equipamento_fotos(url, ordem)")
    .eq("inspection_id", id);

  const initialEquipamentosPorCategoria: Record<string, Record<string, EquipamentoInitial>> = {};
  for (const e of equipamentos ?? []) {
    const fotos = (e as unknown as { equipamento_fotos: { url: string; ordem: number | null }[] }).equipamento_fotos;
    initialEquipamentosPorCategoria[e.categoria] ??= {};
    initialEquipamentosPorCategoria[e.categoria][e.nome_equipamento] = {
      id: e.id,
      condicao: e.condicao as "bom" | "atencao",
      comentario: e.comentario,
      foto1Url: fotos?.find((f) => f.ordem === 0)?.url ?? null,
      foto2Url: fotos?.find((f) => f.ordem === 1)?.url ?? null,
    };
  }

  return (
    <main className="page page--wide">
      <h1>Editar dados básicos</h1>
      <NewInspectionForm
        inspectionId={id}
        initialData={initialData}
        initialEquipamentosPorCategoria={initialEquipamentosPorCategoria}
      />
    </main>
  );
}
```

- [ ] **Step 2: Manual verification**

Start the dev server, log in as técnico, open a `rascunho` inspection, navigate to `/inspections/<id>/editar` directly, confirm every tab shows the previously-entered data (not blank), confirm an already-selected equipamento shows checked with its condição/comentário/fotos indicator. Then log in as admin and repeat against an `aprovada` inspection — should still be reachable (admin always editable) and, after saving, confirm a new `audit_log_entries` row appears in the Histórico section of `/inspections/<id>`. Then confirm a `cancelada` inspection redirects away from `/editar` back to the summary page for a técnico account.

- [ ] **Step 3: Run typecheck and full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean/green — this task adds no new automated tests of its own, so this step is purely a regression check on everything touched by Tasks 1–6.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/inspections/[id]/editar/page.tsx"
git commit -m "feat: add /inspections/[id]/editar route"
```

---

### Task 8: Link to the edit screen from the checklist

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/layout.tsx`

**Interfaces:**
- Consumes: nothing new — `editable` and `id` are already computed in this file.

- [ ] **Step 1: Write the implementation**

In `app/(app)/inspections/[id]/checklist/layout.tsx`, add a link right after the existing "Voltar ao resumo" link (same nav, same visibility rule as the rest of the edit-gated UI already in this file):

```tsx
{editable && (
  <Link href={`/inspections/${id}/editar`} className="checklist-nav__link">
    Editar dados básicos
  </Link>
)}
```

Place it directly below the existing:

```tsx
<Link href={`/inspections/${id}`} className="checklist-nav__link checklist-nav__back">
  ← Voltar ao resumo
</Link>
```

- [ ] **Step 2: Manual verification**

Open the checklist for an editable inspection (técnico, `rascunho`) — the link appears at the top of the sidebar and navigates to `/inspections/<id>/editar`. Open the checklist for a non-editable one (técnico, `aguardando_aprovacao`) — the link does not appear, matching the existing "Só leitura" badge behavior already gated by the same `editable` flag.

- [ ] **Step 3: Run typecheck and full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean/green.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/layout.tsx"
git commit -m "feat: link to /editar from the checklist sidebar"
```

---

## Self-review notes (for the plan author, not a task)

- **Spec coverage:** §3.1 → Task 1. §3.2 (edit screen + route + link) → Tasks 4, 6, 7, 8. §3.3 (`updateInspectionAction`) → Task 3. §2 equipamento reconciliation (update/insert/delete-with-confirmation, photo slot replace, admin audit log) → Tasks 2, 3, 5. Every decision in the spec has a task.
- **Fixed during self-review:** Task 2/Task 1's SQL tests originally used pgTAP syntax (`plan()`/`is()`/`finish()`), inconsistent with this project's actual convention (`supabase/tests/00046_users_insert_policy.test.sql` — raw `do $$ ... raise exception/raise notice ... $$` blocks, `set local request.jwt.claims` for auth simulation) — rewritten to match. Task 3's `UpdateInspectionState` originally had an unreachable `"success"` variant and its tests asserted a returned success status that can never happen (`redirect()` always throws, matching `createInspectionAction`'s own established test pattern) — both fixed. Task 4 originally referenced `EquipamentoInitial` (a Task 5 type) in its own prop signature, which would fail to compile at Task 4's point in the sequence — the `initialEquipamentosPorCategoria` prop is now added by Task 6 instead, after the type exists. Task 7 had a dead `cond ? undefined : undefined` placeholder for `objetivo` plus a redundant second query — folded into the primary `select`.
