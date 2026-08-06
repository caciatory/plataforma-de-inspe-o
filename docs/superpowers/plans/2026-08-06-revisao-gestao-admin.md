# Fase 5, Sub-Projetos 2+3 (Revisão e Gestão do Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a role-aware app experience — a landing area separate from the técnico's, a list of every inspection with search/filter/sort, the ability to approve/return/cancel/edit any inspection with an audit trail, and a way to create/deactivate técnico accounts — closing RF-31 to RF-37 and RF-57 to RF-62 in one cycle.

**Architecture:** Reuses the existing técnico checklist UI for admin edits (role-aware `isInspectionEditable`) instead of building a parallel editor. A single `getCurrentUser()` helper (id + role) becomes the one place every page/action asks "who is this and what can they do." Admin-only write paths (approve/return/cancel/técnico management) live as new Server Actions co-located with the pages that use them, following the same `useActionState` + native `<dialog>` pattern already used by `SubmitInspectionPanel`.

**Tech Stack:** Next.js 15 App Router (Server Components + Server Actions), Supabase (`@supabase/ssr` for the request-scoped client, `@supabase/supabase-js` directly for the service-role admin client), Vitest + Testing Library, TypeScript.

## Global Constraints

- No new RLS migrations needed — `is_admin()` already bypasses every relevant policy (`inspections`, `checklist_item_responses`, `vehicle_data`, `photos`, `review_events`, `audit_log_entries`) and the status-transition trigger (`00045_inspection_status_transition_guard.sql`) already exempts admin.
- `docs/superpowers/specs/2026-08-06-revisao-gestao-admin-design.md` is the source of truth for product decisions — this plan implements it, doesn't re-decide it.
- Every task must leave `npm test` and `npx tsc --noEmit` green. Commit after each task.
- Follow existing conventions: Server Actions return a `{ status: "idle" | "error" | "success"; message?: string }` union consumed via `useActionState`; client components call `router.refresh()` in a `useEffect` on success (never during render); dialogs are native `<dialog className="dialog-panel">`, never a from-scratch modal.
- `SUPABASE_SERVICE_ROLE_KEY` is not yet configured in the dev environment — Task 4 and Task 12 need it added to `.env.local` (from the Supabase dashboard → Project Settings → API) before they can be manually verified end-to-end. This doesn't block writing/unit-testing the code.

---

### Task 1: `getCurrentUser()` — the shared role/identity helper

**Files:**
- Create: `lib/auth/session.ts`
- Test: `lib/auth/session.test.ts`

**Interfaces:**
- Produces: `getCurrentUser(): Promise<{ id: string; role: "tecnico" | "admin" } | null>` — every later task imports this from `@/lib/auth/session`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/auth/session.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const usersQuery: any = { select: vi.fn(() => usersQuery), eq: vi.fn(() => usersQuery), single: vi.fn() };
const from = vi.fn((table: string) => {
  if (table === "users") return usersQuery;
  throw new Error(`unexpected table ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));

beforeEach(() => {
  getUser.mockReset();
  usersQuery.select.mockClear();
  usersQuery.eq.mockClear();
  usersQuery.single.mockReset();
});

describe("getCurrentUser", () => {
  it("returns null when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { getCurrentUser } = await import("./session");

    expect(await getCurrentUser()).toBeNull();
  });

  it("returns id + role for an authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    usersQuery.single.mockResolvedValue({ data: { role: "admin" } });
    const { getCurrentUser } = await import("./session");

    expect(await getCurrentUser()).toEqual({ id: "user-1", role: "admin" });
    expect(usersQuery.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("returns null when the auth user has no matching users row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-2" } } });
    usersQuery.single.mockResolvedValue({ data: null });
    const { getCurrentUser } = await import("./session");

    expect(await getCurrentUser()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: FAIL — `Cannot find module './session'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth/session.ts
import { createClient } from "@/lib/supabase/server";

export type UserRole = "tecnico" | "admin";
export type CurrentUser = { id: string; role: UserRole };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!data) return null;

  return { id: user.id, role: data.role as UserRole };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts
git commit -m "feat: add getCurrentUser() shared role/identity helper"
```

---

### Task 2: Role-aware `isInspectionEditable` + wire into the 3 existing call sites

**Files:**
- Modify: `lib/inspection/status.ts`
- Modify: `lib/inspection/status.test.ts`
- Modify: `app/(app)/inspections/[id]/checklist/layout.tsx`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`
- Modify: `app/(app)/inspections/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser()` from Task 1.
- Produces: `isInspectionEditable(status: InspectionStatus, role: UserRole): boolean` — signature change, breaks the 3 call sites above until they're updated in this same task.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/inspection/status.test.ts (replace the whole file)
import { describe, it, expect } from "vitest";
import { isInspectionEditable } from "./status";

describe("isInspectionEditable", () => {
  it("técnico: returns true for rascunho", () => {
    expect(isInspectionEditable("rascunho", "tecnico")).toBe(true);
  });

  it("técnico: returns true for devolvida", () => {
    expect(isInspectionEditable("devolvida", "tecnico")).toBe(true);
  });

  it("técnico: returns false for aguardando_aprovacao, aprovada, cancelada", () => {
    expect(isInspectionEditable("aguardando_aprovacao", "tecnico")).toBe(false);
    expect(isInspectionEditable("aprovada", "tecnico")).toBe(false);
    expect(isInspectionEditable("cancelada", "tecnico")).toBe(false);
  });

  it("admin: always returns true, regardless of status", () => {
    expect(isInspectionEditable("rascunho", "admin")).toBe(true);
    expect(isInspectionEditable("aguardando_aprovacao", "admin")).toBe(true);
    expect(isInspectionEditable("devolvida", "admin")).toBe(true);
    expect(isInspectionEditable("aprovada", "admin")).toBe(true);
    expect(isInspectionEditable("cancelada", "admin")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/inspection/status.test.ts`
Expected: FAIL — `isInspectionEditable` still only takes one argument (TS error surfaces here first if you run `tsc`; the test itself fails on the wrong boolean for the admin cases since the old implementation ignores the second argument entirely).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/inspection/status.ts (replace the whole file)
// Espelha a condicao de public.owns_editable_inspection() (RLS,
// supabase/migrations/00008_rls_helpers_and_core.sql) para o tecnico -- e o
// bypass de is_admin() nas mesmas policies para o admin (owns_editable_inspection
// nunca entra em jogo quando quem chama e admin). Nao substitui a RLS (que
// continua sendo o bloqueio real), so evita que a UI deixe o usuario bater
// num erro de permissao sem explicacao.

export type InspectionStatus = "rascunho" | "aguardando_aprovacao" | "devolvida" | "aprovada" | "cancelada";
export type UserRole = "tecnico" | "admin";

export function isInspectionEditable(status: InspectionStatus, role: UserRole): boolean {
  if (role === "admin") return true;
  return status === "rascunho" || status === "devolvida";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/inspection/status.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Update the 3 call sites**

`app/(app)/inspections/[id]/checklist/layout.tsx` — add the import and pass role through:

```tsx
import { getCurrentUser } from "@/lib/auth/session";
// ...
const { data: inspection } = await supabase.from("inspections").select("id, status").eq("id", id).single();

if (!inspection) notFound();

const currentUser = await getCurrentUser();
const editable = currentUser
  ? isInspectionEditable(inspection.status as InspectionStatus, currentUser.role)
  : false;
```

`app/(app)/inspections/[id]/checklist/[groupId]/page.tsx` — same pattern:

```tsx
import { getCurrentUser } from "@/lib/auth/session";
// ...
const { data: inspection } = await supabase.from("inspections").select("status").eq("id", id).single();
const currentUser = await getCurrentUser();
const editable =
  inspection && currentUser ? isInspectionEditable(inspection.status as InspectionStatus, currentUser.role) : false;
```

`app/(app)/inspections/[id]/page.tsx` — pass role through, **and** scope the técnico-only `SubmitInspectionPanel` to técnicos specifically (admin's `editable` is now always `true`, but admin approving/returning is a different panel built in Task 8 — the técnico submit flow must not show for admin):

```tsx
import { getCurrentUser } from "@/lib/auth/session";
// ...
const status = inspection.status as InspectionStatus;
const currentUser = await getCurrentUser();
const editable = currentUser ? isInspectionEditable(status, currentUser.role) : false;
// ... (progress-loading block condition stays `if (editable)` — unchanged)
```

and further down:

```tsx
{editable && currentUser?.role === "tecnico" && (
  <SubmitInspectionPanel
    inspectionId={id}
    label={status === "devolvida" ? "Reenviar para aprovação" : "Finalizar inspeção"}
    progress={progress}
  />
)}
```

- [ ] **Step 6: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean — no test in the existing suite asserts the old single-argument call, since `checklist-item-table.test.tsx` and `submit-inspection-panel.test.tsx` don't call `isInspectionEditable` directly.

- [ ] **Step 7: Commit**

```bash
git add lib/inspection/status.ts lib/inspection/status.test.ts \
  "app/(app)/inspections/[id]/checklist/layout.tsx" \
  "app/(app)/inspections/[id]/checklist/[groupId]/page.tsx" \
  "app/(app)/inspections/[id]/page.tsx"
git commit -m "feat: make isInspectionEditable role-aware (admin always editable)"
```

---

### Task 3: Técnico "Minhas Inspeções" list (`/inspections`)

**Files:**
- Create: `app/(app)/inspections/page.tsx`
- Create: `app/(app)/inspections/inspections-list.test.tsx` (tests the pure row-shaping logic via a small exported helper, not the async Server Component itself — this codebase's established convention, see `lib/checklist/progress.ts`, is to keep Server Component pages thin and put anything worth unit-testing in a plain function)
- Create: `lib/inspection/list.ts`

**Interfaces:**
- Consumes: nothing new (RLS already scopes `inspections` to `tecnico_id = auth.uid()` for a técnico caller).
- Produces: `buildTecnicoInspectionRows(inspections, latestDevolucaoByInspectionId)` — pure function, used by the page.

- [ ] **Step 1: Write the failing test**

```ts
// lib/inspection/list.test.ts
import { describe, it, expect } from "vitest";
import { buildTecnicoInspectionRows } from "./list";

describe("buildTecnicoInspectionRows", () => {
  it("marks devolvida inspections and attaches the motivo", () => {
    const rows = buildTecnicoInspectionRows(
      [
        { id: "insp-1", status: "rascunho", data_abertura: "2026-08-01", vehicle_data: { matricula: "AA-11-BB" } },
        { id: "insp-2", status: "devolvida", data_abertura: "2026-08-02", vehicle_data: { matricula: "CC-22-DD" } },
      ],
      new Map([["insp-2", "Faltou foto do pneu traseiro"]])
    );

    expect(rows).toEqual([
      { id: "insp-1", matricula: "AA-11-BB", status: "rascunho", dataAbertura: "2026-08-01", devolvida: false, motivo: null },
      {
        id: "insp-2",
        matricula: "CC-22-DD",
        status: "devolvida",
        dataAbertura: "2026-08-02",
        devolvida: true,
        motivo: "Faltou foto do pneu traseiro",
      },
    ]);
  });

  it("falls back to a dash when vehicle_data is missing", () => {
    const rows = buildTecnicoInspectionRows(
      [{ id: "insp-3", status: "rascunho", data_abertura: "2026-08-03", vehicle_data: null }],
      new Map()
    );
    expect(rows[0].matricula).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/inspection/list.test.ts`
Expected: FAIL — `Cannot find module './list'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/inspection/list.ts
import type { InspectionStatus } from "./status";

export type TecnicoInspectionRow = {
  id: string;
  matricula: string;
  status: InspectionStatus;
  dataAbertura: string;
  devolvida: boolean;
  motivo: string | null;
};

export function buildTecnicoInspectionRows(
  inspections: {
    id: string;
    status: InspectionStatus;
    data_abertura: string;
    vehicle_data: { matricula: string } | null;
  }[],
  latestDevolucaoByInspectionId: Map<string, string>
): TecnicoInspectionRow[] {
  return inspections.map((i) => ({
    id: i.id,
    matricula: i.vehicle_data?.matricula ?? "—",
    status: i.status,
    dataAbertura: i.data_abertura,
    devolvida: i.status === "devolvida",
    motivo: i.status === "devolvida" ? (latestDevolucaoByInspectionId.get(i.id) ?? null) : null,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/inspection/list.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Build the page**

```tsx
// app/(app)/inspections/page.tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buildTecnicoInspectionRows } from "@/lib/inspection/list";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  devolvida: "Devolvida",
  aprovada: "Aprovada",
  cancelada: "Cancelada",
};

export default async function MinhasInspecoesPage() {
  const supabase = await createClient();

  const { data: inspections, error: inspectionsError } = await supabase
    .from("inspections")
    .select("id, status, data_abertura, vehicle_data(matricula)")
    .order("data_abertura", { ascending: false });

  if (inspectionsError) {
    console.error("minhas inspecoes fetch failed", inspectionsError);
  }

  const devolvidaIds = (inspections ?? []).filter((i) => i.status === "devolvida").map((i) => i.id);

  const { data: devolucoes } =
    devolvidaIds.length > 0
      ? await supabase
          .from("review_events")
          .select("inspection_id, motivo, timestamp")
          .eq("tipo", "devolucao")
          .in("inspection_id", devolvidaIds)
          .order("timestamp", { ascending: false })
      : { data: [] as { inspection_id: string; motivo: string | null }[] };

  const latestDevolucaoByInspectionId = new Map<string, string>();
  for (const d of devolucoes ?? []) {
    if (!latestDevolucaoByInspectionId.has(d.inspection_id) && d.motivo) {
      latestDevolucaoByInspectionId.set(d.inspection_id, d.motivo);
    }
  }

  const rows = buildTecnicoInspectionRows(
    (inspections ?? []) as Parameters<typeof buildTecnicoInspectionRows>[0],
    latestDevolucaoByInspectionId
  );

  return (
    <main className="page">
      <div className="stack-row">
        <h1>Minhas Inspeções</h1>
        <Link href="/inspections/new" className="btn btn-primary">
          Nova inspeção
        </Link>
      </div>
      <ul className="item-list">
        {rows.map((r) => (
          <li key={r.id} className={r.devolvida ? "item-list__row item-list__row--warning" : "item-list__row"}>
            <Link href={`/inspections/${r.id}`}>
              <strong>{r.matricula}</strong> — {STATUS_LABEL[r.status] ?? r.status} — {r.dataAbertura}
              {r.motivo && <p className="hint">Motivo da devolução: {r.motivo}</p>}
            </Link>
          </li>
        ))}
        {rows.length === 0 && <p className="hint">Nenhuma inspeção ainda.</p>}
      </ul>
    </main>
  );
}
```

**Note:** `.item-list__row--warning` doesn't exist yet in `app/globals.css` — add it now, next to the existing `.item-list__row`:

```css
.item-list__row--warning {
  border-left: 3px solid var(--color-amber-500);
}
```

- [ ] **Step 6: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add lib/inspection/list.ts lib/inspection/list.test.ts "app/(app)/inspections/page.tsx" app/globals.css
git commit -m "feat: add técnico Minhas Inspeções list (RF-33 continuation link)"
```

---

### Task 4: `createAdminClient()` — service-role Supabase client

**Files:**
- Create: `lib/supabase/admin.ts`
- Test: `lib/supabase/admin.test.ts`

**Interfaces:**
- Produces: `createAdminClient(): SupabaseClient` — used by Task 12 (técnico management).

- [ ] **Step 1: Write the failing test**

```ts
// lib/supabase/admin.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAdminClient", () => {
  it("builds a client with the auth.admin API available", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    const { createAdminClient } = await import("./admin");

    const client = createAdminClient();

    expect(typeof client.auth.admin.createUser).toBe("function");
    expect(typeof client.auth.admin.updateUserById).toBe("function");
    expect(typeof client.auth.admin.listUsers).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/supabase/admin.test.ts`
Expected: FAIL — `Cannot find module './admin'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/supabase/admin.ts
// Service-role client — bypasses RLS entirely. Only ever used server-side,
// only for the Supabase Auth Admin API (auth.admin.*), never for table
// access (regular Server Actions already use the RLS-scoped client from
// ./server.ts for that). Never import this into a Client Component.
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/supabase/admin.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/admin.ts lib/supabase/admin.test.ts
git commit -m "feat: add service-role admin Supabase client (for técnico account management)"
```

---

### Task 5: Admin inspection list (`/admin`) — RF-57 a RF-59, RF-62

**Files:**
- Create: `app/(app)/admin/page.tsx`
- Create: `app/(app)/admin/inspections-table.tsx`
- Create: `lib/inspection/admin-list.ts`
- Test: `lib/inspection/admin-list.test.ts`

**Interfaces:**
- Produces: `buildAdminInspectionRows(...)` (pure row-shaping + "atrasada" logic), `AdminInspectionRow` type — consumed by `InspectionsTable`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/inspection/admin-list.test.ts
import { describe, it, expect } from "vitest";
import { buildAdminInspectionRows } from "./admin-list";

const inspections = [
  {
    id: "insp-1",
    status: "aguardando_aprovacao" as const,
    tipo_cliente: "particular" as const,
    data_abertura: "2026-08-01",
    vehicle_data: { matricula: "AA-11-BB", marca: "Toyota", modelo: "Corolla" },
    users: { nome: "Técnico Um" },
  },
  {
    id: "insp-2",
    status: "aprovada" as const,
    tipo_cliente: "stand" as const,
    data_abertura: "2026-08-01",
    vehicle_data: { matricula: "CC-22-DD", marca: "Honda", modelo: "Civic" },
    users: { nome: "Técnico Dois" },
  },
];
const scores = [{ inspection_id: "insp-1", nota_geral: 7.5, classificacao: "B" as const }];

describe("buildAdminInspectionRows", () => {
  it("attaches nota/classificação from the score map, null when absent", () => {
    const rows = buildAdminInspectionRows(inspections, scores, "2026-08-06");
    expect(rows[0].nota).toBe(7.5);
    expect(rows[0].classificacao).toBe("B");
    expect(rows[1].nota).toBeNull();
  });

  it("marks as atrasada when opened before today and not finalized/cancelled", () => {
    const rows = buildAdminInspectionRows(inspections, scores, "2026-08-06");
    expect(rows[0].atrasada).toBe(true); // aguardando_aprovacao, aberta ontem
    expect(rows[1].atrasada).toBe(false); // aprovada, nunca atrasada
  });

  it("does not mark as atrasada when opened today", () => {
    const rows = buildAdminInspectionRows(inspections, scores, "2026-08-01");
    expect(rows[0].atrasada).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/inspection/admin-list.test.ts`
Expected: FAIL — `Cannot find module './admin-list'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/inspection/admin-list.ts
import type { InspectionStatus } from "./status";

export type AdminInspectionRow = {
  id: string;
  matricula: string;
  marcaModelo: string;
  tecnicoNome: string;
  status: InspectionStatus;
  tipoCliente: "particular" | "stand";
  nota: number | null;
  classificacao: string | null;
  dataAbertura: string;
  atrasada: boolean;
};

export function buildAdminInspectionRows(
  inspections: {
    id: string;
    status: InspectionStatus;
    tipo_cliente: "particular" | "stand";
    data_abertura: string;
    vehicle_data: { matricula: string; marca: string; modelo: string } | null;
    users: { nome: string } | null;
  }[],
  scores: { inspection_id: string; nota_geral: number; classificacao: string }[],
  today: string
): AdminInspectionRow[] {
  const scoreByInspectionId = new Map(scores.map((s) => [s.inspection_id, s]));

  return inspections.map((i) => {
    const score = scoreByInspectionId.get(i.id);
    return {
      id: i.id,
      matricula: i.vehicle_data?.matricula ?? "—",
      marcaModelo: `${i.vehicle_data?.marca ?? ""} ${i.vehicle_data?.modelo ?? ""}`.trim() || "—",
      tecnicoNome: i.users?.nome ?? "—",
      status: i.status,
      tipoCliente: i.tipo_cliente,
      nota: score?.nota_geral ?? null,
      classificacao: score?.classificacao ?? null,
      dataAbertura: i.data_abertura,
      atrasada: i.data_abertura < today && i.status !== "aprovada" && i.status !== "cancelada",
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/inspection/admin-list.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the client table component (search/filter/sort)**

```tsx
// app/(app)/admin/inspections-table.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminInspectionRow } from "@/lib/inspection/admin-list";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  devolvida: "Devolvida",
  aprovada: "Aprovada",
  cancelada: "Cancelada",
};

type SortKey = "data" | "nota" | "status";

export function InspectionsTable({ rows }: { rows: AdminInspectionRow[] }) {
  const [query, setQuery] = useState("");
  const [tecnicoFiltro, setTecnicoFiltro] = useState("");
  const [tipoClienteFiltro, setTipoClienteFiltro] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("data");

  const tecnicos = Array.from(new Set(rows.map((r) => r.tecnicoNome))).sort();

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = q === "" || r.matricula.toLowerCase().includes(q) || r.marcaModelo.toLowerCase().includes(q);
    const matchesTecnico = tecnicoFiltro === "" || r.tecnicoNome === tecnicoFiltro;
    const matchesTipoCliente = tipoClienteFiltro === "" || r.tipoCliente === tipoClienteFiltro;
    return matchesQuery && matchesTecnico && matchesTipoCliente;
  });

  const sorted = filtered.slice().sort((a, b) => {
    if (sortKey === "nota") return (b.nota ?? -1) - (a.nota ?? -1);
    if (sortKey === "status") return a.status.localeCompare(b.status);
    return b.dataAbertura.localeCompare(a.dataAbertura);
  });

  return (
    <div className="stack">
      <div className="stack-row">
        <input
          className="input"
          placeholder="Buscar por matrícula ou modelo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar"
        />
        <select className="input" value={tecnicoFiltro} onChange={(e) => setTecnicoFiltro(e.target.value)} aria-label="Filtrar por técnico">
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={tipoClienteFiltro}
          onChange={(e) => setTipoClienteFiltro(e.target.value)}
          aria-label="Filtrar por tipo de cliente"
        >
          <option value="">Todos os tipos</option>
          <option value="particular">Particular</option>
          <option value="stand">Stand</option>
        </select>
        <select className="input" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Ordenar por">
          <option value="data">Data</option>
          <option value="nota">Nota</option>
          <option value="status">Estado</option>
        </select>
      </div>
      <table className="item-table">
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Veículo</th>
            <th>Técnico</th>
            <th>Estado</th>
            <th>Nota</th>
            <th>Data</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              <td>{r.matricula}</td>
              <td>{r.marcaModelo}</td>
              <td>{r.tecnicoNome}</td>
              <td>
                {STATUS_LABEL[r.status] ?? r.status}
                {r.atrasada && <span className="status-pill status-pill--danger"> Atrasada</span>}
              </td>
              <td>{r.nota !== null ? `${r.nota.toFixed(1)} (${r.classificacao})` : "—"}</td>
              <td>{r.dataAbertura}</td>
              <td>
                <Link href={`/inspections/${r.id}`} className="btn btn-secondary">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={7}>Nenhuma inspeção encontrada.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Write the page**

```tsx
// app/(app)/admin/page.tsx
import { createClient } from "@/lib/supabase/server";
import { buildAdminInspectionRows } from "@/lib/inspection/admin-list";
import { InspectionsTable } from "./inspections-table";

export default async function AdminInspectionsPage() {
  const supabase = await createClient();

  const [{ data: inspections, error: inspectionsError }, { data: scores, error: scoresError }] = await Promise.all([
    supabase
      .from("inspections")
      .select("id, status, tipo_cliente, data_abertura, vehicle_data(matricula, marca, modelo), users(nome)")
      .order("data_abertura", { ascending: false }),
    supabase.from("inspection_score").select("inspection_id, nota_geral, classificacao"),
  ]);

  if (inspectionsError || scoresError) {
    console.error("admin inspections list fetch failed", { inspectionsError, scoresError });
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = buildAdminInspectionRows(
    (inspections ?? []) as Parameters<typeof buildAdminInspectionRows>[0],
    scores ?? [],
    today
  );

  return (
    <main className="page">
      <h1>Todas as inspeções</h1>
      <InspectionsTable rows={rows} />
    </main>
  );
}
```

- [ ] **Step 7: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add lib/inspection/admin-list.ts lib/inspection/admin-list.test.ts "app/(app)/admin/page.tsx" "app/(app)/admin/inspections-table.tsx"
git commit -m "feat: add admin inspections list with search/filter/sort/atrasada (RF-57–59, 62)"
```

---

### Task 6: Role-based routing (login redirect + guards + middleware)

Both destination pages (`/inspections`, `/admin`) exist as of Task 3 and Task 5, so it's safe to wire redirects to them now.

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/login/page.test.tsx`
- Create: `app/(app)/admin/layout.tsx`
- Modify: `app/(app)/inspections/page.tsx`
- Modify: `app/(app)/inspections/new/page.tsx`
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `getCurrentUser()` (Task 1).

- [ ] **Step 1: Update the login test for role-based redirect**

```tsx
// app/login/page.test.tsx (replace the whole file)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "./page";

const signInWithPassword = vi.fn();
const usersQuery: any = { select: vi.fn(() => usersQuery), eq: vi.fn(() => usersQuery), single: vi.fn() };
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword }, from: () => usersQuery }),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  signInWithPassword.mockReset();
  push.mockReset();
  usersQuery.single.mockReset();
});

describe("LoginPage", () => {
  it("shows an error message on invalid credentials", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email ou palavra-passe inválidos.");
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects a técnico to /inspections on success", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    usersQuery.single.mockResolvedValue({ data: { role: "tecnico" } });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/inspections"));
  });

  it("redirects an admin to /admin on success", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-2" } }, error: null });
    usersQuery.single.mockResolvedValue({ data: { role: "admin" } });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@b.com" } });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/login/page.test.tsx`
Expected: FAIL — page still redirects unconditionally to `/inspections/new`.

- [ ] **Step 3: Update the login page**

```tsx
// app/login/page.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !data.user) {
      setLoading(false);
      setError("Email ou palavra-passe inválidos.");
      return;
    }

    const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).single();
    setLoading(false);

    router.push(profile?.role === "admin" ? "/admin" : "/inspections");
    router.refresh();
  }

  return (
    <main className="login-screen">
      <form onSubmit={handleSubmit} className="panel login-card">
        <h1>Check Auto</h1>
        <div className="field">
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password" className="label">
            Palavra-passe
          </label>
          <input
            id="password"
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "A entrar..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/login/page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Guard `/admin/*` for técnicos**

```tsx
// app/(app)/admin/layout.tsx
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    redirect("/inspections");
  }

  return children;
}
```

- [ ] **Step 6: Guard the técnico-only entry points for admins**

`app/(app)/inspections/page.tsx` — add at the top of the function body:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
// ...
export default async function MinhasInspecoesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "tecnico") {
    redirect("/admin");
  }

  const supabase = await createClient();
  // ... rest unchanged
```

`app/(app)/inspections/new/page.tsx` — same guard at the top:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
// ...
export default async function NewInspectionPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "tecnico") {
    redirect("/admin");
  }

  const supabase = await createClient();
  // ... rest unchanged
```

- [ ] **Step 7: Extend the middleware matcher to cover `/admin`**

```ts
// middleware.ts — only the matcher changes
export const config = {
  matcher: ["/inspections/:path*", "/admin/:path*"],
};
```

Also extend the unauthenticated-redirect condition (currently only checks `/inspections`):

```ts
  if (!user && (request.nextUrl.pathname.startsWith("/inspections") || request.nextUrl.pathname.startsWith("/admin"))) {
```

- [ ] **Step 8: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add app/login/page.tsx app/login/page.test.tsx "app/(app)/admin/layout.tsx" \
  "app/(app)/inspections/page.tsx" "app/(app)/inspections/new/page.tsx" middleware.ts
git commit -m "feat: role-based routing — login redirect + admin/técnico area guards"
```

---

### Task 7: Audit trail helper (`lib/audit/log.ts`) + wire into the 5 checklist item actions

**Files:**
- Create: `lib/audit/log.ts`
- Test: `lib/audit/log.test.ts`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts` (if it exists — check first; if not, this step just adds coverage inline per action's existing test file)

**Interfaces:**
- Consumes: `getCurrentUser()` (Task 1).
- Produces: `recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId }): Promise<void>` — consumed by the 5 actions.

- [ ] **Step 1: Write the failing test**

```ts
// lib/audit/log.test.ts
import { describe, it, expect, vi } from "vitest";
import { recordAdminEdit } from "./log";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function buildSupabase(itemNome: string | null) {
  const itemQuery: any = { select: vi.fn(() => itemQuery), eq: vi.fn(() => itemQuery), single: vi.fn() };
  itemQuery.single.mockResolvedValue({ data: itemNome ? { nome: itemNome } : null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => (table === "checklist_item_templates" ? itemQuery : { insert }));
  return { supabase: { from } as unknown as SupabaseServerClient, insert };
}

describe("recordAdminEdit", () => {
  it("inserts an audit_log_entries row naming the edited item", async () => {
    const { supabase, insert } = buildSupabase("Pneu dianteiro esquerdo");

    await recordAdminEdit(supabase, { inspectionId: "insp-1", itemTemplateId: "item-1", adminId: "admin-1" });

    expect(insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      admin_id: "admin-1",
      descricao: 'Editou "Pneu dianteiro esquerdo"',
    });
  });

  it("falls back to the item id when the name can't be resolved", async () => {
    const { supabase, insert } = buildSupabase(null);

    await recordAdminEdit(supabase, { inspectionId: "insp-1", itemTemplateId: "item-404", adminId: "admin-1" });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ descricao: 'Editou "item-404"' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/audit/log.test.ts`
Expected: FAIL — `Cannot find module './log'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/audit/log.ts
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// ponytail: fire-and-forget on failure -- the checklist save this follows
// already succeeded and the técnico/admin already saw a success state; an
// audit-write hiccup shouldn't surface as a false "não foi possível
// guardar" error. Logged to console for operator visibility instead.
export async function recordAdminEdit(
  supabase: SupabaseServerClient,
  params: { inspectionId: string; itemTemplateId: string; adminId: string }
): Promise<void> {
  const { data: item } = await supabase
    .from("checklist_item_templates")
    .select("nome")
    .eq("id", params.itemTemplateId)
    .single();

  const { error } = await supabase.from("audit_log_entries").insert({
    inspection_id: params.inspectionId,
    admin_id: params.adminId,
    descricao: `Editou "${item?.nome ?? params.itemTemplateId}"`,
  });

  if (error) {
    console.error("recordAdminEdit insert failed", error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/audit/log.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into the 5 checklist item actions**

`app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts` — add the imports at the top:

```ts
import { getCurrentUser } from "@/lib/auth/session";
import { recordAdminEdit } from "@/lib/audit/log";
```

Then, in each of the 5 functions, add the audit call right before the final success return. `saveEscolhaAction` (right before `return { status: "idle" };` at the end):

```ts
  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { status: "idle" };
```

`saveTextoAction` — right before its final `return { status: "idle" };`:

```ts
  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { status: "idle" };
```

`saveDataAction` — same block, right before its final `return { status: "idle" };`:

```ts
  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { status: "idle" };
```

`saveMeasurementAction` — same block, right before `return { status: "success" };`:

```ts
  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { status: "success" };
```

`attachPhotoAction` — right before `return { photoId: photo.id };`:

```ts
  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { photoId: photo.id };
```

`deletePhotoAction` — this one only receives `photoId`, so it needs to resolve `inspectionId`/`itemTemplateId` from the deleted row first. Replace the whole function:

```ts
export async function deletePhotoAction(photoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("photos")
    .delete()
    .eq("id", photoId)
    .select("inspection_id, item_response_id")
    .single();

  if (error || !deleted) {
    console.error("deletePhotoAction failed", error);
    return { error: "Não foi possível remover a foto. Tente novamente." };
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    const { data: response } = await supabase
      .from("checklist_item_responses")
      .select("item_template_id")
      .eq("id", deleted.item_response_id)
      .single();
    if (response) {
      await recordAdminEdit(supabase, {
        inspectionId: deleted.inspection_id,
        itemTemplateId: response.item_template_id,
        adminId: currentUser.id,
      });
    }
  }

  return {};
}
```

- [ ] **Step 6: Add regression coverage for the audit wiring**

Check whether `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts` already exists (`ls` the directory). If it does, add these two tests to it, mocking `@/lib/auth/session` alongside the existing `@/lib/supabase/server` mock; if it doesn't exist, create it with just these two tests plus whatever minimal supabase mock scaffolding `saveEscolhaAction` needs (mirror the `checklist_item_templates`/`opcoes`/`checklist_item_responses` mock chain style already used in `app/(app)/inspections/[id]/actions.test.ts`).

```ts
// added to actions.test.ts
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/session";

// ... inside the saveEscolhaAction describe block:
it("logs an audit entry when the caller is admin", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
  // ... existing arrange for a successful save ...
  await saveEscolhaAction({ status: "idle" }, formData);
  expect(auditInsert).toHaveBeenCalledWith(
    expect.objectContaining({ admin_id: "admin-1", inspection_id: expect.any(String) })
  );
});

it("does not log an audit entry when the caller is técnico", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" });
  // ... existing arrange for a successful save ...
  await saveEscolhaAction({ status: "idle" }, formData);
  expect(auditInsert).not.toHaveBeenCalled();
});
```

(Exact mock wiring for `auditInsert`/`checklist_item_templates` follows the chain-mock pattern already established in this file — extend the existing `from` mock to also branch on `"audit_log_entries"`.)

- [ ] **Step 7: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add lib/audit/log.ts lib/audit/log.test.ts \
  "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts" \
  "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
git commit -m "feat: log admin checklist edits to audit_log_entries (RF-36)"
```

---

### Task 8: Aprovar / Devolver (RF-31–34) + report placeholder button

**Files:**
- Modify: `app/(app)/inspections/[id]/actions.ts`
- Modify: `app/(app)/inspections/[id]/actions.test.ts`
- Create: `app/(app)/inspections/[id]/admin-actions-panel.tsx`
- Create: `app/(app)/inspections/[id]/admin-actions-panel.test.tsx`
- Modify: `app/(app)/inspections/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser()` (Task 1).
- Produces: `approveInspectionAction`, `returnInspectionAction`, `ReviewActionState` type — also consumed by `AdminActionsPanel`, which Task 9 extends with cancel.

- [ ] **Step 1: Write the failing tests for the new actions**

Append to `app/(app)/inspections/[id]/actions.test.ts` (the existing `inspectionQuery`/`updateQuery`/`from` mocks from `submitInspectionAction`'s tests are reused; add a `reviewEventsQuery` mock alongside them):

```ts
// add near the top, alongside the existing mocks
const reviewEventsQuery: any = { insert: vi.fn() };
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/session";

// extend the existing `from` mock function:
// if (table === "review_events") return reviewEventsQuery;

describe("approveInspectionAction", () => {
  it("rejects when the caller is not admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" });
    const { approveInspectionAction } = await import("./actions");

    const result = await approveInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("rejects when the inspection is not aguardando_aprovacao", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "rascunho" }, error: null });
    const { approveInspectionAction } = await import("./actions");

    const result = await approveInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("inserts an aprovacao review_event and updates status to aprovada", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "aguardando_aprovacao" }, error: null });
    reviewEventsQuery.insert.mockResolvedValue({ error: null });
    updateQuery.eq.mockResolvedValue({ error: null });
    const { approveInspectionAction } = await import("./actions");

    const result = await approveInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("success");
    expect(reviewEventsQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      tipo: "aprovacao",
      autor_id: "admin-1",
    });
    expect(inspectionQuery.update).toHaveBeenCalledWith({ status: "aprovada" });
  });
});

describe("returnInspectionAction", () => {
  it("rejects an empty motivo", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    const fd = formDataWith("insp-1");
    const { returnInspectionAction } = await import("./actions");

    const result = await returnInspectionAction({ status: "idle" }, fd);

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("inserts a devolucao review_event with motivo and updates status to devolvida", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "aguardando_aprovacao" }, error: null });
    reviewEventsQuery.insert.mockResolvedValue({ error: null });
    updateQuery.eq.mockResolvedValue({ error: null });
    const fd = formDataWith("insp-1");
    fd.set("motivo", "Faltou foto do pneu traseiro");
    const { returnInspectionAction } = await import("./actions");

    const result = await returnInspectionAction({ status: "idle" }, fd);

    expect(result.status).toBe("success");
    expect(reviewEventsQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      tipo: "devolucao",
      autor_id: "admin-1",
      motivo: "Faltou foto do pneu traseiro",
    });
    expect(inspectionQuery.update).toHaveBeenCalledWith({ status: "devolvida" });
  });
});
```

Also extend the file's `beforeEach` to reset `reviewEventsQuery.insert.mockClear()` and `vi.mocked(getCurrentUser).mockReset()`, matching the reset style already used for the other query mocks.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/inspections/[id]/actions.test.ts"`
Expected: FAIL — `approveInspectionAction`/`returnInspectionAction` are not exported yet.

- [ ] **Step 3: Add the actions**

Append to `app/(app)/inspections/[id]/actions.ts`:

```ts
import { getCurrentUser } from "@/lib/auth/session";

export type ReviewActionState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

export async function approveInspectionAction(
  _prevState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const inspectionId = formData.get("inspectionId") as string;
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem aprovar inspeções." };
  }

  const supabase = await createClient();
  const { data: inspection } = await supabase.from("inspections").select("status").eq("id", inspectionId).single();
  if (!inspection || inspection.status !== "aguardando_aprovacao") {
    return { status: "error", message: "Esta inspeção não está aguardando aprovação." };
  }

  const { error: reviewError } = await supabase
    .from("review_events")
    .insert({ inspection_id: inspectionId, tipo: "aprovacao", autor_id: user.id });
  if (reviewError) {
    console.error("approveInspectionAction review_events insert failed", reviewError);
    return { status: "error", message: "Não foi possível aprovar. Tente novamente." };
  }

  const { error: updateError } = await supabase
    .from("inspections")
    .update({ status: "aprovada" })
    .eq("id", inspectionId);
  if (updateError) {
    console.error("approveInspectionAction update failed", updateError);
    return { status: "error", message: "Não foi possível aprovar. Tente novamente." };
  }

  return { status: "success" };
}

export async function returnInspectionAction(
  _prevState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const inspectionId = formData.get("inspectionId") as string;
  const motivo = ((formData.get("motivo") as string) || "").trim();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem devolver inspeções." };
  }
  if (!motivo) {
    return { status: "error", message: "Informe o motivo da devolução." };
  }

  const supabase = await createClient();
  const { data: inspection } = await supabase.from("inspections").select("status").eq("id", inspectionId).single();
  if (!inspection || inspection.status !== "aguardando_aprovacao") {
    return { status: "error", message: "Esta inspeção não está aguardando aprovação." };
  }

  const { error: reviewError } = await supabase
    .from("review_events")
    .insert({ inspection_id: inspectionId, tipo: "devolucao", autor_id: user.id, motivo });
  if (reviewError) {
    console.error("returnInspectionAction review_events insert failed", reviewError);
    return { status: "error", message: "Não foi possível devolver. Tente novamente." };
  }

  const { error: updateError } = await supabase
    .from("inspections")
    .update({ status: "devolvida" })
    .eq("id", inspectionId);
  if (updateError) {
    console.error("returnInspectionAction update failed", updateError);
    return { status: "error", message: "Não foi possível devolver. Tente novamente." };
  }

  return { status: "success" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/inspections/[id]/actions.test.ts"`
Expected: PASS (all previous + 5 new tests)

- [ ] **Step 5: Build `AdminActionsPanel` (approve/return only for now — Task 9 adds cancel)**

```tsx
// app/(app)/inspections/[id]/admin-actions-panel.tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { approveInspectionAction, returnInspectionAction, type ReviewActionState } from "./actions";
import type { InspectionStatus } from "@/lib/inspection/status";

const initialState: ReviewActionState = { status: "idle" };

export function AdminActionsPanel({ inspectionId, status }: { inspectionId: string; status: InspectionStatus }) {
  const router = useRouter();
  const approveDialogRef = useRef<HTMLDialogElement>(null);
  const returnDialogRef = useRef<HTMLDialogElement>(null);
  const [approveState, approveFormAction, isApproving] = useActionState(approveInspectionAction, initialState);
  const [returnState, returnFormAction, isReturning] = useActionState(returnInspectionAction, initialState);

  useEffect(() => {
    if (approveState.status === "success") {
      approveDialogRef.current?.close();
      router.refresh();
    }
  }, [approveState, router]);

  useEffect(() => {
    if (returnState.status === "success") {
      returnDialogRef.current?.close();
      router.refresh();
    }
  }, [returnState, router]);

  const showReview = status === "aguardando_aprovacao";

  if (!showReview) return null;

  return (
    <div className="stack-row">
      <button type="button" className="btn btn-primary" onClick={() => approveDialogRef.current?.showModal()}>
        Aprovar
      </button>
      <dialog ref={approveDialogRef} className="dialog-panel">
        <form action={approveFormAction} className="stack">
          <input type="hidden" name="inspectionId" value={inspectionId} />
          <p>Confirma a aprovação desta inspeção?</p>
          <div className="stack-row">
            <button type="button" className="btn btn-secondary" onClick={() => approveDialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isApproving}>
              Confirmar aprovação
            </button>
          </div>
          {approveState.status === "error" && (
            <p role="alert" className="error-text">
              {approveState.message}
            </p>
          )}
        </form>
      </dialog>

      <button type="button" className="btn btn-danger" onClick={() => returnDialogRef.current?.showModal()}>
        Devolver
      </button>
      <dialog ref={returnDialogRef} className="dialog-panel">
        <form action={returnFormAction} className="stack">
          <input type="hidden" name="inspectionId" value={inspectionId} />
          <div className="field">
            <label htmlFor="motivo" className="label">
              Motivo da devolução
            </label>
            <textarea id="motivo" name="motivo" className="input" required />
          </div>
          <div className="stack-row">
            <button type="button" className="btn btn-secondary" onClick={() => returnDialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-danger" disabled={isReturning}>
              Confirmar devolução
            </button>
          </div>
          {returnState.status === "error" && (
            <p role="alert" className="error-text">
              {returnState.message}
            </p>
          )}
        </form>
      </dialog>
    </div>
  );
}
```

```tsx
// app/(app)/inspections/[id]/admin-actions-panel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminActionsPanel } from "./admin-actions-panel";

const approveInspectionAction = vi.fn();
const returnInspectionAction = vi.fn();
vi.mock("./actions", () => ({
  approveInspectionAction: (...args: unknown[]) => approveInspectionAction(...args),
  returnInspectionAction: (...args: unknown[]) => returnInspectionAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  approveInspectionAction.mockReset();
  returnInspectionAction.mockReset();
  refresh.mockClear();
});

describe("AdminActionsPanel", () => {
  it("renders nothing when status is not aguardando_aprovacao", () => {
    const { container } = render(<AdminActionsPanel inspectionId="insp-1" status="rascunho" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("approves and refreshes on success", async () => {
    approveInspectionAction.mockResolvedValue({ status: "success" });
    render(<AdminActionsPanel inspectionId="insp-1" status="aguardando_aprovacao" />);

    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the error message when returning fails validation", async () => {
    returnInspectionAction.mockResolvedValue({ status: "error", message: "Informe o motivo da devolução." });
    render(<AdminActionsPanel inspectionId="insp-1" status="aguardando_aprovacao" />);

    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar devolução" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Informe o motivo da devolução."));
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Wire into the summary page + add the report placeholder**

`app/(app)/inspections/[id]/page.tsx` — add the import and render the panel for admin, plus the placeholder report button:

```tsx
import { AdminActionsPanel } from "./admin-actions-panel";
```

Inside the `.summary-actions` block, alongside the existing técnico `SubmitInspectionPanel`:

```tsx
      <div className="summary-actions">
        <Link href={`/inspections/${id}/checklist`} className="btn btn-primary summary-cta">
          Ir para a checklist
        </Link>

        {editable && currentUser?.role === "tecnico" && (
          <SubmitInspectionPanel
            inspectionId={id}
            label={status === "devolvida" ? "Reenviar para aprovação" : "Finalizar inspeção"}
            progress={progress}
          />
        )}

        {currentUser?.role === "admin" && <AdminActionsPanel inspectionId={id} status={status} />}

        {status === "aprovada" && (
          <button type="button" className="btn btn-secondary" disabled title="Em breve">
            Gerar relatório
          </button>
        )}
      </div>
```

- [ ] **Step 7: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/inspections/[id]/actions.ts" "app/(app)/inspections/[id]/actions.test.ts" \
  "app/(app)/inspections/[id]/admin-actions-panel.tsx" "app/(app)/inspections/[id]/admin-actions-panel.test.tsx" \
  "app/(app)/inspections/[id]/page.tsx"
git commit -m "feat: admin approve/return actions + panel + report placeholder (RF-31–34)"
```

---

### Task 9: Cancelamento (RF-60–61)

**Files:**
- Modify: `app/(app)/inspections/[id]/actions.ts`
- Modify: `app/(app)/inspections/[id]/actions.test.ts`
- Modify: `app/(app)/inspections/[id]/admin-actions-panel.tsx`
- Modify: `app/(app)/inspections/[id]/admin-actions-panel.test.tsx`

**Interfaces:**
- Consumes: `ReviewActionState` (Task 8).
- Produces: `cancelInspectionAction`.

- [ ] **Step 1: Write the failing tests**

Append to `app/(app)/inspections/[id]/actions.test.ts`:

```ts
describe("cancelInspectionAction", () => {
  it("rejects when status is already aprovada", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "aprovada" }, error: null });
    const fd = formDataWith("insp-1");
    fd.set("motivo", "Motivo qualquer");
    const { cancelInspectionAction } = await import("./actions");

    const result = await cancelInspectionAction({ status: "idle" }, fd);

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("cancels a rascunho with a motivo, inserting review_events and updating status", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "rascunho" }, error: null });
    reviewEventsQuery.insert.mockResolvedValue({ error: null });
    updateQuery.eq.mockResolvedValue({ error: null });
    const fd = formDataWith("insp-1");
    fd.set("motivo", "Cliente desistiu");
    const { cancelInspectionAction } = await import("./actions");

    const result = await cancelInspectionAction({ status: "idle" }, fd);

    expect(result.status).toBe("success");
    expect(reviewEventsQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      tipo: "cancelamento",
      autor_id: "admin-1",
      motivo: "Cliente desistiu",
    });
    expect(inspectionQuery.update).toHaveBeenCalledWith({ status: "cancelada" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/inspections/[id]/actions.test.ts"`
Expected: FAIL — `cancelInspectionAction` not exported yet.

- [ ] **Step 3: Add the action**

Append to `app/(app)/inspections/[id]/actions.ts`:

```ts
const CANCELAVEL_STATUSES: InspectionStatus[] = ["rascunho", "aguardando_aprovacao", "devolvida"];

export async function cancelInspectionAction(
  _prevState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const inspectionId = formData.get("inspectionId") as string;
  const motivo = ((formData.get("motivo") as string) || "").trim();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem cancelar inspeções." };
  }
  if (!motivo) {
    return { status: "error", message: "Informe o motivo do cancelamento." };
  }

  const supabase = await createClient();
  const { data: inspection } = await supabase.from("inspections").select("status").eq("id", inspectionId).single();
  if (!inspection || !CANCELAVEL_STATUSES.includes(inspection.status as InspectionStatus)) {
    return { status: "error", message: "Esta inspeção não pode ser cancelada." };
  }

  const { error: reviewError } = await supabase
    .from("review_events")
    .insert({ inspection_id: inspectionId, tipo: "cancelamento", autor_id: user.id, motivo });
  if (reviewError) {
    console.error("cancelInspectionAction review_events insert failed", reviewError);
    return { status: "error", message: "Não foi possível cancelar. Tente novamente." };
  }

  const { error: updateError } = await supabase
    .from("inspections")
    .update({ status: "cancelada" })
    .eq("id", inspectionId);
  if (updateError) {
    console.error("cancelInspectionAction update failed", updateError);
    return { status: "error", message: "Não foi possível cancelar. Tente novamente." };
  }

  return { status: "success" };
}
```

(`InspectionStatus` needs importing at the top of `actions.ts` if not already: `import type { InspectionStatus } from "@/lib/inspection/status";`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/inspections/[id]/actions.test.ts"`
Expected: PASS (all previous + 2 new tests)

- [ ] **Step 5: Extend `AdminActionsPanel` with the cancel button**

```tsx
// app/(app)/inspections/[id]/admin-actions-panel.tsx — extend the existing component
import { approveInspectionAction, returnInspectionAction, cancelInspectionAction, type ReviewActionState } from "./actions";

// ... inside the component, alongside the existing refs/state:
  const cancelDialogRef = useRef<HTMLDialogElement>(null);
  const [cancelState, cancelFormAction, isCancelling] = useActionState(cancelInspectionAction, initialState);

  useEffect(() => {
    if (cancelState.status === "success") {
      cancelDialogRef.current?.close();
      router.refresh();
    }
  }, [cancelState, router]);

  const showReview = status === "aguardando_aprovacao";
  const showCancel = status === "rascunho" || status === "aguardando_aprovacao" || status === "devolvida";

  if (!showReview && !showCancel) return null;

  return (
    <div className="stack-row">
      {showReview && (
        <>
          {/* ... existing Aprovar/Devolver buttons + dialogs, unchanged ... */}
        </>
      )}

      {showCancel && (
        <>
          <button type="button" className="btn btn-danger" onClick={() => cancelDialogRef.current?.showModal()}>
            Cancelar inspeção
          </button>
          <dialog ref={cancelDialogRef} className="dialog-panel">
            <form action={cancelFormAction} className="stack">
              <input type="hidden" name="inspectionId" value={inspectionId} />
              <div className="field">
                <label htmlFor="motivo-cancelamento" className="label">
                  Motivo do cancelamento
                </label>
                <textarea id="motivo-cancelamento" name="motivo" className="input" required />
              </div>
              <div className="stack-row">
                <button type="button" className="btn btn-secondary" onClick={() => cancelDialogRef.current?.close()}>
                  Voltar
                </button>
                <button type="submit" className="btn btn-danger" disabled={isCancelling}>
                  Confirmar cancelamento
                </button>
              </div>
              {cancelState.status === "error" && (
                <p role="alert" className="error-text">
                  {cancelState.message}
                </p>
              )}
            </form>
          </dialog>
        </>
      )}
    </div>
  );
```

- [ ] **Step 6: Add coverage to `admin-actions-panel.test.tsx`**

```tsx
// add to the existing mock at the top
const cancelInspectionAction = vi.fn();
vi.mock("./actions", () => ({
  approveInspectionAction: (...args: unknown[]) => approveInspectionAction(...args),
  returnInspectionAction: (...args: unknown[]) => returnInspectionAction(...args),
  cancelInspectionAction: (...args: unknown[]) => cancelInspectionAction(...args),
}));

// reset it in beforeEach: cancelInspectionAction.mockReset();

it("shows the cancel button for a rascunho (no approve/return buttons)", () => {
  render(<AdminActionsPanel inspectionId="insp-1" status="rascunho" />);
  expect(screen.getByRole("button", { name: "Cancelar inspeção" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
});

it("cancels and refreshes on success", async () => {
  cancelInspectionAction.mockResolvedValue({ status: "success" });
  render(<AdminActionsPanel inspectionId="insp-1" status="devolvida" />);

  fireEvent.click(screen.getByRole("button", { name: "Cancelar inspeção" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it("renders nothing for aprovada or cancelada", () => {
  const { container: c1 } = render(<AdminActionsPanel inspectionId="insp-1" status="aprovada" />);
  expect(c1).toBeEmptyDOMElement();
  const { container: c2 } = render(<AdminActionsPanel inspectionId="insp-1" status="cancelada" />);
  expect(c2).toBeEmptyDOMElement();
});
```

- [ ] **Step 7: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/inspections/[id]/actions.ts" "app/(app)/inspections/[id]/actions.test.ts" \
  "app/(app)/inspections/[id]/admin-actions-panel.tsx" "app/(app)/inspections/[id]/admin-actions-panel.test.tsx"
git commit -m "feat: admin cancelamento (RF-60–61)"
```

---

### Task 10: Post-approval edit warning banner

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/layout.tsx`
- Modify: `app/globals.css`

No new test file — this is a pure rendering condition on data already fetched in Task 2's wiring; covered by manual browser verification per this codebase's established convention for Server Component page markup (see Task 3's rationale).

- [ ] **Step 1: Add the banner condition**

`app/(app)/inspections/[id]/checklist/layout.tsx` — extend the existing readonly-badge block area:

```tsx
        <h2 className="checklist-nav__title">
          Checklist
          {!editable && (
            <span className="checklist-nav__readonly-badge" role="status">
              Só leitura
            </span>
          )}
        </h2>
        {!editable && (
          <p className="checklist-nav__readonly-note">Esta inspeção já foi enviada e não pode mais ser editada.</p>
        )}
        {currentUser?.role === "admin" && inspection.status === "aprovada" && (
          <p className="status-banner status-banner--warning">
            Esta inspeção já está aprovada — editar aqui recalcula a nota automaticamente.
          </p>
        )}
        {process.env.NODE_ENV === "development" && editable && <DevFillButton inspectionId={id} />}
```

(`currentUser` is already in scope from Task 2's wiring of this file; `inspection.status` is the raw string already fetched — no new query needed.)

- [ ] **Step 2: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/layout.tsx"
git commit -m "feat: warn admin when editing an already-approved inspection"
```

---

### Task 11: Histórico section (admin-only, read-only)

**Files:**
- Modify: `app/(app)/inspections/[id]/page.tsx`
- Create: `lib/inspection/historico.ts`
- Test: `lib/inspection/historico.test.ts`

**Interfaces:**
- Produces: `mergeHistorico(reviewEvents, auditEntries)` — pure merge/sort function.

- [ ] **Step 1: Write the failing test**

```ts
// lib/inspection/historico.test.ts
import { describe, it, expect } from "vitest";
import { mergeHistorico } from "./historico";

describe("mergeHistorico", () => {
  it("merges review_events and audit_log_entries sorted by timestamp desc", () => {
    const result = mergeHistorico(
      [{ tipo: "devolucao" as const, motivo: "Faltou foto", timestamp: "2026-08-01T10:00:00Z", users: { nome: "Admin A" } }],
      [{ descricao: 'Editou "Pneu"', timestamp: "2026-08-02T10:00:00Z", users: { nome: "Admin A" } }]
    );

    expect(result).toEqual([
      { tipo: "auditoria", descricao: 'Editou "Pneu"', autor: "Admin A", timestamp: "2026-08-02T10:00:00Z" },
      { tipo: "review", label: "Devolução", motivo: "Faltou foto", autor: "Admin A", timestamp: "2026-08-01T10:00:00Z" },
    ]);
  });

  it("labels aprovacao and cancelamento correctly and falls back to — for a missing author", () => {
    const result = mergeHistorico(
      [
        { tipo: "aprovacao" as const, motivo: null, timestamp: "2026-08-03T10:00:00Z", users: null },
        { tipo: "cancelamento" as const, motivo: "Duplicada", timestamp: "2026-08-04T10:00:00Z", users: { nome: "Admin B" } },
      ],
      []
    );

    expect(result[1]).toEqual({ tipo: "review", label: "Aprovação", motivo: null, autor: "—", timestamp: "2026-08-03T10:00:00Z" });
    expect(result[0]).toEqual({
      tipo: "review",
      label: "Cancelamento",
      motivo: "Duplicada",
      autor: "Admin B",
      timestamp: "2026-08-04T10:00:00Z",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/inspection/historico.test.ts`
Expected: FAIL — `Cannot find module './historico'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/inspection/historico.ts
type ReviewEventRow = {
  tipo: "aprovacao" | "devolucao" | "cancelamento";
  motivo: string | null;
  timestamp: string;
  users: { nome: string } | null;
};

type AuditLogRow = {
  descricao: string;
  timestamp: string;
  users: { nome: string } | null;
};

export type HistoricoEntry =
  | { tipo: "review"; label: string; motivo: string | null; autor: string; timestamp: string }
  | { tipo: "auditoria"; descricao: string; autor: string; timestamp: string };

const REVIEW_LABEL: Record<ReviewEventRow["tipo"], string> = {
  aprovacao: "Aprovação",
  devolucao: "Devolução",
  cancelamento: "Cancelamento",
};

export function mergeHistorico(reviewEvents: ReviewEventRow[], auditEntries: AuditLogRow[]): HistoricoEntry[] {
  const entries: HistoricoEntry[] = [
    ...reviewEvents.map((e) => ({
      tipo: "review" as const,
      label: REVIEW_LABEL[e.tipo],
      motivo: e.motivo,
      autor: e.users?.nome ?? "—",
      timestamp: e.timestamp,
    })),
    ...auditEntries.map((e) => ({
      tipo: "auditoria" as const,
      descricao: e.descricao,
      autor: e.users?.nome ?? "—",
      timestamp: e.timestamp,
    })),
  ];

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/inspection/historico.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into the summary page**

`app/(app)/inspections/[id]/page.tsx` — add the fetch (only for admin) and render section:

```tsx
import { mergeHistorico } from "@/lib/inspection/historico";
```

After the existing `motivoDevolucao` block, add:

```tsx
  let historico: ReturnType<typeof mergeHistorico> = [];
  if (currentUser?.role === "admin") {
    const [{ data: reviewEvents }, { data: auditEntries }] = await Promise.all([
      supabase
        .from("review_events")
        .select("tipo, motivo, timestamp, users(nome)")
        .eq("inspection_id", id)
        .order("timestamp", { ascending: false }),
      supabase
        .from("audit_log_entries")
        .select("descricao, timestamp, users(nome)")
        .eq("inspection_id", id)
        .order("timestamp", { ascending: false }),
    ]);
    historico = mergeHistorico(
      (reviewEvents ?? []) as Parameters<typeof mergeHistorico>[0],
      (auditEntries ?? []) as Parameters<typeof mergeHistorico>[1]
    );
  }
```

And render it, after the `.summary-actions` block:

```tsx
      {currentUser?.role === "admin" && historico.length > 0 && (
        <section className="panel stack">
          <h2>Histórico</h2>
          <ul className="item-list">
            {historico.map((h, i) => (
              <li key={i} className="item-list__row">
                {h.tipo === "review" ? (
                  <>
                    <strong>{h.label}</strong> — {h.autor} — {new Date(h.timestamp).toLocaleString("pt-PT")}
                    {h.motivo && <p className="hint">{h.motivo}</p>}
                  </>
                ) : (
                  <>
                    {h.descricao} — {h.autor} — {new Date(h.timestamp).toLocaleString("pt-PT")}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
```

- [ ] **Step 6: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add lib/inspection/historico.ts lib/inspection/historico.test.ts "app/(app)/inspections/[id]/page.tsx"
git commit -m "feat: admin-only Histórico section (review_events + audit_log_entries)"
```

---

### Task 12: Gestão de técnico (`/admin/tecnicos`)

**Files:**
- Create: `app/(app)/admin/tecnicos/actions.ts`
- Create: `app/(app)/admin/tecnicos/actions.test.ts`
- Create: `app/(app)/admin/tecnicos/page.tsx`
- Create: `app/(app)/admin/tecnicos/tecnicos-table.tsx`
- Create: `app/(app)/admin/tecnicos/tecnicos-table.test.tsx`
- Modify: `app/(app)/admin/page.tsx` (add a nav link to `/admin/tecnicos`)

**Interfaces:**
- Consumes: `createAdminClient()` (Task 4), `getCurrentUser()` (Task 1).

- [ ] **Step 1: Write the failing tests for the actions**

```ts
// app/(app)/admin/tecnicos/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const createUser = vi.fn();
const updateUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { createUser, updateUserById } } }),
}));

const usersInsert = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ insert: usersInsert }) }),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/session";

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  createUser.mockReset();
  updateUserById.mockReset();
  usersInsert.mockReset();
  vi.mocked(getCurrentUser).mockReset();
});

describe("createTecnicoAction", () => {
  it("rejects when the caller is not admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" });
    const { createTecnicoAction } = await import("./actions");

    const result = await createTecnicoAction(
      { status: "idle" },
      formDataWith({ nome: "Novo Técnico", email: "novo@checkauto.pt", senha: "senha1234" })
    );

    expect(result.status).toBe("error");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects a senha shorter than 8 characters", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    const { createTecnicoAction } = await import("./actions");

    const result = await createTecnicoAction(
      { status: "idle" },
      formDataWith({ nome: "Novo Técnico", email: "novo@checkauto.pt", senha: "abc" })
    );

    expect(result.status).toBe("error");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates the auth user then the public.users row", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    createUser.mockResolvedValue({ data: { user: { id: "new-tec-id" } }, error: null });
    usersInsert.mockResolvedValue({ error: null });
    const { createTecnicoAction } = await import("./actions");

    const result = await createTecnicoAction(
      { status: "idle" },
      formDataWith({ nome: "Novo Técnico", email: "novo@checkauto.pt", senha: "senha1234" })
    );

    expect(result.status).toBe("success");
    expect(createUser).toHaveBeenCalledWith({ email: "novo@checkauto.pt", password: "senha1234", email_confirm: true });
    expect(usersInsert).toHaveBeenCalledWith({
      id: "new-tec-id",
      nome: "Novo Técnico",
      email: "novo@checkauto.pt",
      role: "tecnico",
    });
  });
});

describe("toggleTecnicoBanAction", () => {
  it("bans with a ~100-year duration when deactivating", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    updateUserById.mockResolvedValue({ error: null });
    const { toggleTecnicoBanAction } = await import("./actions");

    const result = await toggleTecnicoBanAction({ status: "idle" }, formDataWith({ tecnicoId: "tec-1", ban: "true" }));

    expect(result.status).toBe("success");
    expect(updateUserById).toHaveBeenCalledWith("tec-1", { ban_duration: "876000h" });
  });

  it("clears the ban when reactivating", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    updateUserById.mockResolvedValue({ error: null });
    const { toggleTecnicoBanAction } = await import("./actions");

    await toggleTecnicoBanAction({ status: "idle" }, formDataWith({ tecnicoId: "tec-1", ban: "false" }));

    expect(updateUserById).toHaveBeenCalledWith("tec-1", { ban_duration: "none" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/admin/tecnicos/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`

- [ ] **Step 3: Write the actions**

```ts
// app/(app)/admin/tecnicos/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";

export type CreateTecnicoState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

export async function createTecnicoAction(
  _prevState: CreateTecnicoState,
  formData: FormData
): Promise<CreateTecnicoState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem criar técnicos." };
  }

  const nome = ((formData.get("nome") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim();
  const senha = (formData.get("senha") as string) || "";

  if (!nome || !email || senha.length < 8) {
    return { status: "error", message: "Preencha nome, email e uma senha com pelo menos 8 caracteres." };
  }

  const adminClient = createAdminClient();
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (createError || !created?.user) {
    console.error("createTecnicoAction auth.admin.createUser failed", createError);
    return {
      status: "error",
      message:
        createError?.message === "User already registered"
          ? "Já existe um utilizador com este email."
          : "Não foi possível criar o técnico. Tente novamente.",
    };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from("users")
    .insert({ id: created.user.id, nome, email, role: "tecnico" });

  if (insertError) {
    console.error("createTecnicoAction users insert failed", insertError);
    return { status: "error", message: "Utilizador criado, mas não foi possível salvar o perfil. Contacte o suporte." };
  }

  return { status: "success" };
}

export type ToggleTecnicoState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

// ~100 years -- Supabase's Admin API has no literal "permanent" ban value,
// this is the documented workaround (ban_duration: "none" reverses it).
const PERMANENT_BAN_DURATION = "876000h";

export async function toggleTecnicoBanAction(
  _prevState: ToggleTecnicoState,
  formData: FormData
): Promise<ToggleTecnicoState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem desativar técnicos." };
  }

  const tecnicoId = formData.get("tecnicoId") as string;
  const ban = formData.get("ban") === "true";

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(tecnicoId, {
    ban_duration: ban ? PERMANENT_BAN_DURATION : "none",
  });

  if (error) {
    console.error("toggleTecnicoBanAction failed", error);
    return { status: "error", message: "Não foi possível atualizar o técnico. Tente novamente." };
  }

  return { status: "success" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/admin/tecnicos/actions.test.ts"`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the client table component**

```tsx
// app/(app)/admin/tecnicos/tecnicos-table.tsx
"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createTecnicoAction, toggleTecnicoBanAction, type CreateTecnicoState, type ToggleTecnicoState } from "./actions";

export type TecnicoRow = { id: string; nome: string; email: string; ativo: boolean };

const createInitialState: CreateTecnicoState = { status: "idle" };
const toggleInitialState: ToggleTecnicoState = { status: "idle" };

export function TecnicosTable({ rows }: { rows: TecnicoRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [createState, createFormAction, isCreating] = useActionState(createTecnicoAction, createInitialState);
  const [toggleState, toggleFormAction] = useActionState(toggleTecnicoBanAction, toggleInitialState);

  useEffect(() => {
    if (createState.status === "success") {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [createState, router]);

  useEffect(() => {
    if (toggleState.status === "success") router.refresh();
  }, [toggleState, router]);

  return (
    <div className="stack">
      <button type="button" className="btn btn-primary" onClick={() => dialogRef.current?.showModal()}>
        Criar técnico
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        <form action={createFormAction} className="stack">
          <div className="field">
            <label htmlFor="nome" className="label">
              Nome
            </label>
            <input id="nome" name="nome" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="email" className="label">
              Email
            </label>
            <input id="email" name="email" type="email" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="senha" className="label">
              Senha temporária
            </label>
            <input id="senha" name="senha" type="password" className="input" minLength={8} required />
          </div>
          <div className="stack-row">
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isCreating}>
              Criar
            </button>
          </div>
          {createState.status === "error" && (
            <p role="alert" className="error-text">
              {createState.message}
            </p>
          )}
        </form>
      </dialog>

      <table className="item-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Estado</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{t.nome}</td>
              <td>{t.email}</td>
              <td>
                <span className={`status-pill ${t.ativo ? "status-pill--success" : "status-pill--danger"}`}>
                  {t.ativo ? "Ativo" : "Desativado"}
                </span>
              </td>
              <td>
                <form action={toggleFormAction}>
                  <input type="hidden" name="tecnicoId" value={t.id} />
                  <input type="hidden" name="ban" value={String(t.ativo)} />
                  <button type="submit" className="btn btn-secondary">
                    {t.ativo ? "Desativar" : "Reativar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

```tsx
// app/(app)/admin/tecnicos/tecnicos-table.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TecnicosTable } from "./tecnicos-table";

const createTecnicoAction = vi.fn();
const toggleTecnicoBanAction = vi.fn();
vi.mock("./actions", () => ({
  createTecnicoAction: (...args: unknown[]) => createTecnicoAction(...args),
  toggleTecnicoBanAction: (...args: unknown[]) => toggleTecnicoBanAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const rows = [
  { id: "tec-1", nome: "Técnico Ativo", email: "ativo@checkauto.pt", ativo: true },
  { id: "tec-2", nome: "Técnico Desativado", email: "des@checkauto.pt", ativo: false },
];

beforeEach(() => {
  createTecnicoAction.mockReset();
  toggleTecnicoBanAction.mockReset();
  refresh.mockClear();
});

describe("TecnicosTable", () => {
  it("shows Desativar for an active técnico and Reativar for an inactive one", () => {
    render(<TecnicosTable rows={rows} />);
    expect(screen.getAllByRole("button", { name: "Desativar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Reativar" })).toHaveLength(1);
  });

  it("closes the create dialog and refreshes on success", async () => {
    createTecnicoAction.mockResolvedValue({ status: "success" });
    render(<TecnicosTable rows={rows} />);

    fireEvent.click(screen.getByRole("button", { name: "Criar técnico" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo Técnico" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "novo@checkauto.pt" } });
    fireEvent.change(screen.getByLabelText("Senha temporária"), { target: { value: "senha1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the error message when creation fails", async () => {
    createTecnicoAction.mockResolvedValue({ status: "error", message: "Já existe um utilizador com este email." });
    render(<TecnicosTable rows={rows} />);

    fireEvent.click(screen.getByRole("button", { name: "Criar técnico" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Já existe um utilizador com este email.")
    );
  });
});
```

- [ ] **Step 6: Write the page**

```tsx
// app/(app)/admin/tecnicos/page.tsx
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TecnicosTable, type TecnicoRow } from "./tecnicos-table";

export default async function TecnicosPage() {
  const supabase = await createClient();
  const { data: tecnicos, error } = await supabase
    .from("users")
    .select("id, nome, email")
    .eq("role", "tecnico")
    .order("nome");

  if (error) {
    console.error("tecnicos list fetch failed", error);
  }

  const adminClient = createAdminClient();
  const { data: authList, error: authError } = await adminClient.auth.admin.listUsers();
  if (authError) {
    console.error("tecnicos auth list fetch failed", authError);
  }

  const bannedById = new Map(
    (authList?.users ?? []).map((u) => [u.id, Boolean(u.banned_until && new Date(u.banned_until) > new Date())])
  );

  const rows: TecnicoRow[] = (tecnicos ?? []).map((t) => ({
    id: t.id,
    nome: t.nome,
    email: t.email,
    ativo: !(bannedById.get(t.id) ?? false),
  }));

  return (
    <main className="page">
      <h1>Técnicos</h1>
      <TecnicosTable rows={rows} />
    </main>
  );
}
```

- [ ] **Step 7: Add a nav link from the admin inspections list**

`app/(app)/admin/page.tsx` — add near the top of the returned markup:

```tsx
import Link from "next/link";
// ...
    <main className="page">
      <div className="stack-row">
        <h1>Todas as inspeções</h1>
        <Link href="/admin/tecnicos" className="btn btn-secondary">
          Gerir técnicos
        </Link>
      </div>
      <InspectionsTable rows={rows} />
    </main>
```

- [ ] **Step 8: Run full test suite and typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/admin/tecnicos/actions.ts" "app/(app)/admin/tecnicos/actions.test.ts" \
  "app/(app)/admin/tecnicos/page.tsx" "app/(app)/admin/tecnicos/tecnicos-table.tsx" \
  "app/(app)/admin/tecnicos/tecnicos-table.test.tsx" "app/(app)/admin/page.tsx"
git commit -m "feat: admin técnico management — criar/desativar/reativar"
```

---

## Final Verification (manual, before requesting review)

1. `npx tsc --noEmit && npm test -- --run` — full green.
2. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Supabase dashboard → Project Settings → API → `service_role` secret).
3. In the browser: log in as an existing técnico → confirm landing on `/inspections`, devolvida inspections (if any) show the motivo, "Nova inspeção" works.
4. Manually promote a test user to `role = 'admin'` in `public.users` (SQL Editor) → log in as them → confirm landing on `/admin`, list shows all inspections with working search/filter/sort, "atrasada" flags correctly.
5. As admin: open an `aguardando_aprovacao` inspection → Aprovar and Devolver both work, `review_events` rows land in the DB.
6. As admin: open an `aprovada` inspection's checklist, edit an item → confirm the warning banner shows, `audit_log_entries` gets a row, Histórico section on the summary page shows both the aprovacao event and the new edit entry.
7. As admin: cancel a `rascunho` inspection → confirm it becomes `cancelada` and is no longer editable by the técnico who owns it.
8. As admin: create a técnico via `/admin/tecnicos`, then log out and log in as that new técnico with the temporary password → confirm it works. Desativar them → confirm login now fails. Reativar → confirm login works again.
9. Confirm técnico cannot navigate to `/admin/*` (redirected to `/inspections`), and admin cannot land on `/inspections` or `/inspections/new` (redirected to `/admin`) — but admin CAN still open `/inspections/[id]` and its checklist for any inspection.
