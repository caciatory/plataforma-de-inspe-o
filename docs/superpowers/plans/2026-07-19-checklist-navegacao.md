# Navegação do Checklist (RF-09–12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao técnico uma tela de checklist navegável — grupos na lateral com indicador de progresso, itens de cada grupo agrupados por subcategoria — substituindo o placeholder deixado pela Fase 1a em `/inspections/[id]`.

**Architecture:** Rotas Next.js App Router aninhadas sob `app/(app)/inspections/[id]/checklist/`, com um `layout.tsx` compartilhado (barra lateral) que não remonta ao trocar de grupo. Toda a lógica de "o que está pendente" e "como agrupar por subcategoria" fica isolada em funções puras testáveis (`lib/checklist/progress.ts`). As páginas (`page.tsx`, `[groupId]/page.tsx`) são funções assíncronas simples — busca dados, decide `redirect`/`notFound`/renderiza — testadas do mesmo jeito que `actions.ts` já é (mock de `@/lib/supabase/server` e `next/navigation`, chamando a função diretamente, sem precisar montar JSX). Só `layout.tsx` fica sem teste próprio, mesmo padrão de `app/(app)/inspections/[id]/page.tsx` (fetch-e-renderiza puro, sem branch de lógica que valha a pena isolar).

**Tech Stack:** Next.js 15 App Router (Server Components), Supabase JS client (`@/lib/supabase/server`), Vitest (mock de módulo, sem `@testing-library/react` — nenhuma task desta fase precisa renderizar/interagir com JSX em teste).

## Global Constraints

- Escopo é só RF-09, RF-10, RF-11, RF-12. RF-23/24 (finalizar), RF-13–22 (preencher item) e o filtro `aplica_stand` (RF-63) ficam fora — ver `docs/superpowers/specs/2026-07-19-checklist-navegacao-design.md` §1.
- Nenhuma policy de RLS nova — as existentes (migration `00009`) já cobrem SELECT de `checklist_group_templates`, `checklist_item_templates` (qualquer autenticado) e `checklist_item_responses` (dono da inspeção ou admin).
- Não existe coluna `ordem` em `checklist_item_templates` — ordenação dentro de um grupo é por `subcategoria` (asc) e depois `nome` (asc).
- Grupo com 0 itens conta como `✅` (0 pendentes de 0 totais), não como erro.
- A rota-índice (`/inspections/[id]/checklist`) redireciona automaticamente pro grupo de menor `ordem`.
- `groupId` inexistente ou de grupo com `ativo = false` → `notFound()`.
- Item na lista do grupo é uma linha de leitura — sem link, sem `onClick`.

---

### Task 1: Lógica pura de progresso e agrupamento

**Files:**
- Create: `lib/checklist/progress.ts`
- Test: `lib/checklist/progress.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependência externa).
- Produces (usado pelas Tasks 2 e 4):
  - `type ItemResponseStatus = "pendente" | "respondido" | "NF"`
  - `type GroupTemplate = { id: string; ordem: number; nome: string }`
  - `type ItemTemplate = { id: string; group_id: string }`
  - `type ItemResponseRow = { item_template_id: string; status: ItemResponseStatus }`
  - `type GroupProgress = { id: string; ordem: number; nome: string; pendentes: number; total: number }`
  - `type ItemTemplateDetail = { id: string; subcategoria: string | null; nome: string }`
  - `type ChecklistItemStatus = { id: string; nome: string; status: ItemResponseStatus }`
  - `type SubcategoriaGroup = { subcategoria: string | null; items: ChecklistItemStatus[] }`
  - `function isItemPending(status: ItemResponseStatus | undefined): boolean`
  - `function computeGroupProgress(groups: GroupTemplate[], items: ItemTemplate[], responses: ItemResponseRow[]): GroupProgress[]`
  - `function groupItemsBySubcategoria(items: ItemTemplateDetail[], responses: ItemResponseRow[]): SubcategoriaGroup[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/checklist/progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isItemPending,
  computeGroupProgress,
  groupItemsBySubcategoria,
  type GroupTemplate,
  type ItemTemplate,
  type ItemResponseRow,
  type ItemTemplateDetail,
} from "./progress";

describe("isItemPending", () => {
  it("treats a missing response as pending", () => {
    expect(isItemPending(undefined)).toBe(true);
  });

  it("treats status='pendente' as pending", () => {
    expect(isItemPending("pendente")).toBe(true);
  });

  it("treats status='respondido' as not pending", () => {
    expect(isItemPending("respondido")).toBe(false);
  });

  it("treats status='NF' as not pending", () => {
    expect(isItemPending("NF")).toBe(false);
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
    const responses: ItemResponseRow[] = [{ item_template_id: "i1", status: "respondido" }];
    const result = computeGroupProgress(groups, items, responses);
    expect(result.find((g) => g.id === "g1")).toEqual({
      id: "g1",
      ordem: 1,
      nome: "Exterior",
      pendentes: 1,
      total: 2,
    });
  });

  it("does not count NF or respondido items as pending", () => {
    const responses: ItemResponseRow[] = [
      { item_template_id: "i1", status: "respondido" },
      { item_template_id: "i2", status: "NF" },
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

  it("defaults an item's status to pendente when it has no response row", () => {
    const result = groupItemsBySubcategoria([items[0]], []);
    expect(result[0].items[0].status).toBe("pendente");
  });

  it("uses the response's status when one exists", () => {
    const result = groupItemsBySubcategoria([items[0]], [{ item_template_id: "i1", status: "NF" }]);
    expect(result[0].items[0].status).toBe("NF");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/checklist/progress.test.ts`
Expected: FAIL — `Cannot find module './progress'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/checklist/progress.ts`:

```ts
export type ItemResponseStatus = "pendente" | "respondido" | "NF";

export type GroupTemplate = { id: string; ordem: number; nome: string };
export type ItemTemplate = { id: string; group_id: string };
export type ItemResponseRow = { item_template_id: string; status: ItemResponseStatus };
export type GroupProgress = { id: string; ordem: number; nome: string; pendentes: number; total: number };

export function isItemPending(status: ItemResponseStatus | undefined): boolean {
  return status === undefined || status === "pendente";
}

export function computeGroupProgress(
  groups: GroupTemplate[],
  items: ItemTemplate[],
  responses: ItemResponseRow[]
): GroupProgress[] {
  const statusByItemId = new Map(responses.map((r) => [r.item_template_id, r.status]));
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
      const pendentes = groupItems.filter((item) => isItemPending(statusByItemId.get(item.id))).length;
      return { id: group.id, ordem: group.ordem, nome: group.nome, pendentes, total: groupItems.length };
    });
}

export type ItemTemplateDetail = { id: string; subcategoria: string | null; nome: string };
export type ChecklistItemStatus = { id: string; nome: string; status: ItemResponseStatus };
export type SubcategoriaGroup = { subcategoria: string | null; items: ChecklistItemStatus[] };

export function groupItemsBySubcategoria(
  items: ItemTemplateDetail[],
  responses: ItemResponseRow[]
): SubcategoriaGroup[] {
  const statusByItemId = new Map(responses.map((r) => [r.item_template_id, r.status]));
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
      status: statusByItemId.get(item.id) ?? "pendente",
    });
  }

  return order.map((subcategoria) => ({ subcategoria, items: bucket.get(subcategoria)! }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/checklist/progress.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/checklist/progress.ts lib/checklist/progress.test.ts
git commit -m "feat: add pure checklist progress/subcategoria grouping logic (RF-10, RF-11, RF-09)"
```

---

### Task 2: Layout da checklist (barra lateral)

**Files:**
- Create: `app/(app)/inspections/[id]/checklist/layout.tsx`

**Interfaces:**
- Consumes: `computeGroupProgress`, `type GroupProgress` from `@/lib/checklist/progress` (Task 1); `createClient` from `@/lib/supabase/server`.
- Produces: renders `<nav>` com um `<Link href="/inspections/{id}/checklist/{groupId}">` por grupo — a Task 3 e a Task 4 são renderizadas dentro do `{children}` deste layout.

- [ ] **Step 1: Write the layout**

Create `app/(app)/inspections/[id]/checklist/layout.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress } from "@/lib/checklist/progress";

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
    supabase.from("checklist_item_templates").select("id, group_id"),
    supabase.from("checklist_item_responses").select("item_template_id, status").eq("inspection_id", id),
  ]);

  if (groupsError || itemsError || responsesError) {
    console.error("checklist layout data fetch failed", { groupsError, itemsError, responsesError });
  }

  const progress = computeGroupProgress(groups ?? [], items ?? [], responses ?? []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav style={{ width: 260, borderRight: "1px solid #ccc", padding: "1rem" }}>
        <h2>Checklist</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {progress.map((group) => (
            <li key={group.id}>
              <Link href={`/inspections/${id}/checklist/${group.id}`}>
                {group.pendentes === 0 ? "✅" : `⚠️ (${group.pendentes})`} {group.nome}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ flex: 1, padding: "1rem" }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (o build completo só será validado na Task 5, depois de todas as rotas existirem — `[groupId]` ainda não existe, então `npm run build` falharia aqui por rota incompleta; `tsc --noEmit` sozinho já cobre erros de tipo deste arquivo).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/layout.tsx"
git commit -m "feat: add checklist sidebar layout with per-group progress (RF-10, RF-11)"
```

---

### Task 3: Rota-índice (redireciona pro primeiro grupo)

**Files:**
- Create: `app/(app)/inspections/[id]/checklist/page.tsx`
- Test: `app/(app)/inspections/[id]/checklist/page.test.ts`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`.
- Produces: nada consumido por outras tasks — é uma folha da árvore de rotas.

- [ ] **Step 1: Write the failing test**

Create `app/(app)/inspections/[id]/checklist/page.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  order: vi.fn(() => query),
  limit: vi.fn(() => query),
  maybeSingle: vi.fn(),
};
const from = vi.fn(() => query);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({ redirect, notFound }));

beforeEach(() => {
  from.mockClear();
  query.select.mockClear();
  query.eq.mockClear();
  query.order.mockClear();
  query.limit.mockClear();
  query.maybeSingle.mockReset();
  redirect.mockClear();
  notFound.mockClear();
});

describe("ChecklistIndexPage", () => {
  it("redirects to the first active group by ordem", async () => {
    query.maybeSingle.mockResolvedValue({
      data: { id: "22222222-2222-2222-2222-222222222222" },
      error: null,
    });
    const { default: ChecklistIndexPage } = await import("./page");

    await expect(
      ChecklistIndexPage({ params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) })
    ).rejects.toThrow(
      "REDIRECT:/inspections/11111111-1111-1111-1111-111111111111/checklist/22222222-2222-2222-2222-222222222222"
    );
    expect(query.eq).toHaveBeenCalledWith("ativo", true);
    expect(query.order).toHaveBeenCalledWith("ordem");
  });

  it("calls notFound when there is no active group", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { default: ChecklistIndexPage } = await import("./page");

    await expect(
      ChecklistIndexPage({ params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/inspections/[id]/checklist/page.test.ts"`
Expected: FAIL — `Cannot find module './page'` (arquivo ainda não existe).

- [ ] **Step 3: Write the implementation**

Create `app/(app)/inspections/[id]/checklist/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ChecklistIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: firstGroup, error } = await supabase
    .from("checklist_group_templates")
    .select("id")
    .eq("ativo", true)
    .order("ordem")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("checklist index group lookup failed", error);
  }

  if (!firstGroup) notFound();

  redirect(`/inspections/${id}/checklist/${firstGroup.id}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/inspections/[id]/checklist/page.test.ts"`
Expected: PASS — 2 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/page.tsx" "app/(app)/inspections/[id]/checklist/page.test.ts"
git commit -m "feat: redirect checklist index to the first active group (RF-12)"
```

---

### Task 4: Painel de grupo (itens por subcategoria)

**Files:**
- Create: `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts`

**Interfaces:**
- Consumes: `groupItemsBySubcategoria` from `@/lib/checklist/progress` (Task 1); `createClient` from `@/lib/supabase/server`.
- Produces: nada consumido por outras tasks — folha da árvore de rotas.

- [ ] **Step 1: Write the failing test**

Create `app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts`. Cobre só o caso `notFound()` — o mapeamento de itens/subcategoria já está coberto pelos testes de `groupItemsBySubcategoria` na Task 1; testar a renderização JSX de novo aqui seria testar a mesma lógica duas vezes, sem precedente no resto do app (`[id]/page.tsx` também não tem teste de renderização):

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
      })
    ).rejects.toThrow("NOT_FOUND");
    expect(query.eq).toHaveBeenCalledWith("ativo", true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts"`
Expected: FAIL — `Cannot find module './page'` (arquivo ainda não existe).

- [ ] **Step 3: Write the implementation**

Create `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
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
    supabase.from("checklist_item_responses").select("item_template_id, status").eq("inspection_id", id),
  ]);

  if (itemsError || responsesError) {
    console.error("checklist group data fetch failed", { itemsError, responsesError });
  }

  const subcategorias = groupItemsBySubcategoria(items ?? [], responses ?? []);

  return (
    <div>
      <h1>{group.nome}</h1>
      {subcategorias.map((bucket) => (
        <section key={bucket.subcategoria ?? "sem-subcategoria"}>
          {bucket.subcategoria && <h2>{bucket.subcategoria}</h2>}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {bucket.items.map((item) => (
              <li key={item.id}>
                {item.status === "pendente" ? "⚠️" : item.status === "NF" ? "➖" : "✅"} {item.nome}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts"`
Expected: PASS — 1 test.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/page.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/page.test.ts"
git commit -m "feat: add checklist group panel with items grouped by subcategoria (RF-09)"
```

---

### Task 5: Ligar a partir da página de resumo, verificação final

**Files:**
- Modify: `app/(app)/inspections/[id]/page.tsx:31-33`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por outras tasks — fecha o fluxo (RF-06 → resumo → checklist).

- [ ] **Step 1: Substituir o placeholder por um link real**

Em `app/(app)/inspections/[id]/page.tsx`, trocar:

```tsx
      <p>
        <em>A checklist será implementada numa fase seguinte.</em>
      </p>
```

por:

```tsx
      <p>
        <Link href={`/inspections/${id}/checklist`}>Ir para a checklist</Link>
      </p>
```

E adicionar o import no topo do arquivo (junto aos outros imports):

```tsx
import Link from "next/link";
```

Arquivo completo esperado após a mudança:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function InspectionSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: inspection } = await supabase
    .from("inspections")
    .select("*, vehicle_data(*), client_data(*)")
    .eq("id", id)
    .single();

  if (!inspection) notFound();

  return (
    <main>
      <h1>Inspeção criada</h1>
      <p>Matrícula: {inspection.vehicle_data?.matricula}</p>
      <p>
        Veículo: {inspection.vehicle_data?.marca} {inspection.vehicle_data?.modelo}
      </p>
      <p>
        Cliente: {inspection.client_data?.nome_solicitante} ({inspection.tipo_cliente})
      </p>
      <p>Objetivo: {inspection.objetivo}</p>
      <p>Estado: {inspection.status}</p>
      <p>
        <Link href={`/inspections/${id}/checklist`}>Ir para a checklist</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Rodar a suíte inteira e o build**

Run: `npm test`
Expected: PASS — todos os testes existentes + os 9 novos de `lib/checklist/progress.test.ts`.

Run: `npm run build`
Expected: build completo sem erros — agora que `[groupId]/page.tsx` existe, o Next consegue resolver a árvore de rotas inteira (`checklist/`, `checklist/[groupId]/`).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/inspections/[id]/page.tsx"
git commit -m "feat: link inspection summary to the new checklist navigation"
```

---

## Depois do plano

Esta fase **tem UI** — pela regra de transição em `docs/ROADMAP.md`, o gate de fechamento inclui `verify` (dirigir o fluxo real no navegador: criar inspeção → clicar "Ir para a checklist" → navegar entre pelo menos 2 grupos → conferir que os indicadores ✅/⚠️ batem com o que existe no banco) além de `requesting-code-review`, `verification-before-completion` e `finishing-a-development-branch`. Não tem código/abstração nova o suficiente pra justificar `ponytail-review` além da revisão normal, e não toca auth/RLS/acesso — `security-review` não se aplica aqui.
