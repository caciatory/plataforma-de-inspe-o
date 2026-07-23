# Adaptar a camada de app ao schema genérico (Peça 1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the checklist item-fill-in app layer (Server Actions, forms, batch panel, page queries, shared types) from the removed rigid schema (`classificacao`/`paint_measurements`) to the generic schema the Peça 1a migrations (`00027`–`00036`) introduced (`opcoes`/`opcao_id`, `medicoes`, `checklist_item_status`/`medicoes_resultado` views), with no visual redesign.

**Architecture:** Bottom-up: shared pure-function modules first (`lib/checklist/progress.ts`, `lib/checklist/siblings.ts`), then the Server Actions they don't depend on but the UI does (`actions.ts`), then presentational primitives (CSS), then leaf components (`batch-apply-panel.tsx`, then `item-escolha-form.tsx` which consumes it, then `item-medicao-form.tsx`), then the two page-level data-fetching integrations that wire everything together (`page.tsx` item, then `page.tsx` group + `layout.tsx` nav). Each task leaves the tree compiling and its own tests passing; the tree as a whole is only fully green again after the last task, since earlier tasks intentionally change shared interfaces that later files still call the old way until their own task lands — this mirrors how Peça 1a's migrations left the app layer broken on purpose until this plan lands.

**Tech Stack:** Next.js (App Router, Server Actions), TypeScript, Supabase JS client, Vitest + Testing Library.

## Global Constraints

- Branch: work happens on the existing worktree branch `worktree-modelo-generico-tipos-resposta` (already has the Peça 1a schema migrations applied to its local DB) — do not create a new worktree.
- No visual/CSS redesign beyond mechanical class renames needed to keep today's colors working (§ design doc, "Peça 3" owns real redesign).
- No UI for `tipo='texto'`/`tipo='data'` — out of scope, current seed has none.
- No flag for excluding an option from scoring/reports — out of scope, those features don't exist yet.
- All DB-column-shaped fields in shared types stay snake_case (matches existing codebase convention: `grupo_replicacao`, `subcategoria` are already snake_case in these same files) — only synthetic component-local identifiers (`itemTemplateId`, `inspectionId`) are camelCase.
- Every task that touches a file with an existing `*.test.*` sibling must update that test file in the same task and get it green before moving on (TDD discipline already used throughout this codebase).
- Run `npm test` (not a filtered run) at the end of every task — regressions in files outside the current task's scope must be caught immediately, not at the final gate.

---

### Task 1: `lib/checklist/progress.ts` — collapse `status` into `respondido: boolean`

**Files:**
- Modify: `lib/checklist/progress.ts`
- Test: `lib/checklist/progress.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ItemResponseRow = { item_template_id: string; respondido: boolean }` (was `{ item_template_id: string; status: ItemResponseStatus }`), `ChecklistItemStatus = { id: string; nome: string; respondido: boolean }` (was `...; status: ItemResponseStatus }`), `isItemPending(respondido: boolean | undefined): boolean`. `ItemResponseStatus` type is deleted — no other file may import it after this task (Task 2 removes its only other usage).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `lib/checklist/progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
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

describe("isItemPending", () => {
  it("treats a missing response as pending", () => {
    expect(isItemPending(undefined)).toBe(true);
  });

  it("treats respondido=false as pending", () => {
    expect(isItemPending(false)).toBe(true);
  });

  it("treats respondido=true as not pending", () => {
    expect(isItemPending(true)).toBe(false);
  });
});

describe("computeGroupProgress", () => {
  const groups: GroupTemplate[] = [
    { id: "g2", ordem: 2, nome: "Interior" },
    { id: "g1", ordem: 1, nome: "Exterior" },
  ];
  const items: ItemTemplate[] = [
    { id: "i1", group_id: "g1" },
    { id: "i2", group_id: "g1" },
    { id: "i3", group_id: "g2" },
  ];

  it("counts items without a response row as pending", () => {
    const responses: ItemResponseRow[] = [{ item_template_id: "i1", respondido: true }];
    const result = computeGroupProgress(groups, items, responses);
    expect(result.find((g) => g.id === "g1")).toEqual({
      id: "g1",
      ordem: 1,
      nome: "Exterior",
      pendentes: 1,
      total: 2,
    });
  });

  it("does not count respondido items as pending", () => {
    const responses: ItemResponseRow[] = [
      { item_template_id: "i1", respondido: true },
      { item_template_id: "i2", respondido: true },
    ];
    const result = computeGroupProgress(groups, items, responses);
    expect(result.find((g) => g.id === "g1")?.pendentes).toBe(0);
  });

  it("returns groups sorted by ordem regardless of input order", () => {
    const result = computeGroupProgress(groups, items, []);
    expect(result.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("returns 0/0 for a group with no items", () => {
    const result = computeGroupProgress(groups, [], []);
    expect(result.find((g) => g.id === "g2")).toEqual({
      id: "g2",
      ordem: 2,
      nome: "Interior",
      pendentes: 0,
      total: 0,
    });
  });
});

describe("groupItemsBySubcategoria", () => {
  const items: ItemTemplateDetail[] = [
    { id: "i1", subcategoria: "Pneus", nome: "Pneu traseiro esquerdo" },
    { id: "i2", subcategoria: "Pintura", nome: "Capo" },
    { id: "i3", subcategoria: "Pintura", nome: "Bagageira" },
    { id: "i4", subcategoria: null, nome: "Item sem subcategoria" },
  ];

  it("groups items by subcategoria, with items sorted by nome inside each group", () => {
    const result = groupItemsBySubcategoria(items, []);
    const pintura = result.find((g) => g.subcategoria === "Pintura");
    expect(pintura?.items.map((i) => i.nome)).toEqual(["Bagageira", "Capo"]);
  });

  it("puts items with null subcategoria in their own group", () => {
    const result = groupItemsBySubcategoria(items, []);
    const semSubcategoria = result.find((g) => g.subcategoria === null);
    expect(semSubcategoria?.items.map((i) => i.id)).toEqual(["i4"]);
  });

  it("defaults an item's respondido to false when it has no response row", () => {
    const result = groupItemsBySubcategoria([items[0]], []);
    expect(result[0].items[0].respondido).toBe(false);
  });

  it("uses the response's respondido when one exists", () => {
    const result = groupItemsBySubcategoria([items[0]], [{ item_template_id: "i1", respondido: true }]);
    expect(result[0].items[0].respondido).toBe(true);
  });
});

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

Run: `npm test -- lib/checklist/progress.test.ts`
Expected: FAIL — type errors / assertion mismatches against the current `status`-based implementation (e.g. `respondido` is `undefined`, not `true`/`false`).

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `lib/checklist/progress.ts`:

```ts
export type GroupTemplate = { id: string; ordem: number; nome: string };
export type ItemTemplate = { id: string; group_id: string };
export type ItemResponseRow = { item_template_id: string; respondido: boolean };
export type GroupProgress = { id: string; ordem: number; nome: string; pendentes: number; total: number };

export function isItemPending(respondido: boolean | undefined): boolean {
  return !respondido;
}

export function computeGroupProgress(
  groups: GroupTemplate[],
  items: ItemTemplate[],
  responses: ItemResponseRow[]
): GroupProgress[] {
  const respondidoByItemId = new Map(responses.map((r) => [r.item_template_id, r.respondido]));
  const itemsByGroupId = new Map<string, ItemTemplate[]>();
  for (const item of items) {
    const list = itemsByGroupId.get(item.group_id) ?? [];
    list.push(item);
    itemsByGroupId.set(item.group_id, list);
  }

  return groups
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((group) => {
      const groupItems = itemsByGroupId.get(group.id) ?? [];
      const pendentes = groupItems.filter((item) => isItemPending(respondidoByItemId.get(item.id))).length;
      return { id: group.id, ordem: group.ordem, nome: group.nome, pendentes, total: groupItems.length };
    });
}

export type ItemTemplateDetail = { id: string; subcategoria: string | null; nome: string };
export type ChecklistItemStatus = { id: string; nome: string; respondido: boolean };
export type SubcategoriaGroup = { subcategoria: string | null; items: ChecklistItemStatus[] };

export function groupItemsBySubcategoria(
  items: ItemTemplateDetail[],
  responses: ItemResponseRow[]
): SubcategoriaGroup[] {
  const respondidoByItemId = new Map(responses.map((r) => [r.item_template_id, r.respondido]));
  const sorted = items.slice().sort((a, b) => {
    const subA = a.subcategoria ?? "";
    const subB = b.subcategoria ?? "";
    if (subA !== subB) return subA.localeCompare(subB);
    return a.nome.localeCompare(b.nome);
  });

  const order: Array<string | null> = [];
  const bucket = new Map<string | null, ChecklistItemStatus[]>();
  for (const item of sorted) {
    const key = item.subcategoria;
    if (!bucket.has(key)) {
      bucket.set(key, []);
      order.push(key);
    }
    bucket.get(key)!.push({
      id: item.id,
      nome: item.nome,
      respondido: respondidoByItemId.get(item.id) ?? false,
    });
  }

  return order.map((subcategoria) => ({ subcategoria, items: bucket.get(subcategoria)! }));
}

export function findNextItemId(subcategorias: SubcategoriaGroup[], currentItemId: string): string | null {
  const flat = subcategorias.flatMap((bucket) => bucket.items);
  const index = flat.findIndex((item) => item.id === currentItemId);
  if (index === -1 || index === flat.length - 1) return null;
  return flat[index + 1].id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/checklist/progress.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/checklist/progress.ts lib/checklist/progress.test.ts
git commit -m "refactor: collapse checklist item status into respondido boolean"
```

---

### Task 2: `lib/checklist/siblings.ts` — `classificacao` → `opcao_id`/`opcao_label`, add `Opcao` type + `slugifyOpcaoLabel`

**Files:**
- Modify: `lib/checklist/siblings.ts`
- Test: `lib/checklist/siblings.test.ts`

**Interfaces:**
- Consumes: nothing (the `import type { ItemResponseStatus } from "./progress"` from Task 1 is removed — this file no longer needs it).
- Produces:
  - `Opcao = { id: string; label: string; exige_foto: boolean }` — new, shared by `batch-apply-panel.tsx` (Task 5) and `item-escolha-form.tsx` (Task 6).
  - `slugifyOpcaoLabel(label: string): string` — new, used by Tasks 5 and 6 to derive a CSS modifier class from an option's label (e.g. `"Ótimo"` → `"otimo"`, `"N.A."` → `"na"`).
  - `SiblingSourceItem` — unchanged.
  - `SiblingResponseRow = { item_template_id: string; opcao_id: string | null }` (was `{ item_template_id: string; status: ItemResponseStatus; classificacao: string | null }`).
  - `SiblingRow = { id: string; nome: string; opcao_id: string | null; opcao_label: string | null; defaultChecked: boolean }` (was `{ id, nome, status, classificacao, defaultChecked }`).
  - `deriveSiblingRows(currentItemId: string, items: SiblingSourceItem[], responses: SiblingResponseRow[], opcaoLabelById: Map<string, string>): SiblingRow[]` — gained a 4th parameter.
  - `BatchRowInput = { itemTemplateId: string; nome: string; opcao_id: string; observacao: string; photos: { id: string; url: string }[] }` (was `{ ...; classificacao: string; ... }`).
  - `buildBatchRows(current: BatchRowInput, siblings: SiblingRow[], selectedSiblingIds: Set<string>): BatchRowInput[]` — same signature shape, `classificacao` fields renamed to `opcao_id`.
  - `CLASSIFICACOES` constant is **removed** — no consumer may import it after this task.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `lib/checklist/siblings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  deriveSiblingRows,
  buildBatchRows,
  slugifyOpcaoLabel,
  type SiblingSourceItem,
  type SiblingRow,
  type SiblingResponseRow,
} from "./siblings";

describe("deriveSiblingRows", () => {
  const items: SiblingSourceItem[] = [
    { id: "item-1", nome: "Pneu dianteiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-2", nome: "Pneu dianteiro direito", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-3", nome: "Pneu traseiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-4", nome: "Vidro lateral esquerdo", grupo_replicacao: "vidros-lateral-dianteiro" },
    { id: "item-5", nome: "Marca", grupo_replicacao: null },
  ];
  const opcaoLabelById = new Map([
    ["opt-medio", "Médio"],
    ["opt-ruim", "Ruim"],
  ]);

  it("returns an empty list when the current item has no grupo_replicacao", () => {
    expect(deriveSiblingRows("item-5", items, [], opcaoLabelById)).toEqual([]);
  });

  it("returns only items sharing the same grupo_replicacao, excluding self", () => {
    const result = deriveSiblingRows("item-1", items, [], opcaoLabelById);
    expect(result.map((r) => r.id)).toEqual(["item-2", "item-3"]);
  });

  it("defaults checked=true for siblings with no opcao_id and false for already-answered ones", () => {
    const responses: SiblingResponseRow[] = [{ item_template_id: "item-2", opcao_id: "opt-medio" }];
    const result = deriveSiblingRows("item-1", items, responses, opcaoLabelById);

    const item2 = result.find((r) => r.id === "item-2")!;
    const item3 = result.find((r) => r.id === "item-3")!;
    expect(item2.defaultChecked).toBe(false);
    expect(item2.opcao_id).toBe("opt-medio");
    expect(item3.defaultChecked).toBe(true);
    expect(item3.opcao_id).toBeNull();
  });

  it("resolves the sibling's opcao label from the given map", () => {
    const responses: SiblingResponseRow[] = [{ item_template_id: "item-2", opcao_id: "opt-ruim" }];
    const result = deriveSiblingRows("item-1", items, responses, opcaoLabelById);

    const item2 = result.find((r) => r.id === "item-2")!;
    const item3 = result.find((r) => r.id === "item-3")!;
    expect(item2.opcao_label).toBe("Ruim");
    expect(item3.opcao_label).toBeNull();
  });

  it("returns an empty list when the current item id isn't found", () => {
    expect(deriveSiblingRows("does-not-exist", items, [], opcaoLabelById)).toEqual([]);
  });
});

describe("buildBatchRows", () => {
  const current = {
    itemTemplateId: "item-1",
    nome: "Pneu dianteiro esquerdo",
    opcao_id: "opt-ruim",
    observacao: "Desgaste irregular",
    photos: [{ id: "photo-1", url: "https://example.com/photo-1.jpg" }],
  };

  const siblings: SiblingRow[] = [
    { id: "item-2", nome: "Pneu dianteiro direito", opcao_id: null, opcao_label: null, defaultChecked: true },
    { id: "item-3", nome: "Pneu traseiro esquerdo", opcao_id: null, opcao_label: null, defaultChecked: true },
  ];

  it("never copies the current item's photos onto sibling rows, regardless of how many it has", () => {
    const selected = new Set(["item-2", "item-3"]);
    const result = buildBatchRows(current, siblings, selected);

    const siblingRows = result.filter((r) => r.itemTemplateId !== "item-1");
    expect(siblingRows).toHaveLength(2);
    for (const row of siblingRows) {
      expect(row.photos).toEqual([]);
    }
  });

  it("excludes unselected siblings", () => {
    const selected = new Set(["item-2"]);
    const result = buildBatchRows(current, siblings, selected);

    expect(result.map((r) => r.itemTemplateId)).toEqual(["item-1", "item-2"]);
  });

  it("keeps the current item's own row unchanged, including its real photos", () => {
    const result = buildBatchRows(current, siblings, new Set(["item-2"]));

    expect(result[0]).toEqual(current);
  });

  it("applies the current item's opcao_id and observacao to every selected sibling", () => {
    const result = buildBatchRows(current, siblings, new Set(["item-2", "item-3"]));

    const siblingRows = result.filter((r) => r.itemTemplateId !== "item-1");
    for (const row of siblingRows) {
      expect(row.opcao_id).toBe(current.opcao_id);
      expect(row.observacao).toBe(current.observacao);
    }
  });
});

describe("slugifyOpcaoLabel", () => {
  it("strips accents, lowercases, and removes non-alphanumeric characters", () => {
    expect(slugifyOpcaoLabel("Ótimo")).toBe("otimo");
    expect(slugifyOpcaoLabel("Médio")).toBe("medio");
    expect(slugifyOpcaoLabel("Ruim")).toBe("ruim");
    expect(slugifyOpcaoLabel("N.A.")).toBe("na");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/checklist/siblings.test.ts`
Expected: FAIL — `slugifyOpcaoLabel` not exported, `deriveSiblingRows`/`buildBatchRows` reject/mis-shape the new fixtures.

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `lib/checklist/siblings.ts`:

```ts
export type Opcao = { id: string; label: string; exige_foto: boolean };

export type SiblingSourceItem = { id: string; nome: string; grupo_replicacao: string | null };
export type SiblingResponseRow = { item_template_id: string; opcao_id: string | null };
export type SiblingRow = {
  id: string;
  nome: string;
  opcao_id: string | null;
  opcao_label: string | null;
  defaultChecked: boolean;
};

export function deriveSiblingRows(
  currentItemId: string,
  items: SiblingSourceItem[],
  responses: SiblingResponseRow[],
  opcaoLabelById: Map<string, string>
): SiblingRow[] {
  const current = items.find((i) => i.id === currentItemId);
  if (!current?.grupo_replicacao) return [];

  const responseByItemId = new Map(responses.map((r) => [r.item_template_id, r]));

  return items
    .filter((i) => i.id !== currentItemId && i.grupo_replicacao === current.grupo_replicacao)
    .map((i) => {
      const opcaoId = responseByItemId.get(i.id)?.opcao_id ?? null;
      return {
        id: i.id,
        nome: i.nome,
        opcao_id: opcaoId,
        opcao_label: opcaoId ? (opcaoLabelById.get(opcaoId) ?? null) : null,
        defaultChecked: opcaoId === null,
      };
    });
}

export type BatchRowInput = {
  itemTemplateId: string;
  nome: string;
  opcao_id: string;
  observacao: string;
  photos: { id: string; url: string }[];
};

export function buildBatchRows(
  current: BatchRowInput,
  siblings: SiblingRow[],
  selectedSiblingIds: Set<string>
): BatchRowInput[] {
  return [
    current,
    ...siblings
      .filter((s) => selectedSiblingIds.has(s.id))
      .map((s) => ({
        itemTemplateId: s.id,
        nome: s.nome,
        opcao_id: current.opcao_id,
        observacao: current.observacao,
        photos: [],
      })),
  ];
}

export function slugifyOpcaoLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/checklist/siblings.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/checklist/siblings.ts lib/checklist/siblings.test.ts
git commit -m "refactor: adapt sibling/batch types from classificacao to opcao_id"
```

---

### Task 3: `actions.ts` — `saveEscolhaAction`, `saveMeasurementAction`, `applyOpcoesBatchAction`

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–2 (this file has no imports from `lib/checklist/`).
- Produces:
  - `SaveEscolhaState = { status: "idle" } | { status: "error"; message: string }` (renamed from `SaveClassificacaoState`).
  - `saveEscolhaAction(prevState: SaveEscolhaState, formData: FormData): Promise<SaveEscolhaState>` (renamed from `saveClassificacaoAction`; reads `formData.get("opcao_id")` instead of `"classificacao"`) — consumed by Task 6 (`item-escolha-form.tsx`).
  - `saveMeasurementAction` — same name/signature, now calls RPC `save_medicao` with `p_valores` instead of `save_paint_measurement`/`p_valores_um` — consumed by Task 7 (`item-medicao-form.tsx`, unchanged import).
  - `BatchItem = { itemTemplateId: string; opcaoId: string; observacao: string | null }` (was `{ ...; classificacao: string; ... }`).
  - `applyOpcoesBatchAction(inspectionId: string, items: BatchItem[]): Promise<{ error?: string }>` (renamed from `applyClassificacaoBatchAction`) — consumed by Task 5 (`batch-apply-panel.tsx`).
  - `attachPhotoAction`, `deletePhotoAction` — unchanged.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertQuery = { select: vi.fn(() => upsertQuery), single: vi.fn() };
const upsert = vi.fn(() => upsertQuery);

const insertQuery = { select: vi.fn(() => insertQuery), single: vi.fn() };
const insert = vi.fn(() => insertQuery);

const deleteQuery = { eq: vi.fn() };
const del = vi.fn(() => deleteQuery);

const templateQuery: { eq: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn> } = {
  eq: vi.fn(() => templateQuery),
  single: vi.fn(),
  in: vi.fn(),
};
const templateSelect = vi.fn(() => templateQuery);

const opcoesQuery: { eq: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn> } = {
  eq: vi.fn(() => opcoesQuery),
  maybeSingle: vi.fn(),
  in: vi.fn(),
};
const opcoesSelect = vi.fn(() => opcoesQuery);

const rpc = vi.fn();

const from = vi.fn((table: string) => {
  if (table === "checklist_item_templates") return { select: templateSelect };
  if (table === "opcoes") return { select: opcoesSelect };
  return { upsert, insert, delete: del };
});
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
  templateSelect.mockClear();
  templateQuery.eq.mockClear();
  templateQuery.single.mockReset();
  templateQuery.in.mockReset();
  opcoesSelect.mockClear();
  opcoesQuery.eq.mockClear();
  opcoesQuery.maybeSingle.mockReset();
  opcoesQuery.in.mockReset();
  rpc.mockReset();
  redirect.mockClear();
});

describe("saveEscolhaAction", () => {
  it("returns a validation error without writing when opcao_id is missing", async () => {
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns an error without writing when the opcao does not belong to the item's conjunto", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("opcao_id", "opt-de-outro-conjunto");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the response and redirects to nextUrl on success", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: { id: "opt-medio" }, error: null });
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");
    formData.set("opcao_id", "opt-medio");
    formData.set("observacao", "Desgaste leve");

    await expect(saveEscolhaAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1/item-2"
    );

    expect(upsert).toHaveBeenCalledWith(
      { inspection_id: "insp-1", item_template_id: "item-1", opcao_id: "opt-medio", observacao: "Desgaste leve" },
      { onConflict: "inspection_id,item_template_id" }
    );
  });

  it("returns a friendly message when the DB rejects a response that exige foto without a photo (check_violation)", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: { id: "opt-ruim" }, error: null });
    upsertQuery.single.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("opcao_id", "opt-ruim");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

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
    rpc.mockResolvedValue({ data: [{ item_response_id: "resp-1", resultado: "ok" }], error: null });
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");
    formData.append("valor", "100");
    formData.append("valor", "110");
    formData.append("valor", "120");
    formData.set("observacao", "Desgaste leve");

    await expect(saveMeasurementAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1/item-2"
    );

    expect(rpc).toHaveBeenCalledWith("save_medicao", {
      p_inspection_id: "insp-1",
      p_item_template_id: "item-1",
      p_valores: [100, 110, 120],
      p_observacao: "Desgaste leve",
    });
  });

  it("returns a friendly message when the DB rejects a critical measurement without a photo", async () => {
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

describe("applyOpcoesBatchAction", () => {
  it("returns an error without calling the RPC when an item has no opcao_id", async () => {
    const { applyOpcoesBatchAction } = await import("./actions");

    const result = await applyOpcoesBatchAction("insp-1", [
      { itemTemplateId: "item-1", opcaoId: "opt-otimo", observacao: null },
      { itemTemplateId: "item-2", opcaoId: "", observacao: null },
    ]);

    expect(result.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an error without calling the RPC when an opcao doesn't belong to its item's conjunto", async () => {
    templateQuery.in.mockResolvedValue({
      data: [
        { id: "item-1", conjunto_opcao_id: "conj-1" },
        { id: "item-2", conjunto_opcao_id: "conj-1" },
      ],
      error: null,
    });
    opcoesQuery.in.mockResolvedValue({
      data: [
        { id: "opt-otimo", conjunto_id: "conj-1" },
        { id: "opt-de-outro-conjunto", conjunto_id: "conj-2" },
      ],
      error: null,
    });
    const { applyOpcoesBatchAction } = await import("./actions");

    const result = await applyOpcoesBatchAction("insp-1", [
      { itemTemplateId: "item-1", opcaoId: "opt-otimo", observacao: null },
      { itemTemplateId: "item-2", opcaoId: "opt-de-outro-conjunto", observacao: null },
    ]);

    expect(result.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with the mapped batch payload on success", async () => {
    templateQuery.in.mockResolvedValue({
      data: [
        { id: "item-1", conjunto_opcao_id: "conj-1" },
        { id: "item-2", conjunto_opcao_id: "conj-1" },
      ],
      error: null,
    });
    opcoesQuery.in.mockResolvedValue({
      data: [
        { id: "opt-otimo", conjunto_id: "conj-1" },
        { id: "opt-medio", conjunto_id: "conj-1" },
      ],
      error: null,
    });
    rpc.mockResolvedValue({ data: null, error: null });
    const { applyOpcoesBatchAction } = await import("./actions");

    const result = await applyOpcoesBatchAction("insp-1", [
      { itemTemplateId: "item-1", opcaoId: "opt-otimo", observacao: "Sem avarias" },
      { itemTemplateId: "item-2", opcaoId: "opt-medio", observacao: null },
    ]);

    expect(result).toEqual({});
    expect(rpc).toHaveBeenCalledWith("apply_opcoes_batch", {
      p_inspection_id: "insp-1",
      p_items: [
        { item_template_id: "item-1", opcao_id: "opt-otimo", observacao: "Sem avarias" },
        { item_template_id: "item-2", opcao_id: "opt-medio", observacao: null },
      ],
    });
  });

  it("returns a friendly message when the DB rejects an item that exige foto without a photo", async () => {
    templateQuery.in.mockResolvedValue({ data: [{ id: "item-1", conjunto_opcao_id: "conj-1" }], error: null });
    opcoesQuery.in.mockResolvedValue({ data: [{ id: "opt-ruim", conjunto_id: "conj-1" }], error: null });
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { applyOpcoesBatchAction } = await import("./actions");

    const result = await applyOpcoesBatchAction("insp-1", [
      { itemTemplateId: "item-1", opcaoId: "opt-ruim", observacao: null },
    ]);

    expect(result.error).toMatch(/foto/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"`
Expected: FAIL — `saveEscolhaAction`/`applyOpcoesBatchAction` not exported yet, RPC name assertions mismatch.

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SaveEscolhaState = { status: "idle" } | { status: "error"; message: string };
export type SaveMeasurementState = { status: "idle" } | { status: "error"; message: string };

function friendlyDbError(error: { code?: string; message?: string }, exigeFotoMessage: string): string {
  if (error.code === "23514") return exigeFotoMessage;
  return "Não foi possível guardar. Tente novamente.";
}

export async function saveEscolhaAction(
  _prevState: SaveEscolhaState,
  formData: FormData
): Promise<SaveEscolhaState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const nextUrl = formData.get("nextUrl") as string;
  const opcaoId = formData.get("opcao_id") as string;
  const observacao = (formData.get("observacao") as string) || null;

  if (!opcaoId) {
    return { status: "error", message: "Selecione uma opção." };
  }

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("checklist_item_templates")
    .select("conjunto_opcao_id")
    .eq("id", itemTemplateId)
    .single();

  const { data: opcao } = await supabase
    .from("opcoes")
    .select("id")
    .eq("id", opcaoId)
    .eq("conjunto_id", item?.conjunto_opcao_id ?? "")
    .maybeSingle();

  if (!opcao) {
    return { status: "error", message: "Opção inválida para este item." };
  }

  const { error } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId, opcao_id: opcaoId, observacao },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("saveEscolhaAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Esta resposta exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
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
  const observacao = (formData.get("observacao") as string) || null;

  if (valores.length === 0 || valores.some((v) => Number.isNaN(v))) {
    return { status: "error", message: "Preencha todos os valores de medição com números válidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_medicao", {
    p_inspection_id: inspectionId,
    p_item_template_id: itemTemplateId,
    p_valores: valores,
    p_observacao: observacao,
  });

  if (error) {
    console.error("saveMeasurementAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Este resultado exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
    };
  }

  redirect(nextUrl);
}

export type BatchItem = { itemTemplateId: string; opcaoId: string; observacao: string | null };

export async function applyOpcoesBatchAction(
  inspectionId: string,
  items: BatchItem[]
): Promise<{ error?: string }> {
  if (items.some((i) => !i.opcaoId)) {
    return { error: "Selecione uma opção em todos os itens do lote." };
  }

  const supabase = await createClient();

  const [{ data: templates }, { data: opcoes }] = await Promise.all([
    supabase
      .from("checklist_item_templates")
      .select("id, conjunto_opcao_id")
      .in("id", items.map((i) => i.itemTemplateId)),
    supabase
      .from("opcoes")
      .select("id, conjunto_id")
      .in("id", items.map((i) => i.opcaoId)),
  ]);

  const conjuntoByTemplateId = new Map((templates ?? []).map((t) => [t.id, t.conjunto_opcao_id]));
  const conjuntoByOpcaoId = new Map((opcoes ?? []).map((o) => [o.id, o.conjunto_id]));

  const hasInvalidItem = items.some(
    (i) => conjuntoByOpcaoId.get(i.opcaoId) !== conjuntoByTemplateId.get(i.itemTemplateId)
  );
  if (hasInvalidItem) {
    return { error: "Opção inválida em um dos itens do lote." };
  }

  const { error } = await supabase.rpc("apply_opcoes_batch", {
    p_inspection_id: inspectionId,
    p_items: items.map((i) => ({
      item_template_id: i.itemTemplateId,
      opcao_id: i.opcaoId,
      observacao: i.observacao,
    })),
  });

  if (error) {
    console.error("applyOpcoesBatchAction failed", error);
    return {
      error: friendlyDbError(
        error,
        "Um dos itens do lote exige pelo menos 1 foto anexada. Anexe a foto e confirme de novo."
      ),
    };
  }

  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
git commit -m "refactor: adapt Server Actions to opcao_id/save_medicao/apply_opcoes_batch"
```

---

### Task 4: `app/globals.css` — rename `classificacao-*` classes to `escolha-*`

**Files:**
- Modify: `app/globals.css:567-615`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS classes `.escolha-options`, `.escolha-option`, `.escolha-option--otimo`, `.escolha-option--medio`, `.escolha-option--ruim`, `.escolha-option--na` — consumed by Task 5 (`batch-apply-panel.tsx`) and Task 6 (`item-escolha-form.tsx`) via `slugifyOpcaoLabel` (Task 2), which produces exactly these 4 suffixes for the current seed's only conjunto (`Ótimo`→`otimo`, `Médio`→`medio`, `Ruim`→`ruim`, `N.A.`→`na`).

No test — pure CSS rename, visually identical (verified in Task 8/9's browser check).

- [ ] **Step 1: Rename the classes**

In `app/globals.css`, replace lines 567–615:

```css
/* Classificação — segmented toggle reusing the status color system, native radios stay in the DOM */

.classificacao-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.classificacao-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-4);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
  transition: background-color 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out;
}

.classificacao-option input {
  accent-color: currentColor;
}

.classificacao-option--otimo:has(input:checked) {
  background: var(--color-green-100);
  border-color: var(--color-green-500);
  color: var(--color-green-800);
}

.classificacao-option--medio:has(input:checked) {
  background: var(--color-amber-100);
  border-color: var(--color-amber-500);
  color: var(--color-amber-600);
}

.classificacao-option--ruim:has(input:checked) {
  background: var(--color-red-100);
  border-color: var(--color-red-500);
  color: var(--color-red-600);
}

.classificacao-option--nf:has(input:checked) {
  background: var(--color-border);
  border-color: var(--color-ink-muted);
  color: var(--color-ink);
}
```

with:

```css
/* Escolha — segmented toggle reusing the status color system, native radios stay in the DOM */

.escolha-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.escolha-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-4);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
  transition: background-color 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out;
}

.escolha-option input {
  accent-color: currentColor;
}

.escolha-option--otimo:has(input:checked) {
  background: var(--color-green-100);
  border-color: var(--color-green-500);
  color: var(--color-green-800);
}

.escolha-option--medio:has(input:checked) {
  background: var(--color-amber-100);
  border-color: var(--color-amber-500);
  color: var(--color-amber-600);
}

.escolha-option--ruim:has(input:checked) {
  background: var(--color-red-100);
  border-color: var(--color-red-500);
  color: var(--color-red-600);
}

.escolha-option--na:has(input:checked) {
  background: var(--color-border);
  border-color: var(--color-ink-muted);
  color: var(--color-ink);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "refactor: rename classificacao CSS classes to escolha"
```

---

### Task 5: `batch-apply-panel.tsx` — `opcao_id` + `exige_foto`-based photo check

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.tsx`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx`

**Interfaces:**
- Consumes: `applyOpcoesBatchAction` (Task 3), `Opcao`/`slugifyOpcaoLabel` (Task 2), CSS classes `.escolha-*` (Task 4).
- Produces: `BatchRow = { itemTemplateId: string; nome: string; opcao_id: string; observacao: string; photos: Photo[] }` (was `{ ...; classificacao: string; ... }`), `BatchApplyPanel` component now takes a required `opcoes: Opcao[]` prop — consumed by Task 6 (`item-escolha-form.tsx`).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BatchApplyPanel } from "./batch-apply-panel";

const applyOpcoesBatchAction = vi.fn();
vi.mock("./actions", () => ({
  applyOpcoesBatchAction: (...args: unknown[]) => applyOpcoesBatchAction(...args),
  attachPhotoAction: vi.fn(),
  deletePhotoAction: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) } }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  applyOpcoesBatchAction.mockReset();
  push.mockClear();
});

const opcoes = [
  { id: "opt-otimo", label: "Ótimo", exige_foto: false },
  { id: "opt-medio", label: "Médio", exige_foto: false },
  { id: "opt-ruim", label: "Ruim", exige_foto: true },
  { id: "opt-na", label: "N.A.", exige_foto: false },
];

const rowA = { itemTemplateId: "item-1", nome: "Pneu A", opcao_id: "opt-otimo", observacao: "Sem avarias", photos: [] };
const rowB = { itemTemplateId: "item-2", nome: "Pneu B", opcao_id: "opt-otimo", observacao: "Sem avarias", photos: [] };

describe("BatchApplyPanel", () => {
  it("renders one fieldset per row, pre-filled", () => {
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA, rowB]} onCancel={() => {}} />
    );

    expect(screen.getByText("Pneu A")).toBeInTheDocument();
    expect(screen.getByText("Pneu B")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Sem avarias")).toHaveLength(2);
  });

  it("blocks confirmation and names the row when a row whose opcao exige_foto has no photo, without calling the action", () => {
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getAllByLabelText("Ruim")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Pneu A/);
    expect(applyOpcoesBatchAction).not.toHaveBeenCalled();
  });

  it("submits the batch and navigates to groupListUrl on success", async () => {
    applyOpcoesBatchAction.mockResolvedValue({});

    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA, rowB]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() =>
      expect(applyOpcoesBatchAction).toHaveBeenCalledWith("insp-1", [
        { itemTemplateId: "item-1", opcaoId: "opt-otimo", observacao: "Sem avarias" },
        { itemTemplateId: "item-2", opcaoId: "opt-otimo", observacao: "Sem avarias" },
      ])
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/x"));
  });

  it("shows the action's error message and does not navigate on failure", async () => {
    applyOpcoesBatchAction.mockResolvedValue({ error: "Não foi possível guardar." });

    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível guardar."));
    expect(push).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const onCancel = vi.fn();
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA]} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"`
Expected: FAIL — `BatchApplyPanel` doesn't accept an `opcoes` prop yet, still renders 4 hardcoded `CLASSIFICACOES` radios instead.

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyOpcoesBatchAction } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";
import { slugifyOpcaoLabel, type Opcao } from "@/lib/checklist/siblings";

export type BatchRow = {
  itemTemplateId: string;
  nome: string;
  opcao_id: string;
  observacao: string;
  photos: Photo[];
};

export function BatchApplyPanel({
  inspectionId,
  groupListUrl,
  opcoes,
  initialRows,
  onCancel,
}: {
  inspectionId: string;
  groupListUrl: string;
  opcoes: Opcao[];
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

    const exigeFotoByOpcaoId = new Map(opcoes.map((o) => [o.id, o.exige_foto]));
    const missingFoto = rows.filter((r) => exigeFotoByOpcaoId.get(r.opcao_id) && r.photos.length === 0);
    if (missingFoto.length > 0) {
      setError(`Anexe pelo menos 1 foto antes de confirmar: ${missingFoto.map((r) => r.nome).join(", ")}.`);
      return;
    }

    startTransition(async () => {
      const result = await applyOpcoesBatchAction(
        inspectionId,
        rows.map((r) => ({
          itemTemplateId: r.itemTemplateId,
          opcaoId: r.opcao_id,
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
    <div className="stack">
      <h2>Aplicar aos selecionados</h2>
      {rows.map((row) => (
        <fieldset key={row.itemTemplateId} className="panel form-fieldset">
          <legend className="form-fieldset__legend">{row.nome}</legend>

          <div className="escolha-options">
            {opcoes.map((o) => (
              <label
                key={o.id}
                className={`escolha-option escolha-option--${slugifyOpcaoLabel(o.label)}`}
              >
                <input
                  type="radio"
                  name={`opcao-${row.itemTemplateId}`}
                  value={o.id}
                  checked={row.opcao_id === o.id}
                  onChange={() => updateRow(row.itemTemplateId, { opcao_id: o.id })}
                />
                {o.label}
              </label>
            ))}
          </div>

          <div className="field">
            <label htmlFor={`observacao-${row.itemTemplateId}`} className="label">
              Observação
            </label>
            <textarea
              id={`observacao-${row.itemTemplateId}`}
              className="input"
              rows={3}
              value={row.observacao}
              onChange={(e) => updateRow(row.itemTemplateId, { observacao: e.target.value })}
            />
          </div>

          <PhotoManager
            inspectionId={inspectionId}
            itemTemplateId={row.itemTemplateId}
            initialPhotos={row.photos}
            onPhotosChange={(photos) => updateRow(row.itemTemplateId, { photos })}
          />
        </fieldset>
      ))}

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      <div className="batch-actions">
        <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={isPending}>
          Confirmar aplicação
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isPending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"
git commit -m "refactor: adapt BatchApplyPanel to opcao_id and per-option exige_foto"
```

---

### Task 6: `item-escolha-form.tsx` (rename from `item-classificacao-form.tsx`)

**Files:**
- Rename: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx` → `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-escolha-form.tsx`
- No test file exists for this component today (confirmed: no `item-classificacao-form.test.*` in the repo) — none created here, consistent with existing coverage.

**Interfaces:**
- Consumes: `saveEscolhaAction`/`SaveEscolhaState` (Task 3), `BatchApplyPanel`/`BatchRow` (Task 5), `buildBatchRows`/`slugifyOpcaoLabel`/`Opcao`/`SiblingRow` (Task 2), CSS classes `.escolha-*` (Task 4).
- Produces: `ItemEscolhaForm` component (renamed from `ItemClassificacaoForm`) — consumed by Task 8 (`page.tsx`). New required prop `opcoes: Opcao[]`; `initialClassificacao` renamed to `initialOpcaoId`.

- [ ] **Step 1: Rename the file**

```bash
git mv "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-escolha-form.tsx"
```

- [ ] **Step 2: Rewrite the contents**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-escolha-form.tsx`:

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-escolha-form.tsx
"use client";

import { useActionState, useState } from "react";
import { saveEscolhaAction, type SaveEscolhaState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";
import { BatchApplyPanel, type BatchRow } from "./batch-apply-panel";
import { buildBatchRows, slugifyOpcaoLabel, type Opcao, type SiblingRow } from "@/lib/checklist/siblings";

const initialState: SaveEscolhaState = { status: "idle" };

export function ItemEscolhaForm({
  inspectionId,
  itemTemplateId,
  nome,
  nextUrl,
  groupListUrl,
  opcoes,
  initialOpcaoId,
  initialObservacao,
  initialPhotos,
  siblings,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nome: string;
  nextUrl: string;
  groupListUrl: string;
  opcoes: Opcao[];
  initialOpcaoId: string | null;
  initialObservacao: string | null;
  initialPhotos: Photo[];
  siblings: SiblingRow[];
}) {
  const [state, formAction] = useActionState(saveEscolhaAction, initialState);
  const [opcaoId, setOpcaoId] = useState(initialOpcaoId ?? "");
  const [observacao, setObservacao] = useState(initialObservacao ?? "");
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedSiblings, setSelectedSiblings] = useState<Set<string>>(
    new Set(siblings.filter((s) => s.defaultChecked).map((s) => s.id))
  );
  const [showBatchPanel, setShowBatchPanel] = useState(false);

  function toggleSibling(id: string) {
    setSelectedSiblings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (showBatchPanel) {
    const initialRows: BatchRow[] = buildBatchRows(
      { itemTemplateId, nome, opcao_id: opcaoId, observacao, photos },
      siblings,
      selectedSiblings
    );

    return (
      <BatchApplyPanel
        inspectionId={inspectionId}
        groupListUrl={groupListUrl}
        opcoes={opcoes}
        initialRows={initialRows}
        onCancel={() => setShowBatchPanel(false)}
      />
    );
  }

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />
      <input type="hidden" name="nextUrl" value={nextUrl} />

      <fieldset className="panel form-fieldset">
        <legend className="form-fieldset__legend">Classificação</legend>
        <div className="escolha-options">
          {opcoes.map((o) => (
            <label key={o.id} className={`escolha-option escolha-option--${slugifyOpcaoLabel(o.label)}`}>
              <input
                type="radio"
                name="opcao_id"
                value={o.id}
                checked={opcaoId === o.id}
                onChange={() => setOpcaoId(o.id)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="observacao" className="label">
          Observação
        </label>
        <textarea
          id="observacao"
          name="observacao"
          className="input"
          rows={3}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />
      </div>

      <PhotoManager
        inspectionId={inspectionId}
        itemTemplateId={itemTemplateId}
        initialPhotos={initialPhotos}
        onPhotosChange={setPhotos}
      />

      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}

      <button type="submit" className="btn btn-primary">
        Salvar e próximo
      </button>

      {siblings.length > 0 && (
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Este item se repete em</legend>
          <div className="stack sibling-list">
            {siblings.map((s) => (
              <label key={s.id} className="sibling-list__row">
                <input type="checkbox" checked={selectedSiblings.has(s.id)} onChange={() => toggleSibling(s.id)} />
                <span>
                  {s.nome}
                  {s.opcao_label && <span className="hint"> (já respondido: {s.opcao_label})</span>}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!opcaoId || selectedSiblings.size === 0}
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

- [ ] **Step 3: Run the full suite to make sure nothing else references the old file/export names**

Run: `npm test`
Expected: only failures remaining are in `page.tsx` (not yet migrated — Task 8) if it still imports `ItemClassificacaoForm`. No failures related to `item-escolha-form.tsx` itself.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-escolha-form.tsx"
git commit -m "refactor: rename ItemClassificacaoForm to ItemEscolhaForm, adapt to opcoes"
```

---

### Task 7: `item-medicao-form.tsx` — dynamic unit label

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx`

**Interfaces:**
- Consumes: `saveMeasurementAction`/`SaveMeasurementState` (Task 3, unchanged names).
- Produces: `ItemMedicaoForm` component gains a required prop `unidadeMedicao: string | null` — consumed by Task 8 (`page.tsx`).

No test file exists for this component today — none created here.

- [ ] **Step 1: Rewrite the implementation**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx`:

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
  unidadeMedicao,
  initialValores,
  initialObservacao,
  initialPhotos,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nextUrl: string;
  qtdPontos: number;
  unidadeMedicao: string | null;
  initialValores: number[];
  initialObservacao: string | null;
  initialPhotos: Photo[];
}) {
  const [state, formAction] = useActionState(saveMeasurementAction, initialState);
  const pontos = Array.from({ length: qtdPontos }, (_, i) => i);
  const legend = unidadeMedicao ? `Medição (${unidadeMedicao})` : "Medição";

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />
      <input type="hidden" name="nextUrl" value={nextUrl} />

      <fieldset className="panel form-fieldset">
        <legend className="form-fieldset__legend">{legend}</legend>
        <div className="form-grid">
          {pontos.map((i) => (
            <div key={i} className="field">
              <label htmlFor={`valor-${i}`} className="label">
                Ponto {i + 1}
              </label>
              <input
                id={`valor-${i}`}
                name="valor"
                type="number"
                step="0.01"
                className="input"
                defaultValue={initialValores[i] ?? ""}
                required
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="observacao" className="label">
          Observação
        </label>
        <textarea id="observacao" name="observacao" className="input" rows={3} defaultValue={initialObservacao ?? ""} />
      </div>

      <PhotoManager inspectionId={inspectionId} itemTemplateId={itemTemplateId} initialPhotos={initialPhotos} />

      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}

      <button type="submit" className="btn btn-primary">
        Salvar e próximo
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx"
git commit -m "refactor: show dynamic measurement unit in ItemMedicaoForm"
```

---

### Task 8: `page.tsx` (item) — wire the new schema end to end

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx`

**Interfaces:**
- Consumes: `ItemEscolhaForm` (Task 6), `ItemMedicaoForm` (Task 7), `deriveSiblingRows` (Task 2), `groupItemsBySubcategoria`/`findNextItemId` (Task 1).
- Produces: nothing consumed by later tasks (leaf page).

No test file exists for this page today — none created here.

- [ ] **Step 1: Rewrite the implementation**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx`:

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria, findNextItemId } from "@/lib/checklist/progress";
import { deriveSiblingRows } from "@/lib/checklist/siblings";
import { ItemEscolhaForm } from "./item-escolha-form";
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
    .select("id, nome, tipo, qtd_pontos_medicao, observacoes, conjunto_opcao_id, unidade_medicao")
    .eq("id", itemId)
    .eq("group_id", groupId)
    .single();

  if (!item) notFound();

  const [{ data: response }, { data: groupItems, error: groupItemsError }, { data: groupResponses }, { data: opcoes }] =
    await Promise.all([
      supabase
        .from("checklist_item_responses")
        .select("id, opcao_id, observacao")
        .eq("inspection_id", id)
        .eq("item_template_id", itemId)
        .maybeSingle(),
      supabase
        .from("checklist_item_templates")
        .select("id, subcategoria, nome, grupo_replicacao")
        .eq("group_id", groupId),
      supabase.from("checklist_item_responses").select("item_template_id, opcao_id").eq("inspection_id", id),
      item.tipo === "escolha" && item.conjunto_opcao_id
        ? supabase
            .from("opcoes")
            .select("id, label, ordem, exige_foto")
            .eq("conjunto_id", item.conjunto_opcao_id)
            .order("ordem")
        : Promise.resolve({ data: [] as { id: string; label: string; ordem: number; exige_foto: boolean }[] }),
    ]);

  if (groupItemsError) {
    console.error("checklist item page group fetch failed", groupItemsError);
  }

  let photos: { id: string; url: string }[] = [];
  let valores: number[] = [];

  if (response) {
    const [{ data: photoRows }, { data: measurement }] = await Promise.all([
      supabase.from("photos").select("id, url").eq("item_response_id", response.id).eq("contexto", "item"),
      item.tipo === "medicao"
        ? supabase.from("medicoes").select("valores").eq("item_response_id", response.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    photos = photoRows ?? [];
    valores = measurement?.valores ?? [];
  }

  const subcategorias = groupItemsBySubcategoria(groupItems ?? [], []);
  const nextItemId = findNextItemId(subcategorias, itemId);
  const groupListUrl = `/inspections/${id}/checklist/${groupId}`;
  const nextUrl = nextItemId ? `/inspections/${id}/checklist/${groupId}/${nextItemId}` : groupListUrl;

  const opcaoLabelById = new Map((opcoes ?? []).map((o) => [o.id, o.label]));
  const siblings = deriveSiblingRows(itemId, groupItems ?? [], groupResponses ?? [], opcaoLabelById);

  return (
    <div className="stack">
      <h1>{item.nome}</h1>
      {item.observacoes && <p className="hint">{item.observacoes}</p>}
      {item.tipo === "medicao" ? (
        <ItemMedicaoForm
          inspectionId={id}
          itemTemplateId={itemId}
          nextUrl={nextUrl}
          qtdPontos={item.qtd_pontos_medicao as number}
          unidadeMedicao={item.unidade_medicao}
          initialValores={valores}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
        />
      ) : (
        <ItemEscolhaForm
          inspectionId={id}
          itemTemplateId={itemId}
          nome={item.nome}
          nextUrl={nextUrl}
          groupListUrl={groupListUrl}
          opcoes={opcoes ?? []}
          initialOpcaoId={response?.opcao_id ?? null}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
          siblings={siblings}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS, no remaining references to `classificacao`/`paint_measurements`/`ItemClassificacaoForm` anywhere in the tree. Then run `npx tsc --noEmit` and confirm it's clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx"
git commit -m "feat: wire checklist item page to generic response-type schema"
```

---

### Task 9: `page.tsx` (group) and `layout.tsx` (nav) — swap `status` for `checklist_item_status` view

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`
- Modify: `app/(app)/inspections/[id]/checklist/layout.tsx`
- Modify: `app/globals.css` (drop the now-dead `.item-list__status--nf` rule)
- Existing test: `app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts` (only asserts `notFound()`/`.eq("ativo", true)` — unaffected, must stay green)

**Interfaces:**
- Consumes: `groupItemsBySubcategoria` (Task 1, used by group `page.tsx`), `computeGroupProgress` (Task 1, used by `layout.tsx`).
- Produces: nothing consumed by later tasks (leaf pages — this is the last task).

- [ ] **Step 1: Update the group page query and badge**

In `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`, replace the full file contents:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria } from "@/lib/checklist/progress";

export default async function ChecklistGroupPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id, groupId } = await params;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("checklist_group_templates")
    .select("id, nome")
    .eq("id", groupId)
    .eq("ativo", true)
    .single();

  if (!group) notFound();

  const [{ data: items, error: itemsError }, { data: responses, error: responsesError }] = await Promise.all([
    supabase.from("checklist_item_templates").select("id, subcategoria, nome").eq("group_id", groupId),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
  ]);

  if (itemsError || responsesError) {
    console.error("checklist group data fetch failed", { itemsError, responsesError });
  }

  const subcategorias = groupItemsBySubcategoria(items ?? [], responses ?? []);

  return (
    <div className="stack">
      <h1>{group.nome}</h1>
      {subcategorias.map((bucket) => (
        <section key={bucket.subcategoria ?? "sem-subcategoria"}>
          {bucket.subcategoria && <h2>{bucket.subcategoria}</h2>}
          <ul className="item-list">
            {bucket.items.map((item) => (
              <li key={item.id}>
                <Link href={`/inspections/${id}/checklist/${groupId}/${item.id}`} className="item-list__row">
                  <span
                    className={`item-list__status item-list__status--${item.respondido ? "feito" : "pendente"}`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{item.respondido ? "Preenchido" : "Pendente"}: </span>
                  {item.nome}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update the nav layout query**

In `app/(app)/inspections/[id]/checklist/layout.tsx:28`, replace:

```tsx
    supabase.from("checklist_item_responses").select("item_template_id, status").eq("inspection_id", id),
```

with:

```tsx
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
```

The rest of `layout.tsx` is unchanged — `computeGroupProgress` (Task 1) already accepts `{ item_template_id, respondido }` rows.

- [ ] **Step 3: Drop the dead CSS rule**

In `app/globals.css`, remove the `.item-list__status--nf` rule (immediately after `.item-list__status--pendente`):

```css
.item-list__status--nf {
  background: var(--color-ink-muted);
}
```

(Copy the exact current declaration body when editing — this step only deletes the rule, keep `.item-list__status`, `.item-list__status--feito`, and `.item-list__status--pendente` untouched.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. Then run `npx tsc --noEmit` and confirm it's clean — this is the final task, so the whole tree must be green now.

- [ ] **Step 5: Manual browser verification**

Using the técnico test account (`teste1@checkauto.pt`, per `docs/ROADMAP.md`), against the worktree's local DB:
1. Open a group with an `escolha` item (e.g. "Identificação") — confirm the group list badge shows pendente/feito correctly (2 states, no visual regression from before).
2. Open an item, select an option, save — confirm redirect to next item and the option persists on revisit.
3. Open an item that is part of a `grupo_replicacao` cluster (e.g. a tire item) — confirm siblings list shows correct labels for already-answered siblings, and "Aplicar aos selecionados" batch flow still works (including the exige-foto block for "Ruim").
4. Open a `medicao` item (paint thickness) — confirm the legend shows "Medição (µm)", save works, and RF-16 (foto obrigatória for a critical result) still triggers.
5. Confirm selecting "N.A." no longer shows a confirm() dialog.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/page.tsx" "app/(app)/inspections/[id]/checklist/layout.tsx" app/globals.css
git commit -m "refactor: read checklist_item_status view instead of removed status column"
```

---

## Self-Review Notes

- **Spec coverage:** §2 renamings → Tasks 3/5/6/2. §3 page queries → Tasks 8/9. §4 Server Actions/RPCs → Task 3. §5 components → Tasks 5/6/7. §6 shared types → Tasks 1/2. §7 tests → each task's own Step 1/2. §8 branch → stated in Global Constraints. All covered.
- **Placeholder scan:** none found — every step has runnable code or an exact command.
- **Type consistency:** `opcao_id` (snake_case) used consistently across `siblings.ts`, `actions.ts` form field, `page.tsx` query/prop, `item-escolha-form.tsx`; `opcaoId` (camelCase) used consistently only for the `BatchItem`/component-local state naming, matching the pre-existing `itemTemplateId`/`inspectionId` convention. `Opcao` type defined once in `siblings.ts` (Task 2) and imported everywhere else (Tasks 5, 6) — no duplicate definitions.
