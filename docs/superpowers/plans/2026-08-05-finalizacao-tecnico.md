# Fase 5 Sub-Projeto 1 — Finalização do Técnico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar RF-23/24 (botão de finalizar/reenviar inspeção) e RF-33/34 (reenvio pós-devolução), incluindo feedback de read-only na checklist quando a inspeção não é mais editável — fechando o gap que bloqueia a Fase 5 (aprovação do admin).

**Architecture:** Um predicado puro compartilhado (`isInspectionEditable`) decide, a partir de `inspections.status`, se a inspeção pode ser editada — espelha exatamente a condição já aplicada pela RLS em `owns_editable_inspection()` (`supabase/migrations/00008_rls_helpers_and_core.sql:29`), sem duplicar RLS nova. Uma server action (`submitInspectionAction`) reaproveita `computeGroupProgress` (já usado pela navegação da checklist) para bloquear o envio com pendências, e faz um único `update inspections set status = ...`. A UI consome os dois: um painel na página de resumo decide o botão/confirmação, e as páginas da checklist mostram um banner + desabilitam os controles com um `<fieldset disabled>` nativo (sem tocar nos componentes internos da tabela).

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (RLS já existente, sem migration nova), Vitest + Testing Library (padrão já usado em `actions.test.ts` e `*-panel.test.tsx` deste diretório).

## Global Constraints

- Nenhuma migration SQL nova — a RLS de `owns_editable_inspection()` já impede escrita fora de `status in ('rascunho', 'devolvida')` (ver design §2 e §3.3).
- Sem filtro por `aplica_stand`/`tipo_cliente` (RF-63 fica fora de escopo) — pendências contam todos os itens ativos do template.
- Nenhuma inserção em `review_events` — só leitura (motivo de devolução).
- A validação de "sem pendências" acontece no servidor (na server action), não só no estado do botão no client.
- Todo texto de UI em português, seguindo o padrão já usado no resto do app (ex: `error-text`, `role="alert"`).

---

### Task 1: Predicado `isInspectionEditable`

**Files:**
- Create: `lib/inspection/status.ts`
- Test: `lib/inspection/status.test.ts`

**Interfaces:**
- Produces: `InspectionStatus` (union type) e `isInspectionEditable(status: InspectionStatus): boolean` — usados pela Task 2 (server action), Task 3 (painel de envio) e Task 4 (banner/fieldset read-only da checklist).

- [ ] **Step 1: Escrever o teste**

`lib/inspection/status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isInspectionEditable } from "./status";

describe("isInspectionEditable", () => {
  it("returns true for rascunho", () => {
    expect(isInspectionEditable("rascunho")).toBe(true);
  });

  it("returns true for devolvida", () => {
    expect(isInspectionEditable("devolvida")).toBe(true);
  });

  it("returns false for aguardando_aprovacao", () => {
    expect(isInspectionEditable("aguardando_aprovacao")).toBe(false);
  });

  it("returns false for aprovada", () => {
    expect(isInspectionEditable("aprovada")).toBe(false);
  });

  it("returns false for cancelada", () => {
    expect(isInspectionEditable("cancelada")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/inspection/status.test.ts`
Expected: FAIL — `Cannot find module './status'` (ou similar, arquivo ainda não existe).

- [ ] **Step 3: Implementar**

`lib/inspection/status.ts`:

```ts
// lib/inspection/status.ts
// Espelha a condicao de public.owns_editable_inspection()
// (supabase/migrations/00008_rls_helpers_and_core.sql) -- unica fonte de
// verdade sobre quando o tecnico ainda pode editar uma inspecao. Nao
// substitui a RLS (que continua sendo o bloqueio real), so evita que a UI
// deixe o usuario bater num erro de permissao sem explicacao.
export type InspectionStatus = "rascunho" | "aguardando_aprovacao" | "devolvida" | "aprovada" | "cancelada";

export function isInspectionEditable(status: InspectionStatus): boolean {
  return status === "rascunho" || status === "devolvida";
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/inspection/status.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/inspection/status.ts lib/inspection/status.test.ts
git commit -m "feat: add isInspectionEditable predicate for técnico submission gate"
```

---

### Task 2: Server action `submitInspectionAction`

**Files:**
- Create: `app/(app)/inspections/[id]/actions.ts`
- Test: `app/(app)/inspections/[id]/actions.test.ts`

**Interfaces:**
- Consumes: `isInspectionEditable(status: InspectionStatus): boolean` (Task 1, `@/lib/inspection/status`); `computeGroupProgress(groups: GroupTemplate[], items: ItemTemplate[], responses: ItemResponseRow[]): GroupProgress[]` (já existe em `@/lib/checklist/progress`).
- Produces: `SubmitInspectionState` (`{status:"idle"} | {status:"error", message:string} | {status:"success"}`) e `submitInspectionAction(prevState, formData): Promise<SubmitInspectionState>` — consumido pela Task 3 (`SubmitInspectionPanel`, via `useActionState`).

- [ ] **Step 1: Escrever o teste**

`app/(app)/inspections/[id]/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const inspectionQuery = {
  select: vi.fn(() => inspectionQuery),
  eq: vi.fn(() => inspectionQuery),
  single: vi.fn(),
  update: vi.fn(() => updateQuery),
};
const updateQuery = { eq: vi.fn() };

const groupsQuery = { select: vi.fn(() => groupsQuery), eq: vi.fn(() => groupsQuery), order: vi.fn() };
const itemsQuery = { select: vi.fn(() => itemsQuery) };
const statusQuery = { select: vi.fn(() => statusQuery), eq: vi.fn() };

const from = vi.fn((table: string) => {
  if (table === "inspections") return inspectionQuery;
  if (table === "checklist_group_templates") return groupsQuery;
  if (table === "checklist_item_templates") return itemsQuery;
  if (table === "checklist_item_status") return statusQuery;
  throw new Error(`unexpected table ${table}`);
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

function formDataWith(inspectionId: string): FormData {
  const fd = new FormData();
  fd.set("inspectionId", inspectionId);
  return fd;
}

beforeEach(() => {
  from.mockClear();
  inspectionQuery.select.mockClear();
  inspectionQuery.eq.mockClear();
  inspectionQuery.single.mockReset();
  inspectionQuery.update.mockClear();
  updateQuery.eq.mockReset();
  groupsQuery.select.mockClear();
  groupsQuery.eq.mockClear();
  groupsQuery.order.mockReset();
  itemsQuery.select.mockReset();
  statusQuery.select.mockClear();
  statusQuery.eq.mockReset();
});

describe("submitInspectionAction", () => {
  it("returns an error without updating when the inspection is not editable", async () => {
    inspectionQuery.single.mockResolvedValue({ data: { status: "aprovada" }, error: null });
    const { submitInspectionAction } = await import("./actions");

    const result = await submitInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("returns an error without updating when there are pending items", async () => {
    inspectionQuery.single.mockResolvedValue({ data: { status: "rascunho" }, error: null });
    groupsQuery.order.mockResolvedValue({
      data: [{ id: "g1", ordem: 1, nome: "Pneus" }],
      error: null,
    });
    itemsQuery.select.mockResolvedValue({ data: [{ id: "i1", group_id: "g1" }], error: null });
    statusQuery.eq.mockResolvedValue({ data: [{ item_template_id: "i1", respondido: false }], error: null });
    const { submitInspectionAction } = await import("./actions");

    const result = await submitInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("updates status to aguardando_aprovacao when there are no pending items", async () => {
    inspectionQuery.single.mockResolvedValue({ data: { status: "devolvida" }, error: null });
    groupsQuery.order.mockResolvedValue({
      data: [{ id: "g1", ordem: 1, nome: "Pneus" }],
      error: null,
    });
    itemsQuery.select.mockResolvedValue({ data: [{ id: "i1", group_id: "g1" }], error: null });
    statusQuery.eq.mockResolvedValue({ data: [{ item_template_id: "i1", respondido: true }], error: null });
    updateQuery.eq.mockResolvedValue({ error: null });
    const { submitInspectionAction } = await import("./actions");

    const result = await submitInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("success");
    expect(inspectionQuery.update).toHaveBeenCalledWith({ status: "aguardando_aprovacao" });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "insp-1");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run "app/(app)/inspections/[id]/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Implementar**

`app/(app)/inspections/[id]/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress } from "@/lib/checklist/progress";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";

export type SubmitInspectionState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

export async function submitInspectionAction(
  _prevState: SubmitInspectionState,
  formData: FormData
): Promise<SubmitInspectionState> {
  const inspectionId = formData.get("inspectionId") as string;
  const supabase = await createClient();

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("status")
    .eq("id", inspectionId)
    .single();

  if (inspectionError || !inspection || !isInspectionEditable(inspection.status as InspectionStatus)) {
    return { status: "error", message: "Esta inspeção já não pode ser enviada." };
  }

  const [
    { data: groups, error: groupsError },
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
  ] = await Promise.all([
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase.from("checklist_item_templates").select("id, group_id"),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", inspectionId),
  ]);

  if (groupsError || itemsError || responsesError) {
    console.error("submitInspectionAction progress fetch failed", { groupsError, itemsError, responsesError });
    return { status: "error", message: "Não foi possível verificar as pendências. Tente novamente." };
  }

  const progress = computeGroupProgress(groups ?? [], items ?? [], responses ?? []);
  const totalPendentes = progress.reduce((sum, g) => sum + g.pendentes, 0);

  if (totalPendentes > 0) {
    return { status: "error", message: "Ainda há itens pendentes na checklist." };
  }

  const { error: updateError } = await supabase
    .from("inspections")
    .update({ status: "aguardando_aprovacao" })
    .eq("id", inspectionId);

  if (updateError) {
    console.error("submitInspectionAction update failed", updateError);
    return { status: "error", message: "Não foi possível enviar a inspeção. Tente novamente." };
  }

  return { status: "success" };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run "app/(app)/inspections/[id]/actions.test.ts"`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/actions.ts" "app/(app)/inspections/[id]/actions.test.ts"
git commit -m "feat: add submitInspectionAction for técnico finalization (RF-23/24)"
```

---

### Task 3: Painel de envio na página de resumo

**Files:**
- Create: `app/(app)/inspections/[id]/submit-inspection-panel.tsx`
- Test: `app/(app)/inspections/[id]/submit-inspection-panel.test.tsx`
- Modify: `app/(app)/inspections/[id]/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `submitInspectionAction`, `SubmitInspectionState` (Task 2); `GroupProgress` type (`@/lib/checklist/progress`); `isInspectionEditable` (Task 1).
- Produces: `SubmitInspectionPanel({ inspectionId, label, progress }: { inspectionId: string; label: string; progress: GroupProgress[] })` — componente client usado só por `page.tsx` desta pasta.

- [ ] **Step 1: Escrever o teste do painel**

`app/(app)/inspections/[id]/submit-inspection-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubmitInspectionPanel } from "./submit-inspection-panel";

const submitInspectionAction = vi.fn();
vi.mock("./actions", () => ({
  submitInspectionAction: (...args: unknown[]) => submitInspectionAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  submitInspectionAction.mockReset();
  refresh.mockClear();
});

describe("SubmitInspectionPanel", () => {
  it("shows pendências per group and a disabled button when there are pending items", () => {
    render(
      <SubmitInspectionPanel
        inspectionId="insp-1"
        label="Finalizar inspeção"
        progress={[
          { id: "g1", ordem: 1, nome: "Pneus", pendentes: 3, total: 5 },
          { id: "g2", ordem: 2, nome: "Travões", pendentes: 0, total: 2 },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Finalizar inspeção" })).toBeDisabled();
    expect(screen.getByText("Pneus: 3 pendentes")).toBeInTheDocument();
    expect(screen.queryByText(/Travões/)).not.toBeInTheDocument();
  });

  it("asks for confirmation before submitting when there are no pending items", () => {
    render(
      <SubmitInspectionPanel
        inspectionId="insp-1"
        label="Finalizar inspeção"
        progress={[{ id: "g1", ordem: 1, nome: "Pneus", pendentes: 0, total: 5 }]}
      />
    );

    const trigger = screen.getByRole("button", { name: "Finalizar inspeção" });
    expect(trigger).not.toBeDisabled();
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "Confirmar envio" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Confirmar envio" })).not.toBeInTheDocument();
  });

  it("shows the action's error message after a failed submit", async () => {
    submitInspectionAction.mockResolvedValue({ status: "error", message: "Ainda há itens pendentes na checklist." });
    render(
      <SubmitInspectionPanel
        inspectionId="insp-1"
        label="Finalizar inspeção"
        progress={[{ id: "g1", ordem: 1, nome: "Pneus", pendentes: 0, total: 5 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar inspeção" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ainda há itens pendentes na checklist.");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run "app/(app)/inspections/[id]/submit-inspection-panel.test.tsx"`
Expected: FAIL — `Cannot find module './submit-inspection-panel'`.

- [ ] **Step 3: Implementar o painel**

`app/(app)/inspections/[id]/submit-inspection-panel.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitInspectionAction, type SubmitInspectionState } from "./actions";
import type { GroupProgress } from "@/lib/checklist/progress";

const initialState: SubmitInspectionState = { status: "idle" };

export function SubmitInspectionPanel({
  inspectionId,
  label,
  progress,
}: {
  inspectionId: string;
  label: string;
  progress: GroupProgress[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(submitInspectionAction, initialState);
  const pendentesPorGrupo = progress.filter((g) => g.pendentes > 0);
  const bloqueado = pendentesPorGrupo.length > 0;

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  if (bloqueado) {
    return (
      <div className="stack">
        <button type="button" className="btn btn-primary" disabled>
          {label}
        </button>
        <ul className="pendencias-list">
          {pendentesPorGrupo.map((g) => (
            <li key={g.id}>
              {g.nome}: {g.pendentes} pendente{g.pendentes === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <p>Depois de enviada, a inspeção deixa de poder ser editada. Confirma o envio?</p>
      <div className="stack-row">
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Confirmar envio
        </button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run "app/(app)/inspections/[id]/submit-inspection-panel.test.tsx"`
Expected: PASS (3 testes).

- [ ] **Step 5: Adicionar CSS de suporte**

Em `app/globals.css`, logo após o bloco `.summary-cta` (linhas 607-613):

```css
.status-banner {
  margin: 0;
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  font-size: 0.9375rem;
  font-weight: 600;
}

.status-banner--warning {
  background: var(--color-amber-100);
  color: var(--color-amber-600);
}

.pendencias-list {
  margin: 0;
  padding-left: var(--space-5);
}
```

- [ ] **Step 6: Ligar o painel à página de resumo**

Editar `app/(app)/inspections/[id]/page.tsx` (arquivo completo, substitui o atual):

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeInspectionValidity } from "@/lib/inspection/validity";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { computeGroupProgress, type GroupProgress } from "@/lib/checklist/progress";
import { SubmitInspectionPanel } from "./submit-inspection-panel";

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

  const validity = computeInspectionValidity(
    inspection.certificado_emitido_em,
    inspection.vehicle_data?.quilometragem ?? 0
  );

  const status = inspection.status as InspectionStatus;
  const editable = isInspectionEditable(status);
  let progress: GroupProgress[] = [];
  let motivoDevolucao: string | null = null;

  if (editable) {
    const [
      { data: groups, error: groupsError },
      { data: items, error: itemsError },
      { data: statuses, error: statusesError },
    ] = await Promise.all([
      supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
      supabase.from("checklist_item_templates").select("id, group_id"),
      supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
    ]);

    if (groupsError || itemsError || statusesError) {
      console.error("inspection summary progress fetch failed", { groupsError, itemsError, statusesError });
    }

    progress = computeGroupProgress(groups ?? [], items ?? [], statuses ?? []);

    if (status === "devolvida") {
      const { data: devolucao } = await supabase
        .from("review_events")
        .select("motivo")
        .eq("inspection_id", id)
        .eq("tipo", "devolucao")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      motivoDevolucao = devolucao?.motivo ?? null;
    }
  }

  return (
    <main className="page">
      <h1>Inspeção criada</h1>
      <div className="panel stack">
        <dl className="summary-grid">
          <div className="summary-grid__row">
            <dt className="label">Matrícula</dt>
            <dd>{inspection.vehicle_data?.matricula}</dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Veículo</dt>
            <dd>
              {inspection.vehicle_data?.marca} {inspection.vehicle_data?.modelo}
            </dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Cliente</dt>
            <dd>
              {inspection.client_data?.nome_solicitante} ({inspection.tipo_cliente})
            </dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Objetivo</dt>
            <dd>{inspection.objetivo}</dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Estado</dt>
            <dd>{inspection.status}</dd>
          </div>
        </dl>

        {validity.status === "valida" && (
          <p className="validity-note validity-note--valid">
            Válida até {validity.validoAte!.toLocaleDateString("pt-PT")} (até {validity.kmLimite} km)
          </p>
        )}
        {validity.status === "expirada" && (
          <p className="validity-note validity-note--expired">
            Expirada em {validity.validoAte!.toLocaleDateString("pt-PT")} (válida para até 100km rodados desde a
            inspeção)
          </p>
        )}

        {motivoDevolucao && (
          <p className="status-banner status-banner--warning">Motivo da devolução: {motivoDevolucao}</p>
        )}
      </div>

      <Link href={`/inspections/${id}/checklist`} className="btn btn-primary summary-cta">
        Ir para a checklist
      </Link>

      {editable && (
        <SubmitInspectionPanel
          inspectionId={id}
          label={status === "devolvida" ? "Reenviar para aprovação" : "Finalizar inspeção"}
          progress={progress}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 7: Rodar toda a suíte e o typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todos os testes passam, zero erros de tipo.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/inspections/[id]/submit-inspection-panel.tsx" \
        "app/(app)/inspections/[id]/submit-inspection-panel.test.tsx" \
        "app/(app)/inspections/[id]/page.tsx" \
        app/globals.css
git commit -m "feat: add finalize/resubmit panel to inspection summary page (RF-23/24, RF-34)"
```

---

### Task 4: Read-only na checklist quando não editável

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/layout.tsx`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `isInspectionEditable` (Task 1).

- [ ] **Step 1: Adicionar o reset de fieldset ao CSS**

Em `app/globals.css`, logo após o bloco `.pendencias-list` adicionado na Task 3:

```css
.fieldset-reset {
  border: none;
  margin: 0;
  padding: 0;
}
```

- [ ] **Step 2: Banner no layout da checklist**

Editar `app/(app)/inspections/[id]/checklist/layout.tsx` (arquivo completo):

```tsx
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress, computeSubcategoriaProgress } from "@/lib/checklist/progress";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { ChecklistNavGroup } from "./checklist-nav-group";

export default async function ChecklistLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inspection } = await supabase.from("inspections").select("id, status").eq("id", id).single();

  if (!inspection) notFound();

  const editable = isInspectionEditable(inspection.status as InspectionStatus);

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
      {!editable && (
        <p className="status-banner status-banner--warning" role="status">
          Esta inspeção já foi enviada e não pode mais ser editada (estado atual: {inspection.status}).
        </p>
      )}
      <nav className="checklist-nav identity-bar" aria-label="Grupos da checklist">
        <h2 className="checklist-nav__title">Checklist</h2>
        <ul className="checklist-nav__list">
          {progress.map((group) => (
            <ChecklistNavGroup
              key={group.id}
              inspectionId={id}
              group={group}
              subcategorias={subcategoriasByGroupId.get(group.id) ?? []}
            />
          ))}
        </ul>
      </nav>
      <main className="checklist-main">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Desabilitar os controles na página de grupo**

Editar `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`: adicionar a busca de `status` e envolver `<ChecklistItemTable>` num `<fieldset>`.

No topo do arquivo, adicionar o import:

```ts
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
```

Logo após a busca do `group` (depois do bloco `if (!group) notFound();`), adicionar:

```ts
  const { data: inspection } = await supabase.from("inspections").select("status").eq("id", id).single();
  const editable = isInspectionEditable((inspection?.status ?? "rascunho") as InspectionStatus);
```

No JSX final, envolver o `<ChecklistItemTable>` existente:

```tsx
      <fieldset disabled={!editable} className="fieldset-reset">
        <ChecklistItemTable
          inspectionId={id}
          items={tableItems}
          allGroupItems={allGroupItemsForSiblings}
          responses={tableResponses}
          opcoes={opcoes ?? []}
          photos={photos ?? []}
          medicaoResultados={medicaoResultados ?? []}
          medicaoValores={medicaoValores ?? []}
        />
      </fieldset>
```

- [ ] **Step 4: Rodar toda a suíte e o typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todos os testes existentes continuam passando (nenhum teste novo nesta task — `page.test.ts` existente já cobre o `notFound`; o comportamento de `fieldset disabled` é coberto manualmente no Step 5), zero erros de tipo.

- [ ] **Step 5: Verificação manual**

Como não há ambiente de browser automatizado neste plano, confirme manualmente (você, humano) antes de considerar a task concluída:
1. Uma inspeção com `status = 'aguardando_aprovacao'` (ou `aprovada`/`cancelada`) mostra o banner de read-only em toda página da checklist, e os botões/inputs dos itens aparecem desabilitados (cinza, não clicáveis).
2. Uma inspeção `rascunho` ou `devolvida` continua editável normalmente, sem banner.
3. Relate o resultado antes de prosseguir para o commit.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/layout.tsx" \
        "app/(app)/inspections/[id]/checklist/[groupId]/page.tsx" \
        app/globals.css
git commit -m "feat: show read-only banner and disable checklist controls when inspection is not editable"
```
