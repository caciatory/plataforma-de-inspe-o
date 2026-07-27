# Redesign visual: tabela densa por subseção (Peça 3, recorte 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat item list at `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx` with a dense, editable-inline table per subcategoria (sidebar with nested group→subcategoria navigation, segmented control for `escolha`, inline `<input>` for `texto`/`data`, a `<dialog>`-based measurement flow for `medicao`, and a `<dialog>`-based "aplicar aos demais" flow reusing the existing `BatchApplyPanel`), on top of the real 359-item/13-group checklist content already seeded (Peça 2). Design doc: `docs/superpowers/specs/2026-07-27-redesign-tabela-subseccao-design.md`.

**Architecture:** Bottom-up: the pure aggregation function first (`lib/checklist/progress.ts`), then the sidebar nav that consumes it (`layout.tsx`), then the two new Server Actions the table will call for `texto`/`data` items (`actions.ts` — `saveTextoAction`/`saveDataAction`, a real gap: today those types fall through to `ItemEscolhaForm` with an empty `opcoes` array), then the CSS the table and its dialogs render with (`globals.css`, added in two passes — a small nav-nesting pass alongside Task 2, since Task 2 needs those classes immediately and CSS has no compile-time dependency ordering to violate, and the larger table/dialog pass as its own Task 4), then the leaf client component that ties actions + CSS + the existing `lib/checklist/siblings.ts` pure functions together (`checklist-item-table.tsx`), then the page-level rewrite that fetches everything the table needs for the active subcategoria and renders it (`page.tsx`). Tasks 1–5 don't touch `page.tsx`'s current contents at all, so the app stays fully functional in its pre-redesign form throughout — Task 6 is the only task that actually wires the new table into a live route. `[itemId]/page.tsx` and its forms (`item-escolha-form.tsx`, `item-medicao-form.tsx`, `batch-apply-panel.tsx`, `photo-manager.tsx`) are **reused unmodified** — the table opens `ItemMedicaoForm` and `BatchApplyPanel` verbatim inside native `<dialog>` elements; no changes to those files or to `saveEscolhaAction`/`saveMeasurementAction`/`applyOpcoesBatchAction`.

**Tech Stack:** Next.js 15 (App Router, Server Actions, async `params`/`searchParams`), TypeScript, Supabase JS client (untyped — no generated `Database` type in this codebase, confirmed via `lib/supabase/server.ts`), Vitest + Testing Library.

## Global Constraints

- Branch: new worktree `worktree-peca3-tabela-subseccao` (via `superpowers:using-git-worktrees`) — do not reuse an existing worktree.
- No changes to login, vehicle-data tabs, scoring, or any screen outside the checklist subcategoria table — out of scope per design doc §1.
- `security-review` does not apply to this piece — no auth/RLS changes (design doc §7).
- All DB-column-shaped fields in shared types stay snake_case (`grupo_replicacao`, `conjunto_opcao_id`, `resposta_texto`, `resposta_data`, `item_response_id`, etc.) — only synthetic component-local identifiers (`itemTemplateId`, `inspectionId`, `pageUrl`) are camelCase. This matches the convention already established in `lib/checklist/progress.ts`/`siblings.ts` and carried through Peça 1b's plan.
- Every task that touches a file with an existing `*.test.*` sibling must update that test file in the same task and get it green before moving on. Files with **no** existing test sibling (`layout.tsx`, `item-medicao-form.tsx`, `batch-apply-panel.tsx`'s consumers, etc.) do not get a new one manufactured for this plan, matching the codebase's own precedent (e.g. `item-medicao-form.tsx` has never had a test) — coverage for those is the end-to-end browser verification required by design doc §6, not a substitute unit test.
- Run `npm test` (not a filtered run) at the end of every task — regressions in files outside the current task's scope must be caught immediately, not at the final gate.
- `docs/database-schema-v1.md` is confirmed stale (still describes `classificacao`/`status`/`paint_measurements`, pre-dates Peça 1a's migrations `00027`–`00037`) — do not use it as a source of truth; this plan's column names come from reading the migrations directly (`00027`–`00037`).

**Real discoveries made while reading the source for this plan (vs. what the design doc assumed):**
- `saveTextoAction`/`saveDataAction` are confirmed **fully absent** from `actions.ts` — `[itemId]/page.tsx` line 90 renders `ItemEscolhaForm` with `opcoes={opcoes ?? []}` for *any* non-`medicao` type, and the `opcoes` query itself is gated on `item.tipo === "escolha"`, so a `texto`/`data` item today renders a segmented control with zero options and no way to save. Confirmed exactly as the design doc describes.
- The RF-16 trigger (`check_exige_foto`, migration `00033_rf16_generico.sql`) fires on `after insert or update of opcao_id on checklist_item_responses` — an upsert of a `texto`/`data` response (which never touches `opcao_id`) still fires it on the `insert` branch, but `v_exige_foto` resolves to `false` (no `opcao_id`, no `medicoes_resultado` row), so it can never actually reject a `texto`/`data` save. `saveTextoAction`/`saveDataAction` still call the same `friendlyDbError` pattern for consistency with the other three actions in this file, but in practice the 23514 branch is dead code for these two — noted with a `ponytail:` comment in Task 3's implementation rather than skipped, since the pattern match with `saveEscolhaAction`/`saveMeasurementAction` was explicitly requested.
- `.escolha-option--otimo|medio|ruim|na` (added in Peça 1b for the now-deleted `estado_4` conjunto) are the **only** color modifier classes that exist. Peça 2's real seed (migration `00037`) deleted `estado_4` entirely and introduced 22 real conjuntos with labels like "Bom"/"Mau", "Funciona"/"Não Funciona", "Ausente"/"Ligeira"/"Moderada"/"Severa", etc. `slugifyOpcaoLabel` will produce slugs like `bom`, `mau`, `naofunciona` that don't match any existing modifier — those options render with the base `.escolha-option` style only (border, no color fill). This is a real, visible gap between the design doc's implied color-coded segmented control and what actually ships from this recorte, but re-mapping colors per conjunto is not requested anywhere in the design doc (§4's CSS section only asks for `.item-table`/`.dialog-panel` additions) — flagged here as out of scope, not fixed.
- `medicoes_resultado` (migration `00030`) has exactly two columns: `item_response_id`, `resultado` (enum `ok`/`atencao`/`critico`, nullable when the item has no configured faixa/limiar at all). The design doc doesn't mention that the measurement dialog also needs the *raw* `medicoes.valores` array to prefill `ItemMedicaoForm.initialValores` when re-opening an already-answered item — Task 6 fetches both.
- Next.js 15's `searchParams` prop is itself a `Promise` (same as `params`) — `page.tsx`'s existing test (`page.test.ts`) calls the page function with only `params`; Task 6 must update that call site to also pass `searchParams: Promise.resolve({})` or the destructure throws before reaching the `notFound()` branch the test exercises.

---

### Task 1: `lib/checklist/progress.ts` — subcategoria-level progress aggregation

**Files:**
- Modify: `lib/checklist/progress.ts`
- Test: `lib/checklist/progress.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `SEM_SUBCATEGORIA_PARAM = "sem-subcategoria"` — the URL sentinel for a null subcategoria (matches the existing DOM key convention already used in today's `page.tsx` line 38, `bucket.subcategoria ?? "sem-subcategoria"`) — consumed by Task 2 (`layout.tsx`, to build sublinks) and Task 6 (`page.tsx`, to parse `?sub=`). Shared here so both ends can't drift on the literal string.
  - `ItemGroupSubcategoria = { id: string; group_id: string; subcategoria: string | null }` — new.
  - `SubcategoriaProgress = { subcategoria: string | null; pendentes: number; total: number }` — new.
  - `GroupSubcategoriaProgress = { id: string; subcategorias: SubcategoriaProgress[] }` — new (`id` is the group's own id, matching the existing `GroupProgress.id` convention rather than a synthetic `groupId`).
  - `computeSubcategoriaProgress(items: ItemGroupSubcategoria[], responses: ItemResponseRow[]): GroupSubcategoriaProgress[]` — new, groups items by `group_id` then buckets by `subcategoria` (same sort as `groupItemsBySubcategoria`: `(a.subcategoria ?? "").localeCompare(b.subcategoria ?? "")`), reusing `isItemPending` — consumed by Task 2 (`layout.tsx`).
  - All existing exports (`isItemPending`, `computeGroupProgress`, `groupItemsBySubcategoria`, `findNextItemId`, and their types) are unchanged.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `lib/checklist/progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isItemPending,
  computeGroupProgress,
  groupItemsBySubcategoria,
  findNextItemId,
  computeSubcategoriaProgress,
  SEM_SUBCATEGORIA_PARAM,
  type GroupTemplate,
  type ItemTemplate,
  type ItemResponseRow,
  type ItemTemplateDetail,
  type ItemGroupSubcategoria,
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

describe("computeSubcategoriaProgress", () => {
  const items: ItemGroupSubcategoria[] = [
    { id: "i1", group_id: "g1", subcategoria: "Pneus" },
    { id: "i2", group_id: "g1", subcategoria: "Pneus" },
    { id: "i3", group_id: "g1", subcategoria: "Pintura" },
    { id: "i4", group_id: "g2", subcategoria: null },
  ];

  it("groups items by group_id then by subcategoria, counting pendentes/total per bucket", () => {
    const responses: ItemResponseRow[] = [{ item_template_id: "i1", respondido: true }];
    const result = computeSubcategoriaProgress(items, responses);
    const g1 = result.find((g) => g.id === "g1")!;
    expect(g1.subcategorias).toEqual([
      { subcategoria: "Pintura", pendentes: 1, total: 1 },
      { subcategoria: "Pneus", pendentes: 1, total: 2 },
    ]);
  });

  it("puts items with null subcategoria in their own bucket", () => {
    const result = computeSubcategoriaProgress(items, []);
    const g2 = result.find((g) => g.id === "g2")!;
    expect(g2.subcategorias).toEqual([{ subcategoria: null, pendentes: 1, total: 1 }]);
  });

  it("treats an item without a response row as pending", () => {
    const result = computeSubcategoriaProgress([items[0]], []);
    expect(result[0].subcategorias[0].pendentes).toBe(1);
  });

  it("does not count respondido items as pending", () => {
    const responses: ItemResponseRow[] = [
      { item_template_id: "i1", respondido: true },
      { item_template_id: "i2", respondido: true },
    ];
    const result = computeSubcategoriaProgress(items, responses);
    const g1 = result.find((g) => g.id === "g1")!;
    expect(g1.subcategorias.find((s) => s.subcategoria === "Pneus")?.pendentes).toBe(0);
  });

  it("returns an empty array when there are no items", () => {
    expect(computeSubcategoriaProgress([], [])).toEqual([]);
  });
});

describe("SEM_SUBCATEGORIA_PARAM", () => {
  it("is the URL sentinel string for a null subcategoria", () => {
    expect(SEM_SUBCATEGORIA_PARAM).toBe("sem-subcategoria");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/checklist/progress.test.ts`
Expected: FAIL — `computeSubcategoriaProgress` and `SEM_SUBCATEGORIA_PARAM` are not exported yet.

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `lib/checklist/progress.ts`:

```ts
export const SEM_SUBCATEGORIA_PARAM = "sem-subcategoria";

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

export type ItemGroupSubcategoria = { id: string; group_id: string; subcategoria: string | null };
export type SubcategoriaProgress = { subcategoria: string | null; pendentes: number; total: number };
export type GroupSubcategoriaProgress = { id: string; subcategorias: SubcategoriaProgress[] };

export function computeSubcategoriaProgress(
  items: ItemGroupSubcategoria[],
  responses: ItemResponseRow[]
): GroupSubcategoriaProgress[] {
  const respondidoByItemId = new Map(responses.map((r) => [r.item_template_id, r.respondido]));
  const itemsByGroupId = new Map<string, ItemGroupSubcategoria[]>();
  for (const item of items) {
    const list = itemsByGroupId.get(item.group_id) ?? [];
    list.push(item);
    itemsByGroupId.set(item.group_id, list);
  }

  return Array.from(itemsByGroupId.entries()).map(([groupId, groupItems]) => {
    const sorted = groupItems.slice().sort((a, b) => (a.subcategoria ?? "").localeCompare(b.subcategoria ?? ""));
    const order: Array<string | null> = [];
    const bucket = new Map<string | null, ItemGroupSubcategoria[]>();
    for (const item of sorted) {
      const key = item.subcategoria;
      if (!bucket.has(key)) {
        bucket.set(key, []);
        order.push(key);
      }
      bucket.get(key)!.push(item);
    }
    const subcategorias = order.map((subcategoria) => {
      const bucketItems = bucket.get(subcategoria)!;
      const pendentes = bucketItems.filter((item) => isItemPending(respondidoByItemId.get(item.id))).length;
      return { subcategoria, pendentes, total: bucketItems.length };
    });
    return { id: groupId, subcategorias };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/checklist/progress.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — nothing else imports the new exports yet, so no other file should be affected.

- [ ] **Step 6: Commit**

```bash
git add lib/checklist/progress.ts lib/checklist/progress.test.ts
git commit -m "feat: add subcategoria-level progress aggregation for nested sidebar"
```

---

### Task 2: `layout.tsx` — nest subcategoria counts under each group

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/layout.tsx`
- Modify: `app/globals.css` (small, self-contained addition — see note below)

**Interfaces:**
- Consumes: `computeSubcategoriaProgress`, `SEM_SUBCATEGORIA_PARAM` (Task 1). `computeGroupProgress` (existing, unchanged usage).
- Produces: nothing new (page-level component) — the nested `?sub=` links it renders are consumed by a human clicking them into Task 6's `page.tsx`.
- No test file exists for `layout.tsx` today — none created here, matching the codebase's existing precedent for files without a test sibling; this is exercised by the mandatory end-to-end browser check (design doc §6), not a unit test.

**Why this task also touches `globals.css`:** the design doc assigns all new CSS to Task 4, but Task 4 comes *after* this task in the required task order, and the nested `<ul>` this task renders needs indentation/badge classes to not look broken the moment it ships. Rather than reorder the plan's task list (explicitly given) or leave the sidebar visually broken between Task 2 and Task 4, this task adds a small, self-contained set of nav-only classes (`.checklist-nav__sublist`, `__sublink`, `__substatus*`) — composed only from existing tokens, same rule Task 4 follows for its own (larger) addition.

- [ ] **Step 1: Add the nav-nesting CSS**

In `app/globals.css`, insert the following immediately after the `.checklist-nav__status--pending` block (currently ends at line 324) and before `.checklist-main` (currently line 326):

```css
.checklist-nav__sublist {
  list-style: none;
  margin: 0 0 var(--space-2);
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.checklist-nav__sublink {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-identity-white);
  text-decoration: none;
  font-size: 0.8125rem;
  opacity: 0.85;
  min-height: 36px;
  transition: background-color 150ms ease-out;
}

.checklist-nav__sublink:hover {
  background: oklch(1 0 0 / 0.08);
}

.checklist-nav__substatus {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  border-radius: var(--radius-full);
  font-size: 0.6875rem;
  font-weight: 700;
  flex-shrink: 0;
}

.checklist-nav__substatus--done {
  background: var(--color-green-100);
  color: var(--color-green-800);
}

.checklist-nav__substatus--pending {
  background: var(--color-amber-100);
  color: var(--color-amber-600);
}
```

- [ ] **Step 2: Rewrite the layout**

Replace the full contents of `app/(app)/inspections/[id]/checklist/layout.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress, computeSubcategoriaProgress, SEM_SUBCATEGORIA_PARAM } from "@/lib/checklist/progress";

export default async function ChecklistLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inspection } = await supabase.from("inspections").select("id").eq("id", id).single();

  if (!inspection) notFound();

  const [
    { data: groups, error: groupsError },
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
  ] = await Promise.all([
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase.from("checklist_item_templates").select("id, group_id, subcategoria"),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
  ]);

  if (groupsError || itemsError || responsesError) {
    console.error("checklist layout data fetch failed", { groupsError, itemsError, responsesError });
  }

  const progress = computeGroupProgress(groups ?? [], items ?? [], responses ?? []);
  const subcategoriaProgress = computeSubcategoriaProgress(items ?? [], responses ?? []);
  const subcategoriasByGroupId = new Map(subcategoriaProgress.map((g) => [g.id, g.subcategorias]));

  return (
    <div className="checklist-shell">
      <nav className="checklist-nav identity-bar" aria-label="Grupos da checklist">
        <h2 className="checklist-nav__title">Checklist</h2>
        <ul className="checklist-nav__list">
          {progress.map((group) => {
            const subcategorias = subcategoriasByGroupId.get(group.id) ?? [];
            return (
              <li key={group.id}>
                <Link href={`/inspections/${id}/checklist/${group.id}`} className="checklist-nav__link">
                  <span
                    className={`checklist-nav__status ${group.pendentes === 0 ? "checklist-nav__status--done" : "checklist-nav__status--pending"}`}
                    aria-hidden="true"
                  >
                    {group.pendentes === 0 ? "✓" : group.pendentes}
                  </span>
                  <span className="sr-only">
                    {group.pendentes === 0 ? "Concluído: " : `${group.pendentes} pendentes: `}
                  </span>
                  {group.nome}
                </Link>
                {subcategorias.length > 0 && (
                  <ul className="checklist-nav__sublist">
                    {subcategorias.map((sub) => {
                      const subParam = sub.subcategoria ?? SEM_SUBCATEGORIA_PARAM;
                      return (
                        <li key={subParam}>
                          <Link
                            href={`/inspections/${id}/checklist/${group.id}?sub=${encodeURIComponent(subParam)}`}
                            className="checklist-nav__sublink"
                          >
                            <span
                              className={`checklist-nav__substatus ${sub.pendentes === 0 ? "checklist-nav__substatus--done" : "checklist-nav__substatus--pending"}`}
                              aria-hidden="true"
                            >
                              {sub.pendentes === 0 ? "✓" : sub.pendentes}
                            </span>
                            <span className="sr-only">
                              {sub.pendentes === 0 ? "Concluído: " : `${sub.pendentes} pendentes: `}
                            </span>
                            {sub.subcategoria ?? "Sem subcategoria"}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <main className="checklist-main">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS — no test exercises `layout.tsx` directly; this run only guards against a regression elsewhere.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css "app/(app)/inspections/[id]/checklist/layout.tsx"
git commit -m "feat: nest subcategoria counts under each group in checklist sidebar"
```

---

### Task 3: `actions.ts` — `saveTextoAction` and `saveDataAction`

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts`

**Interfaces:**
- Consumes: nothing new (no imports from Tasks 1–2).
- Produces:
  - `SaveTextoState = { status: "idle" } | { status: "error"; message: string }` — new.
  - `saveTextoAction(prevState: SaveTextoState, formData: FormData): Promise<SaveTextoState>` — new; reads `inspectionId`, `itemTemplateId`, `nextUrl`, `resposta_texto`, `observacao`; validates non-empty `resposta_texto`; upserts `{ inspection_id, item_template_id, resposta_texto, observacao }` onto `checklist_item_responses` — consumed by Task 5 (`checklist-item-table.tsx`).
  - `SaveDataState = { status: "idle" } | { status: "error"; message: string }` — new.
  - `saveDataAction(prevState: SaveDataState, formData: FormData): Promise<SaveDataState>` — new; reads the same trio plus `resposta_data`; validates it matches `yyyy-mm-dd` (the format a native `<input type="date">` always submits); upserts `{ inspection_id, item_template_id, resposta_data, observacao }` — consumed by Task 5.
  - `saveEscolhaAction`, `saveMeasurementAction`, `attachPhotoAction`, `deletePhotoAction`, `applyOpcoesBatchAction` and their types — unchanged, still consumed by Task 5 and the existing `[itemId]` forms.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts` — this is the existing file with two new `describe` blocks appended at the end (everything above `describe("saveTextoAction"...)` is unchanged from today):

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

describe("saveTextoAction", () => {
  it("returns a validation error without writing when resposta_texto is empty", async () => {
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");

    const result = await saveTextoAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts resposta_texto and redirects to nextUrl on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1?sub=motor");
    formData.set("resposta_texto", "Chassi OK, sem avarias visíveis");
    formData.set("observacao", "Verificado às 10h");

    await expect(saveTextoAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1?sub=motor"
    );

    expect(upsert).toHaveBeenCalledWith(
      {
        inspection_id: "insp-1",
        item_template_id: "item-1",
        resposta_texto: "Chassi OK, sem avarias visíveis",
        observacao: "Verificado às 10h",
      },
      { onConflict: "inspection_id,item_template_id" }
    );
  });

  it("returns a friendly message when the DB rejects the write (check_violation)", async () => {
    upsertQuery.single.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("resposta_texto", "Texto qualquer");

    const result = await saveTextoAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});

describe("saveDataAction", () => {
  it("returns a validation error without writing when resposta_data is missing", async () => {
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns a validation error without writing when resposta_data is not in yyyy-mm-dd format", async () => {
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("resposta_data", "21/07/2026");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts resposta_data and redirects to nextUrl on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1?sub=motor");
    formData.set("resposta_data", "2026-07-21");
    formData.set("observacao", "");

    await expect(saveDataAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1?sub=motor"
    );

    expect(upsert).toHaveBeenCalledWith(
      { inspection_id: "insp-1", item_template_id: "item-1", resposta_data: "2026-07-21", observacao: null },
      { onConflict: "inspection_id,item_template_id" }
    );
  });

  it("returns a friendly message when the DB rejects the write (check_violation)", async () => {
    upsertQuery.single.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("resposta_data", "2026-07-21");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"`
Expected: FAIL — `saveTextoAction`/`saveDataAction` are not exported yet.

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts` — this is the existing file with `SaveTextoState`/`saveTextoAction`/`SaveDataState`/`saveDataAction` appended at the end (everything above is unchanged):

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

export type SaveTextoState = { status: "idle" } | { status: "error"; message: string };

export async function saveTextoAction(
  _prevState: SaveTextoState,
  formData: FormData
): Promise<SaveTextoState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const nextUrl = formData.get("nextUrl") as string;
  const respostaTexto = ((formData.get("resposta_texto") as string) || "").trim();
  const observacao = (formData.get("observacao") as string) || null;

  if (!respostaTexto) {
    return { status: "error", message: "Preencha o campo antes de salvar." };
  }

  const supabase = await createClient();

  // ponytail: check_exige_foto (RF-16) only ever raises for opcao_id/medicao
  // responses (see migration 00033) — texto never sets opcao_id, so the
  // 23514 branch below can't actually fire today. Kept for symmetry with
  // saveEscolhaAction/saveMeasurementAction and in case a future opcao_id
  // gets attached to a texto-typed item.
  const { error } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId, resposta_texto: respostaTexto, observacao },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("saveTextoAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Esta resposta exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
    };
  }

  redirect(nextUrl);
}

export type SaveDataState = { status: "idle" } | { status: "error"; message: string };

export async function saveDataAction(
  _prevState: SaveDataState,
  formData: FormData
): Promise<SaveDataState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const nextUrl = formData.get("nextUrl") as string;
  const respostaData = (formData.get("resposta_data") as string) || "";
  const observacao = (formData.get("observacao") as string) || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(respostaData)) {
    return { status: "error", message: "Informe uma data válida." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId, resposta_data: respostaData, observacao },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("saveDataAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Esta resposta exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
    };
  }

  redirect(nextUrl);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
git commit -m "feat: add saveTextoAction and saveDataAction for texto/data checklist items"
```

---

### Task 4: `app/globals.css` — `.item-table` and `.dialog-panel`

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nothing (pure CSS, composed only from existing `--space-*`/`--color-*`/`--radius-*`/`--font-family-*` tokens).
- Produces: `.item-table`, `.item-table__row`, `.item-table__row--pendente|--respondido`, `.item-table__cell--escolha`, `.item-table__input`, `.item-table__badge`, `.item-table__badge--ok|--atencao|--critico`, `.item-table__familia-btn`, `.dialog-panel` — consumed by Task 5 (`checklist-item-table.tsx`).

No test — pure CSS addition, visually verified in the mandatory end-to-end browser check (design doc §6).

- [ ] **Step 1: Add the table and dialog CSS**

In `app/globals.css`, insert the following immediately before the final `@media (prefers-reduced-motion: reduce)` block (the last block in the file):

```css
/* Item table — dense per-subcategoria table (Peça 3) */

.item-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.item-table th {
  text-align: left;
  font-family: var(--font-family-body);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-ink-muted);
  background: var(--color-green-50);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.item-table__row td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.item-table__row:last-child td {
  border-bottom: none;
}

.item-table__row--pendente td:first-child {
  border-left: 3px solid var(--color-amber-500);
}

.item-table__row--respondido td:first-child {
  border-left: 3px solid var(--color-green-500);
}

.item-table__cell--escolha .escolha-options {
  gap: var(--space-1);
}

.item-table__input {
  min-height: 36px;
  padding: var(--space-2) var(--space-3);
}

.item-table__badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-family-body);
  font-size: 0.875rem;
  font-weight: 600;
  min-height: 36px;
  cursor: pointer;
  background: var(--color-surface);
  color: var(--color-ink);
}

.item-table__badge--ok {
  background: var(--color-green-100);
  border-color: var(--color-green-500);
  color: var(--color-green-800);
}

.item-table__badge--atencao {
  background: var(--color-amber-100);
  border-color: var(--color-amber-500);
  color: var(--color-amber-600);
}

.item-table__badge--critico {
  background: var(--color-red-100);
  border-color: var(--color-red-500);
  color: var(--color-red-600);
}

.item-table__familia-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1.125rem;
  line-height: 1;
  padding: var(--space-1);
}

/* Dialog — native <dialog>, .dialog-panel composes .panel's look with its
   own sizing/backdrop rules (centering + scrim come from the dialog spec
   itself, not from .panel) */

.dialog-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  background: var(--color-surface);
  color: var(--color-ink);
  width: min(90vw, 560px);
  max-height: 85vh;
  overflow-y: auto;
}

.dialog-panel::backdrop {
  background: oklch(0 0 0 / 0.4);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: add item-table and dialog-panel CSS for subseção table redesign"
```

---

### Task 5: `checklist-item-table.tsx` — the dense table component

**Files:**
- New: `app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx`
- New: `app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx`

**Interfaces:**
- Consumes: `saveEscolhaAction`, `saveTextoAction`, `saveDataAction` (Task 3); `.item-table*`/`.dialog-panel` CSS classes (Task 4); `deriveSiblingRows`, `buildBatchRows`, `slugifyOpcaoLabel`, `SiblingSourceItem`, `SiblingResponseRow` (existing, `lib/checklist/siblings.ts`, unchanged); `ItemMedicaoForm` (existing, unchanged); `BatchApplyPanel`, `BatchRow` (existing, unchanged); `Photo` (existing, `photo-manager.tsx`, unchanged).
- Produces:
  - `TableItem = { id: string; nome: string; tipo: "escolha" | "texto" | "data" | "medicao"; conjunto_opcao_id: string | null; unidade_medicao: string | null; qtd_pontos_medicao: number | null; grupo_replicacao: string | null }` — new.
  - `TableResponse = { id: string; item_template_id: string; opcao_id: string | null; resposta_texto: string | null; resposta_data: string | null; observacao: string | null; respondido: boolean }` — new.
  - `TableOpcao = { id: string; conjunto_id: string; label: string; exige_foto: boolean }` — new (a superset of the existing `Opcao` type from `siblings.ts`, since the table needs `conjunto_id` to scope each row's segmented control to its own item's conjunto — plain `Opcao` objects, without `conjunto_id`, are what gets passed down into `BatchApplyPanel`).
  - `TablePhoto = { id: string; url: string; item_response_id: string }` — new.
  - `TableMedicaoResultado = { item_response_id: string; resultado: "ok" | "atencao" | "critico" | null }` — new.
  - `TableMedicaoValores = { item_response_id: string; valores: number[] }` — new.
  - `ChecklistItemTable` component, props `{ inspectionId, items, allGroupItems, responses, opcoes, photos, medicaoResultados, medicaoValores, pageUrl }` — consumed by Task 6 (`page.tsx`).

**Design notes carried over from the design doc + real constraints found while reading the source:**
- Each `escolha`/`texto`/`data` cell saves via its Server Action **called directly** (not through `useActionState`/`<form action>`), the same pattern `photo-manager.tsx` already uses for `attachPhotoAction`/`deletePhotoAction` — this keeps each table row an independent, self-contained saver with its own pending/error state, matching design doc §5's "erro de salvamento por linha, sem travar as outras linhas".
- `nextUrl`/`groupListUrl` passed into `saveEscolhaAction`/`saveTextoAction`/`saveDataAction`/`ItemMedicaoForm`/`BatchApplyPanel` is the table's own `pageUrl` (the current subcategoria URL) — a successful save redirects back to the same URL, which Next's App Router resolves as a soft client-side transition that re-fetches `page.tsx`'s server data and re-renders with the fresh state. This matches the already-decided "rotas normais do Next.js (não SPA)" architecture (`docs/ROADMAP.md`, Fase 2.8 entry) rather than inventing a no-reload live-update mechanism.
- `medicao` and "família" dialogs are **per-row**, not a single shared dialog lifted to the table root — each `MedicaoCell`/`FamiliaCell` owns its own `<dialog>` ref and calls `.showModal()`/`.close()` directly, with no React state needed for "which dialog is open". This is simpler than lifting open-item-id state to the table (no derived lookups, no `useEffect`), and the family dialog's sibling computation (`deriveSiblingRows`/`buildBatchRows`) runs lazily on click, not on every render.

- [ ] **Step 1: Write the failing tests**

Write `app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChecklistItemTable, type TableItem, type TableResponse, type TableOpcao } from "./checklist-item-table";

const saveEscolhaAction = vi.fn();
const saveTextoAction = vi.fn();
const saveDataAction = vi.fn();
vi.mock("./actions", () => ({
  saveEscolhaAction: (...args: unknown[]) => saveEscolhaAction(...args),
  saveTextoAction: (...args: unknown[]) => saveTextoAction(...args),
  saveDataAction: (...args: unknown[]) => saveDataAction(...args),
}));

vi.mock("./item-medicao-form", () => ({
  ItemMedicaoForm: ({ itemTemplateId }: { itemTemplateId: string }) => (
    <div data-testid="item-medicao-form">Medição de {itemTemplateId}</div>
  ),
}));

vi.mock("./batch-apply-panel", () => ({
  BatchApplyPanel: ({ initialRows }: { initialRows: { itemTemplateId: string }[] }) => (
    <div data-testid="batch-apply-panel">{initialRows.map((r) => r.itemTemplateId).join(",")}</div>
  ),
}));

beforeEach(() => {
  saveEscolhaAction.mockReset();
  saveTextoAction.mockReset();
  saveDataAction.mockReset();
});

const escolhaItem: TableItem = {
  id: "item-escolha",
  nome: "Pneu dianteiro esquerdo",
  tipo: "escolha",
  conjunto_opcao_id: "conj-1",
  unidade_medicao: null,
  qtd_pontos_medicao: null,
  grupo_replicacao: "pneus-estado-geral",
};
const textoItem: TableItem = {
  id: "item-texto",
  nome: "Número de chassi",
  tipo: "texto",
  conjunto_opcao_id: null,
  unidade_medicao: null,
  qtd_pontos_medicao: null,
  grupo_replicacao: null,
};
const dataItem: TableItem = {
  id: "item-data",
  nome: "Data da última revisão",
  tipo: "data",
  conjunto_opcao_id: null,
  unidade_medicao: null,
  qtd_pontos_medicao: null,
  grupo_replicacao: null,
};
const medicaoItem: TableItem = {
  id: "item-medicao",
  nome: "Espessura de tinta — capô",
  tipo: "medicao",
  conjunto_opcao_id: null,
  unidade_medicao: "µm",
  qtd_pontos_medicao: 3,
  grupo_replicacao: null,
};

const opcoes: TableOpcao[] = [
  { id: "opt-bom", conjunto_id: "conj-1", label: "Bom", exige_foto: false },
  { id: "opt-mau", conjunto_id: "conj-1", label: "Mau", exige_foto: true },
];

describe("ChecklistItemTable", () => {
  it("renders an escolha row as a segmented control scoped to the item's conjunto", () => {
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
        pageUrl="/x"
      />
    );

    expect(screen.getByText("Bom")).toBeInTheDocument();
    expect(screen.getByText("Mau")).toBeInTheDocument();
  });

  it("saves the selected escolha option and shows the DB's error inline", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "error", message: "Esta resposta exige pelo menos 1 foto anexada." });
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
        pageUrl="/x"
      />
    );

    fireEvent.click(screen.getByLabelText("Mau"));

    await waitFor(() => expect(saveEscolhaAction).toHaveBeenCalledWith({ status: "idle" }, expect.any(FormData)));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/foto/i));
  });

  it("renders a texto row and saves resposta_texto on blur", async () => {
    saveTextoAction.mockResolvedValue({ status: "idle" });
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[textoItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
        pageUrl="/x"
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "9BWZZZ377VT004251" } });
    fireEvent.blur(input);

    await waitFor(() => expect(saveTextoAction).toHaveBeenCalled());
    const formData = saveTextoAction.mock.calls[0][1] as FormData;
    expect(formData.get("resposta_texto")).toBe("9BWZZZ377VT004251");
    expect(formData.get("itemTemplateId")).toBe("item-texto");
  });

  it("renders a data row and saves resposta_data on blur", async () => {
    saveDataAction.mockResolvedValue({ status: "idle" });
    const { container } = render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[dataItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
        pageUrl="/x"
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-21" } });
    fireEvent.blur(input);

    await waitFor(() => expect(saveDataAction).toHaveBeenCalled());
    const formData = saveDataAction.mock.calls[0][1] as FormData;
    expect(formData.get("resposta_data")).toBe("2026-07-21");
  });

  it("renders a medicao row as a 'Medir' badge when unanswered, opening the reused ItemMedicaoForm in a dialog", () => {
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[medicaoItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
        pageUrl="/x"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Medir" }));
    expect(screen.getByTestId("item-medicao-form")).toHaveTextContent("item-medicao");
  });

  it("renders the medicao result as a badge when answered", () => {
    const response: TableResponse = {
      id: "resp-medicao",
      item_template_id: "item-medicao",
      opcao_id: null,
      resposta_texto: null,
      resposta_data: null,
      observacao: null,
      respondido: true,
    };
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[medicaoItem]}
        allGroupItems={[]}
        responses={[response]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[{ item_response_id: "resp-medicao", resultado: "critico" }]}
        medicaoValores={[{ item_response_id: "resp-medicao", valores: [310, 320, 305] }]}
        pageUrl="/x"
      />
    );

    expect(screen.getByRole("button", { name: "Crítico" })).toBeInTheDocument();
  });

  it("shows the família icon only when the item has grupo_replicacao and is respondido", () => {
    const respondido: TableResponse = {
      id: "resp-1",
      item_template_id: "item-escolha",
      opcao_id: "opt-bom",
      resposta_texto: null,
      resposta_data: null,
      observacao: null,
      respondido: true,
    };
    const pendente: TableResponse = { ...respondido, item_template_id: "item-texto", respondido: false };

    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem, textoItem]}
        allGroupItems={[]}
        responses={[respondido, pendente]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
        pageUrl="/x"
      />
    );

    expect(screen.getByRole("button", { name: /Aplicar aos itens semelhantes/ })).toBeInTheDocument();
  });

  it("does not show the família icon for an item with no grupo_replicacao even if respondido", () => {
    const respondido: TableResponse = {
      id: "resp-2",
      item_template_id: "item-texto",
      opcao_id: null,
      resposta_texto: "algo",
      resposta_data: null,
      observacao: null,
      respondido: true,
    };

    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[textoItem]}
        allGroupItems={[]}
        responses={[respondido]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
        pageUrl="/x"
      />
    );

    expect(screen.queryByRole("button", { name: /Aplicar aos itens semelhantes/ })).not.toBeInTheDocument();
  });

  it("opens the família dialog with siblings computed from grupo_replicacao, excluding the current item", () => {
    const allGroupItems = [
      { id: "item-escolha", nome: "Pneu dianteiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
      { id: "item-sibling", nome: "Pneu dianteiro direito", grupo_replicacao: "pneus-estado-geral" },
    ];
    const response: TableResponse = {
      id: "resp-1",
      item_template_id: "item-escolha",
      opcao_id: "opt-bom",
      resposta_texto: null,
      resposta_data: null,
      observacao: null,
      respondido: true,
    };

    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={allGroupItems}
        responses={[response]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
        pageUrl="/x"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Aplicar aos itens semelhantes/ }));

    expect(screen.getByTestId("batch-apply-panel")).toHaveTextContent("item-escolha,item-sibling");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx"`
Expected: FAIL — `./checklist-item-table` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Write `app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx`:

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { saveEscolhaAction, saveTextoAction, saveDataAction } from "./actions";
import { ItemMedicaoForm } from "./item-medicao-form";
import { BatchApplyPanel, type BatchRow } from "./batch-apply-panel";
import {
  deriveSiblingRows,
  buildBatchRows,
  slugifyOpcaoLabel,
  type SiblingSourceItem,
  type SiblingResponseRow,
} from "@/lib/checklist/siblings";
import type { Photo } from "./photo-manager";

export type TableItem = {
  id: string;
  nome: string;
  tipo: "escolha" | "texto" | "data" | "medicao";
  conjunto_opcao_id: string | null;
  unidade_medicao: string | null;
  qtd_pontos_medicao: number | null;
  grupo_replicacao: string | null;
};

export type TableResponse = {
  id: string;
  item_template_id: string;
  opcao_id: string | null;
  resposta_texto: string | null;
  resposta_data: string | null;
  observacao: string | null;
  respondido: boolean;
};

export type TableOpcao = { id: string; conjunto_id: string; label: string; exige_foto: boolean };
export type TablePhoto = { id: string; url: string; item_response_id: string };
export type TableMedicaoResultado = { item_response_id: string; resultado: "ok" | "atencao" | "critico" | null };
export type TableMedicaoValores = { item_response_id: string; valores: number[] };

export function ChecklistItemTable({
  inspectionId,
  items,
  allGroupItems,
  responses,
  opcoes,
  photos,
  medicaoResultados,
  medicaoValores,
  pageUrl,
}: {
  inspectionId: string;
  items: TableItem[];
  allGroupItems: SiblingSourceItem[];
  responses: TableResponse[];
  opcoes: TableOpcao[];
  photos: TablePhoto[];
  medicaoResultados: TableMedicaoResultado[];
  medicaoValores: TableMedicaoValores[];
  pageUrl: string;
}) {
  const responseByItemId = new Map(responses.map((r) => [r.item_template_id, r]));
  const opcaoLabelById = new Map(opcoes.map((o) => [o.id, o.label]));
  const photosByResponseId = new Map<string, Photo[]>();
  for (const p of photos) {
    const list = photosByResponseId.get(p.item_response_id) ?? [];
    list.push({ id: p.id, url: p.url });
    photosByResponseId.set(p.item_response_id, list);
  }
  const resultadoByResponseId = new Map(medicaoResultados.map((m) => [m.item_response_id, m.resultado]));
  const valoresByResponseId = new Map(medicaoValores.map((m) => [m.item_response_id, m.valores]));

  return (
    <table className="item-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Resposta</th>
          <th aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const response = responseByItemId.get(item.id);
          const showFamiliaIcon = item.grupo_replicacao !== null && response?.respondido === true;

          return (
            <tr
              key={item.id}
              className={`item-table__row item-table__row--${response?.respondido ? "respondido" : "pendente"}`}
            >
              <td>{item.nome}</td>
              <td className={`item-table__cell--${item.tipo}`}>
                {item.tipo === "escolha" && (
                  <EscolhaCell
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    opcoes={opcoes.filter((o) => o.conjunto_id === item.conjunto_opcao_id)}
                    nextUrl={pageUrl}
                  />
                )}
                {item.tipo === "texto" && (
                  <TextoCell inspectionId={inspectionId} item={item} response={response} nextUrl={pageUrl} />
                )}
                {item.tipo === "data" && (
                  <DataCell inspectionId={inspectionId} item={item} response={response} nextUrl={pageUrl} />
                )}
                {item.tipo === "medicao" && (
                  <MedicaoCell
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    resultado={response ? (resultadoByResponseId.get(response.id) ?? null) : null}
                    initialValores={response ? (valoresByResponseId.get(response.id) ?? []) : []}
                    initialPhotos={response ? (photosByResponseId.get(response.id) ?? []) : []}
                    nextUrl={pageUrl}
                  />
                )}
              </td>
              <td className="item-table__cell--familia">
                {showFamiliaIcon && response && (
                  <FamiliaCell
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    allGroupItems={allGroupItems}
                    responses={responses}
                    opcoes={opcoes.filter((o) => o.conjunto_id === item.conjunto_opcao_id)}
                    opcaoLabelById={opcaoLabelById}
                    photosByResponseId={photosByResponseId}
                    pageUrl={pageUrl}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function buildEscolhaFormData(
  inspectionId: string,
  itemTemplateId: string,
  nextUrl: string,
  opcaoId: string,
  observacao: string
): FormData {
  const formData = new FormData();
  formData.set("inspectionId", inspectionId);
  formData.set("itemTemplateId", itemTemplateId);
  formData.set("nextUrl", nextUrl);
  formData.set("opcao_id", opcaoId);
  formData.set("observacao", observacao);
  return formData;
}

function EscolhaCell({
  inspectionId,
  item,
  response,
  opcoes,
  nextUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  opcoes: TableOpcao[];
  nextUrl: string;
}) {
  const [opcaoId, setOpcaoId] = useState(response?.opcao_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(newOpcaoId: string) {
    setOpcaoId(newOpcaoId);
    setError(null);
    const formData = buildEscolhaFormData(inspectionId, item.id, nextUrl, newOpcaoId, response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveEscolhaAction({ status: "idle" }, formData);
      if (result.status === "error") setError(result.message);
    });
  }

  return (
    <div className="escolha-options">
      {opcoes.map((o) => (
        <label key={o.id} className={`escolha-option escolha-option--${slugifyOpcaoLabel(o.label)}`}>
          <input
            type="radio"
            name={`opcao-${item.id}`}
            value={o.id}
            checked={opcaoId === o.id}
            disabled={isPending}
            onChange={() => handleChange(o.id)}
          />
          {o.label}
        </label>
      ))}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}

function TextoCell({
  inspectionId,
  item,
  response,
  nextUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  nextUrl: string;
}) {
  const [value, setValue] = useState(response?.resposta_texto ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    setError(null);
    const formData = new FormData();
    formData.set("inspectionId", inspectionId);
    formData.set("itemTemplateId", item.id);
    formData.set("nextUrl", nextUrl);
    formData.set("resposta_texto", value);
    formData.set("observacao", response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveTextoAction({ status: "idle" }, formData);
      if (result.status === "error") setError(result.message);
    });
  }

  return (
    <div className="field">
      <input
        type="text"
        className="input item-table__input"
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
      />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}

function DataCell({
  inspectionId,
  item,
  response,
  nextUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  nextUrl: string;
}) {
  const [value, setValue] = useState(response?.resposta_data ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    setError(null);
    const formData = new FormData();
    formData.set("inspectionId", inspectionId);
    formData.set("itemTemplateId", item.id);
    formData.set("nextUrl", nextUrl);
    formData.set("resposta_data", value);
    formData.set("observacao", response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveDataAction({ status: "idle" }, formData);
      if (result.status === "error") setError(result.message);
    });
  }

  return (
    <div className="field">
      <input
        type="date"
        className="input item-table__input"
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
      />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}

function MedicaoCell({
  inspectionId,
  item,
  response,
  resultado,
  initialValores,
  initialPhotos,
  nextUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  resultado: "ok" | "atencao" | "critico" | null;
  initialValores: number[];
  initialPhotos: Photo[];
  nextUrl: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const label = !response?.respondido
    ? "Medir"
    : resultado === "critico"
      ? "Crítico"
      : resultado === "atencao"
        ? "Atenção"
        : resultado === "ok"
          ? "OK"
          : "Ver";
  const modifierClass = resultado ? ` item-table__badge--${resultado}` : "";

  return (
    <>
      <button
        type="button"
        className={`item-table__badge${modifierClass}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        {label}
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        <ItemMedicaoForm
          inspectionId={inspectionId}
          itemTemplateId={item.id}
          nextUrl={nextUrl}
          qtdPontos={item.qtd_pontos_medicao ?? 1}
          unidadeMedicao={item.unidade_medicao}
          initialValores={initialValores}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={initialPhotos}
        />
      </dialog>
    </>
  );
}

function FamiliaCell({
  inspectionId,
  item,
  response,
  allGroupItems,
  responses,
  opcoes,
  opcaoLabelById,
  photosByResponseId,
  pageUrl,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse;
  allGroupItems: SiblingSourceItem[];
  responses: TableResponse[];
  opcoes: TableOpcao[];
  opcaoLabelById: Map<string, string>;
  photosByResponseId: Map<string, Photo[]>;
  pageUrl: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<BatchRow[] | null>(null);

  function handleOpen() {
    const siblingResponses: SiblingResponseRow[] = responses.map((r) => ({
      item_template_id: r.item_template_id,
      opcao_id: r.opcao_id,
    }));
    const siblings = deriveSiblingRows(item.id, allGroupItems, siblingResponses, opcaoLabelById);
    const initialRows = buildBatchRows(
      {
        itemTemplateId: item.id,
        nome: item.nome,
        opcao_id: response.opcao_id ?? "",
        observacao: response.observacao ?? "",
        photos: photosByResponseId.get(response.id) ?? [],
      },
      siblings,
      new Set(siblings.filter((s) => s.defaultChecked).map((s) => s.id))
    );
    setRows(initialRows);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        className="item-table__familia-btn"
        aria-label={`Aplicar aos itens semelhantes a ${item.nome}`}
        onClick={handleOpen}
      >
        👪
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        {rows && (
          <BatchApplyPanel
            inspectionId={inspectionId}
            groupListUrl={pageUrl}
            opcoes={opcoes}
            initialRows={rows}
            onCancel={() => dialogRef.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx"`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx"
git commit -m "feat: add ChecklistItemTable dense per-subcategoria table component"
```

---

### Task 6: `page.tsx` — fetch everything the table needs and render it

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts`

**Interfaces:**
- Consumes: `groupItemsBySubcategoria`, `SEM_SUBCATEGORIA_PARAM` (Task 1, `computeSubcategoriaProgress` not needed here — that's layout-only); `ChecklistItemTable` and its `Table*` types (Task 5); `SiblingSourceItem` (existing, `lib/checklist/siblings.ts`).
- Produces: nothing new — rewritten default export (page component). This is the task that actually makes `checklist-item-table.tsx` reachable from a route.

- [ ] **Step 1: Update the existing test for the new `searchParams` prop**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  single: vi.fn(),
};
const from = vi.fn(() => query);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound }));

beforeEach(() => {
  from.mockClear();
  query.select.mockClear();
  query.eq.mockClear();
  query.single.mockReset();
  notFound.mockClear();
});

describe("ChecklistGroupPage", () => {
  it("calls notFound when the group does not exist or is inactive", async () => {
    query.single.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { default: ChecklistGroupPage } = await import("./page");

    await expect(
      ChecklistGroupPage({
        params: Promise.resolve({
          id: "11111111-1111-1111-1111-111111111111",
          groupId: "99999999-9999-9999-9999-999999999999",
        }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NOT_FOUND");
    expect(query.eq).toHaveBeenCalledWith("ativo", true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts"`
Expected: FAIL — today's `ChecklistGroupPage` only takes `{ params }`, not `{ params, searchParams }`; TypeScript/Vitest should still run it but the call site now passes an extra prop the current signature ignores, which is harmless — the *real* failure is that this test alone can't prove the rewrite yet. Confirm intent by running the full suite instead, which will show unrelated breakage once Step 3 lands elsewhere; treat this step as a checkpoint that the updated test file at least parses and the notFound path still trips before touching `page.tsx`.

- [ ] **Step 3: Rewrite the page**

Replace the full contents of `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`:

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria, SEM_SUBCATEGORIA_PARAM } from "@/lib/checklist/progress";
import {
  ChecklistItemTable,
  type TableItem,
  type TableResponse,
  type TableOpcao,
  type TablePhoto,
  type TableMedicaoResultado,
  type TableMedicaoValores,
} from "./checklist-item-table";
import type { SiblingSourceItem } from "@/lib/checklist/siblings";

export default async function ChecklistGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; groupId: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const { id, groupId } = await params;
  const { sub } = await searchParams;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("checklist_group_templates")
    .select("id, nome")
    .eq("id", groupId)
    .eq("ativo", true)
    .single();

  if (!group) notFound();

  const [
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
    { data: statuses, error: statusesError },
  ] = await Promise.all([
    supabase
      .from("checklist_item_templates")
      .select("id, subcategoria, nome, tipo, conjunto_opcao_id, unidade_medicao, qtd_pontos_medicao, grupo_replicacao")
      .eq("group_id", groupId),
    supabase
      .from("checklist_item_responses")
      .select("id, item_template_id, opcao_id, resposta_texto, resposta_data, observacao")
      .eq("inspection_id", id),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
  ]);

  if (itemsError || responsesError || statusesError) {
    console.error("checklist group data fetch failed", { itemsError, responsesError, statusesError });
  }

  const allItems = items ?? [];
  const allResponses = responses ?? [];
  const respondidoByItemId = new Map((statuses ?? []).map((s) => [s.item_template_id, s.respondido]));

  const subcategoriaBuckets = groupItemsBySubcategoria(
    allItems.map((i) => ({ id: i.id, subcategoria: i.subcategoria, nome: i.nome })),
    statuses ?? []
  );
  const subcategoriaNames = subcategoriaBuckets.map((b) => b.subcategoria);
  const activeSubcategoria =
    sub === SEM_SUBCATEGORIA_PARAM ? null : sub && subcategoriaNames.includes(sub) ? sub : (subcategoriaNames[0] ?? null);

  const activeBucket = subcategoriaBuckets.find((b) => b.subcategoria === activeSubcategoria);
  const pendentes = activeBucket ? activeBucket.items.filter((i) => !i.respondido).length : 0;
  const total = activeBucket?.items.length ?? 0;

  const activeItems = allItems.filter((i) => i.subcategoria === activeSubcategoria);

  const conjuntoIds = Array.from(
    new Set(activeItems.map((i) => i.conjunto_opcao_id).filter((v): v is string => v !== null))
  );
  const medicaoResponseIds = allResponses
    .filter((r) => activeItems.some((i) => i.id === r.item_template_id && i.tipo === "medicao"))
    .map((r) => r.id);
  const groupResponseIds = allResponses.map((r) => r.id);

  const [
    { data: opcoes, error: opcoesError },
    { data: medicaoResultados, error: resultadosError },
    { data: medicaoValores, error: valoresError },
    { data: photos, error: photosError },
  ] = await Promise.all([
    conjuntoIds.length > 0
      ? supabase
          .from("opcoes")
          .select("id, conjunto_id, label, ordem, exige_foto")
          .in("conjunto_id", conjuntoIds)
          .order("ordem")
      : Promise.resolve({ data: [] as TableOpcao[], error: null }),
    medicaoResponseIds.length > 0
      ? supabase.from("medicoes_resultado").select("item_response_id, resultado").in("item_response_id", medicaoResponseIds)
      : Promise.resolve({ data: [] as TableMedicaoResultado[], error: null }),
    medicaoResponseIds.length > 0
      ? supabase.from("medicoes").select("item_response_id, valores").in("item_response_id", medicaoResponseIds)
      : Promise.resolve({ data: [] as TableMedicaoValores[], error: null }),
    groupResponseIds.length > 0
      ? supabase
          .from("photos")
          .select("id, url, item_response_id")
          .eq("contexto", "item")
          .in("item_response_id", groupResponseIds)
      : Promise.resolve({ data: [] as TablePhoto[], error: null }),
  ]);

  if (opcoesError || resultadosError || valoresError || photosError) {
    console.error("checklist group extra data fetch failed", { opcoesError, resultadosError, valoresError, photosError });
  }

  const tableItems: TableItem[] = activeItems.map((i) => ({
    id: i.id,
    nome: i.nome,
    tipo: i.tipo,
    conjunto_opcao_id: i.conjunto_opcao_id,
    unidade_medicao: i.unidade_medicao,
    qtd_pontos_medicao: i.qtd_pontos_medicao,
    grupo_replicacao: i.grupo_replicacao,
  }));

  const tableResponses: TableResponse[] = allResponses.map((r) => ({
    id: r.id,
    item_template_id: r.item_template_id,
    opcao_id: r.opcao_id,
    resposta_texto: r.resposta_texto,
    resposta_data: r.resposta_data,
    observacao: r.observacao,
    respondido: respondidoByItemId.get(r.item_template_id) ?? false,
  }));

  const allGroupItemsForSiblings: SiblingSourceItem[] = allItems.map((i) => ({
    id: i.id,
    nome: i.nome,
    grupo_replicacao: i.grupo_replicacao,
  }));

  const subParam = activeSubcategoria ?? SEM_SUBCATEGORIA_PARAM;
  const pageUrl = `/inspections/${id}/checklist/${groupId}?sub=${encodeURIComponent(subParam)}`;

  return (
    <div className="stack">
      <h1>{group.nome}</h1>
      <h2>
        {activeSubcategoria ?? "Sem subcategoria"} — {pendentes} pendente{pendentes === 1 ? "" : "s"} de {total}
      </h2>
      <ChecklistItemTable
        inspectionId={id}
        items={tableItems}
        allGroupItems={allGroupItemsForSiblings}
        responses={tableResponses}
        opcoes={opcoes ?? []}
        photos={photos ?? []}
        medicaoResultados={medicaoResultados ?? []}
        medicaoValores={medicaoValores ?? []}
        pageUrl={pageUrl}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts"`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — this is the task that fully wires everything together; `tsc`/build should also be checked here since this file is the first to actually import `checklist-item-table.tsx` in a live route.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/page.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts"
git commit -m "feat: rewrite checklist group page to render ChecklistItemTable"
```

---

### Task 7: `PRODUCT.md` — update the stale dense-UI anti-reference

**Files:**
- Modify: `PRODUCT.md`

**Interfaces:** none — doc-only change, no code consumes this.

**Why:** design doc §2 flags this as a real gap and says fixing it is part of this piece ("Atualizar essa frase faz parte desta peça (task de doc, não de código)"): the anti-reference at line 26 still says "Nada de UI densa demais tipo planilha corporativa", but Tasks 1-6 of this same plan ship exactly that — a dense per-row table — because the Fase 2.8 brainstorming already revisited this call (técnico uses density on tablet, explicit decision). Leaving the line as-is would make `PRODUCT.md` contradict the shipped UI.

No test — pure doc change.

- [ ] **Step 1: Replace the stale anti-reference line**

In `PRODUCT.md`, under `## Anti-references`, replace:

```
- Nada de UI densa demais tipo planilha corporativa — apesar do volume de itens (320), a navegação precisa ser óbvia, não uma tabela cheia de campos.
```

with:

```
- Densidade é aceitável quando serve à tarefa: a tabela por subcategoria (Peça 3, Fase 2.8) usa uma linha por item porque o técnico opera em tablet e precisa ver/editar vários itens sem trocar de tela — o que continua proibido é densidade decorativa ou sem hierarquia clara.
```

- [ ] **Step 2: Commit**

```bash
git add PRODUCT.md
git commit -m "docs: update PRODUCT.md anti-reference to match Peça 3's dense table decision"
```

---

## After all 7 tasks land

Design doc §6 requires a mandatory end-to-end browser check (técnico test account, a real group with a mix of `escolha`/`texto`/`data`/`medicao` items) before this piece is considered done — no task above substitutes for it. Verify at minimum: nested sidebar shows subcategoria counts and links correctly; `escolha` segmented control saves and re-renders with the new state; `texto`/`data` inputs save on blur; the `medicao` badge opens `ItemMedicaoForm` in a dialog and reflects `ok`/`atencao`/`critico` after saving; the família icon appears only for `grupo_replicacao` + respondido items and opens `BatchApplyPanel` with the right siblings; RF-16 (foto obrigatória) still blocks saves inline without breaking other rows. Then follow the project's standard gate (`docs/ROADMAP.md`, final section): `requesting-code-review` → `ponytail-review` → `verify` → `verification-before-completion` → `finishing-a-development-branch`. `security-review` does not apply (no auth/RLS changes).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
