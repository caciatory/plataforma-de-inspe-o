# Preenchimento de item (Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the item fill-in screen (RF-13 to RF-22) — classification, NF confirmation, photo/observation attach, and paint-thickness measurement with auto-derived classification — on top of the DB layer already in `main`.

**Architecture:** One new dedicated route per item (`/inspections/[id]/checklist/[groupId]/[itemId]`), Server Components for data fetch, Server Actions for writes (matching the existing `inspections/new` pattern), a new Storage bucket for photos (browser-direct upload), and one new atomic RPC (`save_paint_measurement`) for the measurement write path.

**Tech Stack:** Next.js 15 (App Router, Server Actions, `useActionState`), React 19, Supabase (Postgres + Storage), Vitest + Testing Library. No new npm dependencies.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-20-preenchimento-item-design.md` — read it for the "why" behind every decision below.
- Photos bucket (`fotos-inspecao`) is **public** — no signed URLs, decided during brainstorming.
- Out of scope, do not build: RF-23/24 (finalize inspection button), RF-63 (`aplica_stand` filter), autosave (Fase 3), pontuação (Fase 4), "aplicar aos demais" bulk-apply (Fase 2.5).
- All RLS enforcement for writes already exists in `main` (migrations 00009, 00013, 00014) — do not add new RLS policies on `checklist_item_responses`, `paint_measurements`, or `photos`. Only new policy needed is the Storage one in Task 1.
- New RPCs follow the existing style: `language plpgsql security invoker set search_path = ''`, every reference fully qualified with `public.` (see `supabase/migrations/00017_fase1a_create_inspection.sql`).
- Page components that are pure fetch-and-render get no dedicated test — same documented exception as `checklist/layout.tsx` and `inspections/[id]/page.tsx`. Logic worth testing lives in pure functions or Server Actions instead.
- Every Postgres write in a Server Action ends with `.select("id").single()` (or is a plain RPC call) — one consistent chain shape, easier to mock in tests, matches `createInspectionAction`'s existing style of always checking `{ data, error }`.
- Deleting a photo only deletes the `public.photos` row — the Storage object is left orphaned (bucket is already public, cheap, no security exposure). No Storage `DELETE` policy is created in this plan.

---

### Task 1: DB — Storage bucket for photos

**Files:**
- Create: `supabase/migrations/00020_photos_storage_bucket.sql`
- Test: `supabase/tests/00020_photos_storage_bucket.test.sql`

**Interfaces:**
- Produces: bucket `fotos-inspecao` (public), path convention `{inspection_id}/{item_template_id}/{filename}` — Task 5 (`PhotoManager`) builds paths following this convention and uploads directly to this bucket from the browser.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00020_photos_storage_bucket.sql
-- RF-15/16/21: bucket de Storage pras fotos de item -- nao existia nenhum ate
-- aqui, photos.url so guardava texto sem nada que o preenchesse. Publico
-- (decisao do design: docs/superpowers/specs/2026-07-20-preenchimento-item-
-- design.md secao 2) -- leitura nao passa por RLS, so o upload.
--
-- path convention: {inspection_id}/{item_template_id}/{filename} -- primeiro
-- segmento e sempre o inspection_id, e o que a policy abaixo usa.

insert into storage.buckets (id, name, public)
values ('fotos-inspecao', 'fotos-inspecao', true);

create policy fotos_inspecao_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-inspecao'
    and public.owns_editable_inspection((storage.foldername(name))[1]::uuid)
  );

-- ponytail: sem policy de DELETE aqui de proposito -- excluir foto (RF-17) so
-- apaga a linha em public.photos (Task 4), o objeto fica orfao no bucket
-- (publico, custo irrelevante). Adicionar policy de DELETE + limpeza se isso
-- virar problema real.
```

- [ ] **Step 2: Apply the migration**

```bash
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00020` applied without error. If `psql`/`supabase` report the ledger is out of sync, follow the repair steps in the `reference-db-connection-inspecta` memory before retrying.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00020_photos_storage_bucket.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000002', 'tecnico2@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000002', 'Tecnico Dois', 'tecnico2@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'aprovada', 'particular', 'compra');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
begin
  insert into storage.objects (bucket_id, name)
    values ('fotos-inspecao', '00000000-0000-0000-0000-000000000010/item-x/foto.jpg');
  raise notice 'OK: tecnico dono de inspecao rascunho consegue subir foto';
end $$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('fotos-inspecao', '00000000-0000-0000-0000-000000000011/item-x/foto.jpg');
    raise exception 'FALHOU: deveria ter bloqueado upload em inspecao aprovada (nao editavel)';
  exception when insufficient_privilege then
    raise notice 'OK: upload bloqueado em inspecao nao editavel';
  end;
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('fotos-inspecao', '00000000-0000-0000-0000-000000000010/item-x/foto.jpg');
    raise exception 'FALHOU: deveria ter bloqueado upload de tecnico que nao e dono da inspecao';
  exception when insufficient_privilege then
    raise notice 'OK: upload bloqueado pra tecnico que nao e dono';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00020_photos_storage_bucket.test.sql
```

Expected: three `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00020_photos_storage_bucket.sql supabase/tests/00020_photos_storage_bucket.test.sql
git commit -m "feat: add public Storage bucket for item photos"
```

---

### Task 2: DB — `save_paint_measurement` RPC

**Files:**
- Create: `supabase/migrations/00021_save_paint_measurement.sql`
- Test: `supabase/tests/00021_save_paint_measurement.test.sql`

**Interfaces:**
- Consumes: `public.owns_editable_inspection`, `public.checklist_item_responses`, `public.paint_measurements` — all exist in `main`.
- Produces: `public.save_paint_measurement(p_inspection_id uuid, p_item_template_id uuid, p_valores_um numeric[]) returns table(item_response_id uuid, resultado_calculado public.paint_resultado, classificacao public.item_classificacao)` — Task 4's `saveMeasurementAction` calls this via `supabase.rpc("save_paint_measurement", {...})`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00021_save_paint_measurement.sql
-- RF-19 a RF-22: escrita atomica do item de medicao. Upsert da resposta, upsert
-- da medicao (dispara resultado_calculado, coluna gerada da migration 00012),
-- deriva classificacao do resultado e atualiza a resposta -- assim status
-- (gerado a partir de classificacao, migration 00003) fica 'respondido' sem
-- nenhuma mudanca na Fase 1 (lib/checklist/progress.ts). reparacao_colisao ->
-- 'ruim' passa a exigir foto automaticamente via trigger RF-16 ja existente
-- (migration 00013) -- leitura razoavel do requisito, que nao restringe
-- "ruim" a item padrao. Ver design: docs/superpowers/specs/
-- 2026-07-20-preenchimento-item-design.md secao 4.

create function public.save_paint_measurement(
  p_inspection_id uuid,
  p_item_template_id uuid,
  p_valores_um numeric[]
) returns table (
  item_response_id uuid,
  resultado_calculado public.paint_resultado,
  classificacao public.item_classificacao
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_response_id uuid;
  v_resultado public.paint_resultado;
  v_classificacao public.item_classificacao;
begin
  insert into public.checklist_item_responses (inspection_id, item_template_id)
  values (p_inspection_id, p_item_template_id)
  on conflict (inspection_id, item_template_id) do update set atualizado_em = now()
  returning id into v_response_id;

  insert into public.paint_measurements (item_response_id, valores_um)
  values (v_response_id, p_valores_um::numeric(6,2)[])
  on conflict (item_response_id) do update set valores_um = excluded.valores_um
  returning resultado_calculado into v_resultado;

  v_classificacao := case v_resultado
    when 'OK' then 'otimo'::public.item_classificacao
    when 'anomalia' then 'medio'::public.item_classificacao
    when 'reparacao_colisao' then 'ruim'::public.item_classificacao
  end;

  update public.checklist_item_responses
  set classificacao = v_classificacao
  where id = v_response_id;

  return query select v_response_id, v_resultado, v_classificacao;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

```bash
set -a && source supabase/.env.local && set +a
supabase db push --db-url "$DATABASE_URL"
```

Expected: migration `00021` applied without error.

- [ ] **Step 3: Write the SQL test**

```sql
-- supabase/tests/00021_save_paint_measurement.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 904, 'Exterior Teste RPC');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Espessura de pintura - Capo', 'medicao', 3);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

-- Cenario A: valores na faixa normal (70-160) -> OK -> classificacao 'otimo',
-- status passa a 'respondido' sem nenhuma mudanca na Fase 1.
do $$
declare
  v_response_id uuid;
  v_resultado public.paint_resultado;
  v_classificacao public.item_classificacao;
begin
  select item_response_id, resultado_calculado, classificacao
    into v_response_id, v_resultado, v_classificacao
    from public.save_paint_measurement(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000021',
      array[100, 110, 120]::numeric[]
    );

  if v_resultado <> 'OK' or v_classificacao <> 'otimo' then
    raise exception 'FALHOU: esperava OK/otimo, obteve %/%', v_resultado, v_classificacao;
  end if;

  if not exists (
    select 1 from public.checklist_item_responses
    where id = v_response_id and status = 'respondido'
  ) then
    raise exception 'FALHOU: status deveria ser respondido apos salvar medicao';
  end if;

  raise notice 'OK: valores na faixa normal geram OK/otimo e status respondido';
end $$;

-- Cenario B: chamar de novo com valores diferentes faz upsert (nao duplica) e
-- recalcula o resultado.
do $$
declare
  v_count int;
  v_resultado public.paint_resultado;
begin
  select resultado_calculado into v_resultado
    from public.save_paint_measurement(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000021',
      array[50, 60, 65]::numeric[]
    );

  select count(*) into v_count from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010'
      and item_template_id = '00000000-0000-0000-0000-000000000021';

  if v_count <> 1 then
    raise exception 'FALHOU: esperava 1 linha de resposta apos upsert, encontrou %', v_count;
  end if;
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: esperava anomalia pra minimo 50um, obteve %', v_resultado;
  end if;

  raise notice 'OK: segunda chamada faz upsert (1 linha) e recalcula resultado';
end $$;

-- Forca checagem imediata da trigger deferred de RF-16 (migration 00013) pro
-- cenario C conseguir testar o bloqueio dentro desta mesma transacao.
set constraints all immediate;

-- Cenario C: valor >= 300 -> reparacao_colisao -> classificacao 'ruim' -> exige
-- foto (trigger RF-16 ja existente) -- sem foto, a chamada inteira falha.
do $$
begin
  begin
    perform public.save_paint_measurement(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000021',
      array[100, 200, 300]::numeric[]
    );
    raise exception 'FALHOU: reparacao_colisao sem foto deveria ter bloqueado (RF-16)';
  exception when check_violation then
    raise notice 'OK: reparacao_colisao sem foto bloqueado pela trigger RF-16 existente';
  end;
end $$;

rollback;
```

- [ ] **Step 4: Run the test**

```bash
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -f supabase/tests/00021_save_paint_measurement.test.sql
```

Expected: three `NOTICE: OK: ...` lines, no `ERROR`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00021_save_paint_measurement.sql supabase/tests/00021_save_paint_measurement.test.sql
git commit -m "feat: add save_paint_measurement RPC with auto-derived classification"
```

---

### Task 3: `findNextItemId` pure function

**Files:**
- Modify: `lib/checklist/progress.ts`
- Test: `lib/checklist/progress.test.ts`

**Interfaces:**
- Consumes: `SubcategoriaGroup` (already exported from this file).
- Produces: `findNextItemId(subcategorias: SubcategoriaGroup[], currentItemId: string): string | null` — Task 6's item page uses this to compute the "Salvar e próximo" target URL.

- [ ] **Step 1: Write the failing test**

Add to `lib/checklist/progress.test.ts` (extend the existing `import` block to include `findNextItemId`, and add this new `describe` block at the end of the file):

```ts
import {
  isItemPending,
  computeGroupProgress,
  groupItemsBySubcategoria,
  findNextItemId,
  type GroupTemplate,
  type ItemTemplate,
  type ItemResponseRow,
  type ItemTemplateDetail,
} from "./progress";
```

```ts
describe("findNextItemId", () => {
  const subcategorias = groupItemsBySubcategoria(
    [
      { id: "item-1", subcategoria: "A", nome: "Primeiro" },
      { id: "item-2", subcategoria: "A", nome: "Segundo" },
      { id: "item-3", subcategoria: "B", nome: "Terceiro" },
    ],
    []
  );

  it("returns the next item's id within the flattened order", () => {
    expect(findNextItemId(subcategorias, "item-1")).toBe("item-2");
  });

  it("crosses subcategoria boundaries", () => {
    expect(findNextItemId(subcategorias, "item-2")).toBe("item-3");
  });

  it("returns null for the last item", () => {
    expect(findNextItemId(subcategorias, "item-3")).toBeNull();
  });

  it("returns null when the current item id isn't found", () => {
    expect(findNextItemId(subcategorias, "does-not-exist")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/checklist/progress.test.ts
```

Expected: FAIL — `findNextItemId is not a function` / not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/checklist/progress.ts`:

```ts
export function findNextItemId(subcategorias: SubcategoriaGroup[], currentItemId: string): string | null {
  const flat = subcategorias.flatMap((bucket) => bucket.items);
  const index = flat.findIndex((item) => item.id === currentItemId);
  if (index === -1 || index === flat.length - 1) return null;
  return flat[index + 1].id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/checklist/progress.test.ts
```

Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add lib/checklist/progress.ts lib/checklist/progress.test.ts
git commit -m "feat: add findNextItemId for item fill-in navigation"
```

---

### Task 4: Item Server Actions

**Files:**
- Create: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server` (existing); RPC `save_paint_measurement` (Task 2).
- Produces: `saveClassificacaoAction`, `saveMeasurementAction` (both `useActionState`-shaped: `(prevState, formData) => Promise<{status:"idle"} | {status:"error", message:string}>`), `attachPhotoAction(inspectionId: string, itemTemplateId: string, url: string): Promise<{error?: string, photoId?: string}>`, `deletePhotoAction(photoId: string): Promise<{error?: string}>` — Task 5 (`PhotoManager`) calls `attachPhotoAction`/`deletePhotoAction` directly; Task 6's forms use `saveClassificacaoAction`/`saveMeasurementAction` as `useActionState` reducers.

- [ ] **Step 1: Write the failing tests**

```ts
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertQuery = { select: vi.fn(() => upsertQuery), single: vi.fn() };
const upsert = vi.fn(() => upsertQuery);

const insertQuery = { select: vi.fn(() => insertQuery), single: vi.fn() };
const insert = vi.fn(() => insertQuery);

const deleteQuery = { eq: vi.fn() };
const del = vi.fn(() => deleteQuery);

const rpc = vi.fn();

const from = vi.fn(() => ({ upsert, insert, delete: del }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from, rpc }),
}));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  from.mockClear();
  upsert.mockClear();
  upsertQuery.select.mockClear();
  upsertQuery.single.mockReset();
  insert.mockClear();
  insertQuery.select.mockClear();
  insertQuery.single.mockReset();
  del.mockClear();
  deleteQuery.eq.mockReset();
  rpc.mockReset();
  redirect.mockClear();
});

describe("saveClassificacaoAction", () => {
  it("returns a validation error without writing when classificacao is missing", async () => {
    const { saveClassificacaoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");

    const result = await saveClassificacaoAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the response and redirects to nextUrl on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveClassificacaoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");
    formData.set("classificacao", "medio");
    formData.set("observacao", "Desgaste leve");

    await expect(saveClassificacaoAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1/item-2"
    );

    expect(upsert).toHaveBeenCalledWith(
      { inspection_id: "insp-1", item_template_id: "item-1", classificacao: "medio", observacao: "Desgaste leve" },
      { onConflict: "inspection_id,item_template_id" }
    );
  });

  it("returns a friendly message when the DB rejects 'ruim' without a photo (check_violation)", async () => {
    upsertQuery.single.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveClassificacaoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("classificacao", "ruim");

    const result = await saveClassificacaoAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});

describe("attachPhotoAction", () => {
  it("upserts the response then inserts the photo, returning its id", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    insertQuery.single.mockResolvedValue({ data: { id: "photo-1" }, error: null });
    const { attachPhotoAction } = await import("./actions");

    const result = await attachPhotoAction("insp-1", "item-1", "https://example.com/foto.jpg");

    expect(result).toEqual({ photoId: "photo-1" });
    expect(insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      item_response_id: "resp-1",
      contexto: "item",
      url: "https://example.com/foto.jpg",
    });
  });

  it("returns an error when the response upsert fails", async () => {
    upsertQuery.single.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { attachPhotoAction } = await import("./actions");

    const result = await attachPhotoAction("insp-1", "item-1", "https://example.com/foto.jpg");

    expect(result.error).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("deletePhotoAction", () => {
  it("deletes the photo row", async () => {
    deleteQuery.eq.mockResolvedValue({ error: null });
    const { deletePhotoAction } = await import("./actions");

    const result = await deletePhotoAction("photo-1");

    expect(result).toEqual({});
    expect(deleteQuery.eq).toHaveBeenCalledWith("id", "photo-1");
  });

  it("returns an error when the delete fails", async () => {
    deleteQuery.eq.mockResolvedValue({ error: { message: "db error" } });
    const { deletePhotoAction } = await import("./actions");

    const result = await deletePhotoAction("photo-1");

    expect(result.error).toBeTruthy();
  });
});

describe("saveMeasurementAction", () => {
  it("returns a validation error without calling the RPC when a value is not a number", async () => {
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.append("valor", "100");
    formData.append("valor", "abc");

    const result = await saveMeasurementAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with numeric values and redirects on success", async () => {
    rpc.mockResolvedValue({ data: [{ item_response_id: "resp-1" }], error: null });
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");
    formData.append("valor", "100");
    formData.append("valor", "110");
    formData.append("valor", "120");

    await expect(saveMeasurementAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1/item-2"
    );

    expect(rpc).toHaveBeenCalledWith("save_paint_measurement", {
      p_inspection_id: "insp-1",
      p_item_template_id: "item-1",
      p_valores_um: [100, 110, 120],
    });
  });

  it("returns a friendly message when the DB rejects reparacao_colisao without a photo", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.append("valor", "300");
    formData.append("valor", "300");
    formData.append("valor", "300");

    const result = await saveMeasurementAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
```

Expected: FAIL — `./actions` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ITEM_CLASSIFICACOES = ["otimo", "medio", "ruim", "NF"] as const;
type ItemClassificacao = (typeof ITEM_CLASSIFICACOES)[number];

export type SaveClassificacaoState = { status: "idle" } | { status: "error"; message: string };
export type SaveMeasurementState = { status: "idle" } | { status: "error"; message: string };

function friendlyDbError(error: { code?: string; message?: string }, ruimMessage: string): string {
  if (error.code === "23514") return ruimMessage;
  return "Não foi possível guardar. Tente novamente.";
}

export async function saveClassificacaoAction(
  _prevState: SaveClassificacaoState,
  formData: FormData
): Promise<SaveClassificacaoState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const nextUrl = formData.get("nextUrl") as string;
  const classificacao = formData.get("classificacao") as string;
  const observacao = (formData.get("observacao") as string) || null;

  if (!ITEM_CLASSIFICACOES.includes(classificacao as ItemClassificacao)) {
    return { status: "error", message: "Selecione uma classificação." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId, classificacao, observacao },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("saveClassificacaoAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Classificação 'ruim' exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
    };
  }

  redirect(nextUrl);
}

export async function attachPhotoAction(
  inspectionId: string,
  itemTemplateId: string,
  url: string
): Promise<{ error?: string; photoId?: string }> {
  const supabase = await createClient();

  const { data: response, error: upsertError } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (upsertError || !response) {
    console.error("attachPhotoAction upsert failed", upsertError);
    return { error: "Não foi possível anexar a foto. Tente novamente." };
  }

  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .insert({ inspection_id: inspectionId, item_response_id: response.id, contexto: "item", url })
    .select("id")
    .single();

  if (photoError || !photo) {
    console.error("attachPhotoAction insert failed", photoError);
    return { error: "Não foi possível anexar a foto. Tente novamente." };
  }

  return { photoId: photo.id };
}

export async function deletePhotoAction(photoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("photos").delete().eq("id", photoId);

  if (error) {
    console.error("deletePhotoAction failed", error);
    return { error: "Não foi possível remover a foto. Tente novamente." };
  }

  return {};
}

export async function saveMeasurementAction(
  _prevState: SaveMeasurementState,
  formData: FormData
): Promise<SaveMeasurementState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const nextUrl = formData.get("nextUrl") as string;
  const valores = formData.getAll("valor").map(Number);

  if (valores.length === 0 || valores.some((v) => Number.isNaN(v))) {
    return { status: "error", message: "Preencha todos os valores de medição com números válidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_paint_measurement", {
    p_inspection_id: inspectionId,
    p_item_template_id: itemTemplateId,
    p_valores_um: valores,
  });

  if (error) {
    console.error("saveMeasurementAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Este resultado indica reparação de colisão — anexe pelo menos 1 foto antes de salvar."),
    };
  }

  redirect(nextUrl);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
```

Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
git commit -m "feat: add item classification, photo, and measurement Server Actions"
```

---

### Task 5: `PhotoManager` client component

**Files:**
- Create: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.tsx`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx`

**Interfaces:**
- Consumes: `attachPhotoAction`, `deletePhotoAction` (Task 4); `createClient` from `@/lib/supabase/client` (existing).
- Produces: `PhotoManager({ inspectionId, itemTemplateId, initialPhotos }: { inspectionId: string; itemTemplateId: string; initialPhotos: Photo[] })`, `type Photo = { id: string; url: string }` — Task 6's item forms render this.

- [ ] **Step 1: Write the failing test**

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PhotoManager } from "./photo-manager";

const attachPhotoAction = vi.fn();
const deletePhotoAction = vi.fn();
vi.mock("./actions", () => ({
  attachPhotoAction: (...args: unknown[]) => attachPhotoAction(...args),
  deletePhotoAction: (...args: unknown[]) => deletePhotoAction(...args),
}));

const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload, getPublicUrl }),
    },
  }),
}));

beforeEach(() => {
  attachPhotoAction.mockReset();
  deletePhotoAction.mockReset();
  upload.mockReset();
  getPublicUrl.mockReset();
});

describe("PhotoManager", () => {
  it("renders existing photos with a delete button each", () => {
    render(
      <PhotoManager
        inspectionId="insp-1"
        itemTemplateId="item-1"
        initialPhotos={[{ id: "photo-1", url: "https://example.com/a.jpg" }]}
      />
    );

    expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(1);
  });

  it("uploads a file, attaches it, and adds it to the list", async () => {
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/novo.jpg" } });
    attachPhotoAction.mockResolvedValue({ photoId: "photo-2" });

    render(<PhotoManager inspectionId="insp-1" itemTemplateId="item-1" initialPhotos={[]} />);

    const file = new File(["conteudo"], "foto.jpg", { type: "image/jpeg" });
    const input = screen.getByLabelText("Foto") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(attachPhotoAction).toHaveBeenCalledWith("insp-1", "item-1", "https://example.com/novo.jpg"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(1));
  });

  it("removes a photo from the list after a successful delete", async () => {
    deletePhotoAction.mockResolvedValue({});

    render(
      <PhotoManager
        inspectionId="insp-1"
        itemTemplateId="item-1"
        initialPhotos={[{ id: "photo-1", url: "https://example.com/a.jpg" }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Excluir" })).toHaveLength(0));
    expect(deletePhotoAction).toHaveBeenCalledWith("photo-1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx"
```

Expected: FAIL — `./photo-manager` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.tsx
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
}: {
  inspectionId: string;
  itemTemplateId: string;
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

      setPhotos((prev) => [...prev, { id: result.photoId as string, url: data.publicUrl }]);
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
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    });
  }

  return (
    <div>
      <label htmlFor="photoInput">Foto</label>
      <input
        id="photoInput"
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

Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.test.tsx"
git commit -m "feat: add PhotoManager component for item photo upload/delete"
```

---

### Task 6: Item page + classification/measurement forms

**Files:**
- Create: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx`
- Create: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx`
- Create: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx`

**Interfaces:**
- Consumes: `saveClassificacaoAction`, `saveMeasurementAction` (Task 4); `PhotoManager`, `type Photo` (Task 5); `groupItemsBySubcategoria`, `findNextItemId` (Task 3 / existing); `createClient` from `@/lib/supabase/server` (existing).
- Produces: the routed page itself — no other task consumes this directly, it's the leaf of the tree. No dedicated page test (Global Constraints — pure fetch-and-render).

- [ ] **Step 1: Write `item-classificacao-form.tsx`**

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx
"use client";

import { useActionState, useState, type FormEvent } from "react";
import { saveClassificacaoAction, type SaveClassificacaoState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";

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
  nextUrl,
  initialClassificacao,
  initialObservacao,
  initialPhotos,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nextUrl: string;
  initialClassificacao: string | null;
  initialObservacao: string | null;
  initialPhotos: Photo[];
}) {
  const [state, formAction] = useActionState(saveClassificacaoAction, initialState);
  const [classificacao, setClassificacao] = useState(initialClassificacao ?? "");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (classificacao === "NF") {
      const confirmed = window.confirm("Confirma marcar este item como Não se aplica (NF)?");
      if (!confirmed) e.preventDefault();
    }
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
      <textarea id="observacao" name="observacao" defaultValue={initialObservacao ?? ""} />

      <PhotoManager inspectionId={inspectionId} itemTemplateId={itemTemplateId} initialPhotos={initialPhotos} />

      {state.status === "error" && <p role="alert">{state.message}</p>}

      <button type="submit">Salvar e próximo</button>
    </form>
  );
}
```

- [ ] **Step 2: Write `item-medicao-form.tsx`**

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx
"use client";

import { useActionState } from "react";
import { saveMeasurementAction, type SaveMeasurementState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";

const initialState: SaveMeasurementState = { status: "idle" };

export function ItemMedicaoForm({
  inspectionId,
  itemTemplateId,
  nextUrl,
  qtdPontos,
  initialValores,
  initialPhotos,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nextUrl: string;
  qtdPontos: number;
  initialValores: number[];
  initialPhotos: Photo[];
}) {
  const [state, formAction] = useActionState(saveMeasurementAction, initialState);
  const pontos = Array.from({ length: qtdPontos }, (_, i) => i);

  return (
    <form action={formAction}>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />
      <input type="hidden" name="nextUrl" value={nextUrl} />

      <fieldset>
        <legend>Medição (µm)</legend>
        {pontos.map((i) => (
          <div key={i}>
            <label htmlFor={`valor-${i}`}>Ponto {i + 1}</label>
            <input
              id={`valor-${i}`}
              name="valor"
              type="number"
              step="0.01"
              defaultValue={initialValores[i] ?? ""}
              required
            />
          </div>
        ))}
      </fieldset>

      <PhotoManager inspectionId={inspectionId} itemTemplateId={itemTemplateId} initialPhotos={initialPhotos} />

      {state.status === "error" && <p role="alert">{state.message}</p>}

      <button type="submit">Salvar e próximo</button>
    </form>
  );
}
```

- [ ] **Step 3: Write `page.tsx`**

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria, findNextItemId } from "@/lib/checklist/progress";
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
    .select("id, nome, tipo, qtd_pontos_medicao, observacoes")
    .eq("id", itemId)
    .eq("group_id", groupId)
    .single();

  if (!item) notFound();

  const [{ data: response }, { data: groupItems, error: groupItemsError }] = await Promise.all([
    supabase
      .from("checklist_item_responses")
      .select("id, classificacao, observacao")
      .eq("inspection_id", id)
      .eq("item_template_id", itemId)
      .maybeSingle(),
    supabase.from("checklist_item_templates").select("id, subcategoria, nome").eq("group_id", groupId),
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
  const nextUrl = nextItemId
    ? `/inspections/${id}/checklist/${groupId}/${nextItemId}`
    : `/inspections/${id}/checklist/${groupId}`;

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
          initialPhotos={photos}
        />
      ) : (
        <ItemClassificacaoForm
          inspectionId={id}
          itemTemplateId={itemId}
          nextUrl={nextUrl}
          initialClassificacao={response?.classificacao ?? null}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx"
git commit -m "feat: add item fill-in page with classification and measurement forms"
```

---

### Task 7: Wire item list to the new route

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`

**Interfaces:**
- Consumes: nothing new — only adds navigation into Task 6's route.

- [ ] **Step 1: Add the import and turn each item into a link**

In `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`, add the import:

```tsx
import Link from "next/link";
```

Replace the item rendering:

```tsx
{bucket.items.map((item) => (
  <li key={item.id}>
    {item.status === "pendente" ? "⚠️" : item.status === "NF" ? "➖" : "✅"}{" "}
    <Link href={`/inspections/${id}/checklist/${groupId}/${item.id}`}>{item.nome}</Link>
  </li>
))}
```

- [ ] **Step 2: Run the existing test to confirm no regression**

```bash
npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts"
```

Expected: PASS — the existing test only covers the `notFound` path, unaffected by this change.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/page.tsx"
git commit -m "feat: link checklist group items to the item fill-in page"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all test files pass, including every test added in Tasks 3-5 and the unaffected Task 7 test.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
npx next build
```

Expected: build succeeds; new routes `/inspections/[id]/checklist/[groupId]/[itemId]` appear in the route list.

- [ ] **Step 4: Manual browser verification**

Using the técnico test account (`teste@checkauto.pt` — see `project-checklist-nav-ui-verified` memory), drive the full flow end to end: open an inspection → checklist → a group → a `padrao` item → set classificacao to `ruim` without a photo (expect the friendly error) → attach a photo → set `ruim` again (expect success + auto-advance) → a `medicao` item → enter values that produce each of the three `resultado_calculado` bands → confirm NF triggers the `confirm()` dialog → delete a photo and confirm it disappears.

- [ ] **Step 5: Note completion**

No commit in this task — it's verification only. If Step 4 surfaces a bug, fix it as part of the task where the bug originated (re-open that task's commit with a follow-up fix commit), not here.
