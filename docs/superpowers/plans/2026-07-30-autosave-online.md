# Fase 3 — Autosave Online (auditoria e correção) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o "piscar" da tela de checklist a cada resposta salva (causado por um `redirect()` vestigial que navega pra si mesmo), padronizar o botão de retry em texto/data, e ajustar o diálogo de medição pra fechar explicitamente em vez de depender desse redirect.

**Architecture:** As 4 Server Actions de salvar item (`saveEscolhaAction`, `saveTextoAction`, `saveDataAction`, `saveMeasurementAction`) param de `redirect(nextUrl)` pra um retorno de sucesso simples; o cliente (`checklist-item-table.tsx`) chama `router.refresh()` depois de um save bem-sucedido — atualiza os dados do servidor (status, badges, contadores) sem trocar de URL nem piscar. O diálogo de medição ganha um callback `onSuccess` explícito (mesmo padrão já usado em `BatchApplyPanel`) no lugar do fechamento que era efeito colateral do redirect.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, Vitest + Testing Library.

## Global Constraints

- `nextUrl`/`pageUrl` é removido de ponta a ponta (actions, `FormData`, props, e o caller em `page.tsx`) — não vira um parâmetro morto/ignorado, é deletado.
- Retry de foto continua exigindo reselecionar o arquivo (decisão do usuário) — nenhuma mudança em `photo-manager.tsx` nesta plano.
- O diálogo de medição continua fechando sozinho depois de salvar (mesmo comportamento visível de hoje) — só a causa muda, de efeito colateral do `redirect()` pra um callback explícito.
- Cada task termina com `npm test -- --run` (suíte inteira) verde antes do commit.
- Verificação manual no navegador é obrigatória antes de fechar a fase inteira (ver §5 do design) — o comportamento central (ausência de piscar/flash de navegação) não é observável via `jsdom`.

---

### Task 1: Server Actions — remover `redirect(nextUrl)`, retornar estado de sucesso

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `saveEscolhaAction`, `saveTextoAction`, `saveDataAction` continuam retornando `{ status: "idle" }` no sucesso (mesmo shape de hoje, só sem `redirect`). `SaveMeasurementState` ganha um terceiro variant — `{ status: "idle" } | { status: "error"; message: string } | { status: "success" }` — e `saveMeasurementAction` retorna `{ status: "success" }` no sucesso. Nenhuma das 4 lê mais `nextUrl` do `FormData`. Task 2 consome o novo variant `"success"` de `SaveMeasurementState`; Task 3 consome o fato de que as 4 actions não redirecionam mais.

- [ ] **Step 1: Atualizar os testes das 4 actions — trocar "redireciona" por "retorna sucesso"**

Em `actions.test.ts`, remova o bloco de mock de `redirect` (não é mais usado por nenhuma das 4 actions):

```ts
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));
```

e a linha `redirect.mockClear();` dentro do `beforeEach`.

Troque o teste `"upserts the response and redirects to nextUrl on success"` (describe `saveEscolhaAction`) por:

```ts
  it("upserts the response and returns idle on success", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: { id: "opt-medio" }, error: null });
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("opcao_id", "opt-medio");
    formData.set("observacao", "Desgaste leve");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result).toEqual({ status: "idle" });
    expect(upsert).toHaveBeenCalledWith(
      { inspection_id: "insp-1", item_template_id: "item-1", opcao_id: "opt-medio", observacao: "Desgaste leve" },
      { onConflict: "inspection_id,item_template_id" }
    );
  });
```

Troque o teste `"calls the RPC with numeric values and redirects on success"` (describe `saveMeasurementAction`) por:

```ts
  it("calls the RPC with numeric values and returns success", async () => {
    rpc.mockResolvedValue({ data: [{ item_response_id: "resp-1", resultado: "ok" }], error: null });
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.append("valor", "100");
    formData.append("valor", "110");
    formData.append("valor", "120");
    formData.set("observacao", "Desgaste leve");

    const result = await saveMeasurementAction({ status: "idle" }, formData);

    expect(result).toEqual({ status: "success" });
    expect(rpc).toHaveBeenCalledWith("save_medicao", {
      p_inspection_id: "insp-1",
      p_item_template_id: "item-1",
      p_valores: [100, 110, 120],
      p_observacao: "Desgaste leve",
    });
  });
```

Troque o teste `"upserts resposta_texto and redirects to nextUrl on success"` (describe `saveTextoAction`) por:

```ts
  it("upserts resposta_texto and returns idle on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("resposta_texto", "Chassi OK, sem avarias visíveis");
    formData.set("observacao", "Verificado às 10h");

    const result = await saveTextoAction({ status: "idle" }, formData);

    expect(result).toEqual({ status: "idle" });
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
```

Troque o teste `"upserts resposta_data and redirects to nextUrl on success"` (describe `saveDataAction`) por:

```ts
  it("upserts resposta_data and returns idle on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("resposta_data", "2026-07-21");
    formData.set("observacao", "");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result).toEqual({ status: "idle" });
    expect(upsert).toHaveBeenCalledWith(
      { inspection_id: "insp-1", item_template_id: "item-1", resposta_data: "2026-07-21", observacao: null },
      { onConflict: "inspection_id,item_template_id" }
    );
  });
```

Por fim, remova todas as ocorrências de `formData.set("nextUrl", ...)` nos demais testes do arquivo (campo morto, não é mais lido pelas actions).

Run: `grep -n 'formData.set("nextUrl"' "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"`
Expected: nenhuma ocorrência.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"`
Expected: FAIL — as 4 actions ainda chamam `redirect(nextUrl)`, então `result` nunca é retornado (a Promise rejeita com o erro do `redirect` real do Next, não o mock que acabamos de remover).

- [ ] **Step 3: Implementar — remover `redirect`/`nextUrl` das 4 actions**

Em `actions.ts`, remova o import não usado:

```ts
import { redirect } from "next/navigation";
```

Atualize o tipo no topo do arquivo:

```ts
export type SaveMeasurementState = { status: "idle" } | { status: "error"; message: string };
```

por:

```ts
export type SaveMeasurementState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };
```

Em `saveEscolhaAction`, remova a linha `const nextUrl = formData.get("nextUrl") as string;` e troque a linha final `redirect(nextUrl);` por `return { status: "idle" };`.

Em `saveMeasurementAction`, remova a linha `const nextUrl = formData.get("nextUrl") as string;` e troque `redirect(nextUrl);` por `return { status: "success" };`.

Em `saveTextoAction`, remova `const nextUrl = formData.get("nextUrl") as string;` e troque `redirect(nextUrl);` por `return { status: "idle" };`.

Em `saveDataAction`, remova `const nextUrl = formData.get("nextUrl") as string;` e troque `redirect(nextUrl);` por `return { status: "idle" };`.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"`
Expected: PASS

- [ ] **Step 5: Rodar toda a suíte e `tsc --noEmit`**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: PASS / sem erros (o `tsc` aqui pega qualquer chamador que ainda passe `nextUrl` como parâmetro esperado por essas actions — não deveria haver nenhum, mas confirma).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
git commit -m "fix: drop vestigial redirect-to-self from checklist item save actions"
```

---

### Task 2: `ItemMedicaoForm` — fechar o diálogo via callback `onSuccess`

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.test.tsx` (novo)

**Interfaces:**
- Consumes: `SaveMeasurementState` com o variant `{ status: "success" }` (Task 1).
- Produces: `ItemMedicaoForm` ganha o prop `onSuccess?: () => void`, chamado quando `saveMeasurementAction` retorna `{ status: "success" }`. Perde o prop `nextUrl` (e o `<input type="hidden" name="nextUrl">` correspondente). Task 3 consome esse novo prop `onSuccess`.

- [ ] **Step 1: Teste — `onSuccess` dispara só no sucesso**

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemMedicaoForm } from "./item-medicao-form";

const saveMeasurementAction = vi.fn();
vi.mock("./actions", () => ({
  saveMeasurementAction: (...args: unknown[]) => saveMeasurementAction(...args),
}));

vi.mock("./photo-manager", () => ({
  PhotoManager: () => <div data-testid="photo-manager" />,
}));

describe("ItemMedicaoForm", () => {
  it("calls onSuccess when the save action returns status success", async () => {
    saveMeasurementAction.mockResolvedValue({ status: "success" });
    const onSuccess = vi.fn();
    const { container } = render(
      <ItemMedicaoForm
        inspectionId="insp-1"
        itemTemplateId="item-1"
        qtdPontos={1}
        unidadeMedicao="µm"
        initialValores={[]}
        initialObservacao={null}
        initialPhotos={[]}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText("Ponto 1"), { target: { value: "120" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("does not call onSuccess when the save action returns an error", async () => {
    saveMeasurementAction.mockResolvedValue({ status: "error", message: "Preencha todos os valores." });
    const onSuccess = vi.fn();
    const { container } = render(
      <ItemMedicaoForm
        inspectionId="insp-1"
        itemTemplateId="item-1"
        qtdPontos={1}
        unidadeMedicao="µm"
        initialValores={[]}
        initialObservacao={null}
        initialPhotos={[]}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText("Ponto 1"), { target: { value: "120" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Preencha todos os valores."));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("no longer renders a nextUrl hidden input", () => {
    const { container } = render(
      <ItemMedicaoForm
        inspectionId="insp-1"
        itemTemplateId="item-1"
        qtdPontos={1}
        unidadeMedicao={null}
        initialValores={[]}
        initialObservacao={null}
        initialPhotos={[]}
      />
    );
    expect(container.querySelector('input[name="nextUrl"]')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.test.tsx"`
Expected: FAIL — `ItemMedicaoForm` ainda exige o prop `nextUrl` (TS) e não tem `onSuccess`.

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `item-medicao-form.tsx` por:

```tsx
// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx
"use client";

import { useActionState, useEffect } from "react";
import { saveMeasurementAction, type SaveMeasurementState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";

const initialState: SaveMeasurementState = { status: "idle" };

export function ItemMedicaoForm({
  inspectionId,
  itemTemplateId,
  qtdPontos,
  unidadeMedicao,
  initialValores,
  initialObservacao,
  initialPhotos,
  onSuccess,
}: {
  inspectionId: string;
  itemTemplateId: string;
  qtdPontos: number;
  unidadeMedicao: string | null;
  initialValores: number[];
  initialObservacao: string | null;
  initialPhotos: Photo[];
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(saveMeasurementAction, initialState);
  const pontos = Array.from({ length: qtdPontos }, (_, i) => i);
  const legend = unidadeMedicao ? `Medição (${unidadeMedicao})` : "Medição";

  useEffect(() => {
    if (state.status === "success") onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />

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

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.test.tsx"
git commit -m "feat: add onSuccess callback to ItemMedicaoForm, drop nextUrl"
```

---

### Task 3: `checklist-item-table.tsx` — `router.refresh()`, retry em texto/data, remover `pageUrl`

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx`

**Interfaces:**
- Consumes: as 4 Server Actions sem `redirect`/`nextUrl` (Task 1); `ItemMedicaoForm` com prop `onSuccess` (Task 2).
- Produces: nada de novo pra outras tasks — última task da plano.

- [ ] **Step 1: Atualizar os testes existentes — remover `pageUrl`, adicionar mock de `useRouter`**

Em `checklist-item-table.test.tsx`, adicione o mock de `next/navigation` logo abaixo dos mocks já existentes:

```ts
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
```

Adicione `refresh.mockClear();` dentro do `beforeEach` já existente.

Troque o mock de `ItemMedicaoForm`:

```tsx
vi.mock("./[itemId]/item-medicao-form", () => ({
  ItemMedicaoForm: ({ itemTemplateId }: { itemTemplateId: string }) => (
    <div data-testid="item-medicao-form">Medição de {itemTemplateId}</div>
  ),
}));
```

por:

```tsx
vi.mock("./[itemId]/item-medicao-form", () => ({
  ItemMedicaoForm: ({ itemTemplateId, onSuccess }: { itemTemplateId: string; onSuccess?: () => void }) => (
    <div data-testid="item-medicao-form">
      Medição de {itemTemplateId}
      <button onClick={() => onSuccess?.()}>Simular sucesso</button>
    </div>
  ),
}));
```

Remova a prop `pageUrl="/x"` de todas as chamadas `<ChecklistItemTable ... />` no arquivo (11 ocorrências).

Run: `grep -n 'pageUrl="/x"' "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx"`
Expected: nenhuma ocorrência.

- [ ] **Step 2: Novos testes — `router.refresh()` e retry**

Adicione ao final do `describe("ChecklistItemTable", ...)`:

```tsx
  it("calls router.refresh() after saving an escolha option successfully", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "idle" });
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
      />
    );

    fireEvent.click(screen.getByLabelText("Bom"));

    await waitFor(() => expect(saveEscolhaAction).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not call router.refresh() when saving escolha fails", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "error", message: "Falhou" });
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
      />
    );

    fireEvent.click(screen.getByLabelText("Bom"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a Tentar novamente button for texto and calls router.refresh() once the retry succeeds", async () => {
    saveTextoAction.mockResolvedValue({ status: "error", message: "Falhou" });
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
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "9BWZZZ377VT004251" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();

    saveTextoAction.mockResolvedValue({ status: "idle" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(saveTextoAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("shows a Tentar novamente button for data and calls router.refresh() once the retry succeeds", async () => {
    saveDataAction.mockResolvedValue({ status: "error", message: "Falhou" });
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
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-21" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    saveDataAction.mockResolvedValue({ status: "idle" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(saveDataAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("refreshes and closes the medição dialog when ItemMedicaoForm reports success", () => {
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
      />
    );

    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(screen.getByRole("button", { name: "Medir" }));
    expect(dialog.open).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Simular sucesso" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
  });
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx"`
Expected: FAIL — `ChecklistItemTable` ainda exige `pageUrl` (TS), nenhuma célula chama `router.refresh()`, texto/data não têm botão de retry.

- [ ] **Step 4: Implementar — remover `pageUrl`/`nextUrl`, adicionar `router.refresh()` e retry**

Em `checklist-item-table.tsx`, adicione o import:

```ts
import { useRouter } from "next/navigation";
```

Remova `pageUrl` do tipo/destructuring de `ChecklistItemTable` e da chamada de cada célula dentro do `.map` (remova `nextUrl={pageUrl}` das quatro: `EscolhaCell`, `TextoCell`, `DataCell`, `MedicaoCell`).

Troque `buildEscolhaFormData` por:

```ts
function buildEscolhaFormData(
  inspectionId: string,
  itemTemplateId: string,
  opcaoId: string,
  observacao: string
): FormData {
  const formData = new FormData();
  formData.set("inspectionId", inspectionId);
  formData.set("itemTemplateId", itemTemplateId);
  formData.set("opcao_id", opcaoId);
  formData.set("observacao", observacao);
  return formData;
}
```

Troque `EscolhaCell` inteira por:

```tsx
function EscolhaCell({
  inspectionId,
  item,
  response,
  opcoes,
  photos,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  opcoes: TableOpcao[];
  photos: Photo[];
}) {
  const [opcaoId, setOpcaoId] = useState(response?.opcao_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(currentOpcaoId: string) {
    setError(null);
    const formData = buildEscolhaFormData(inspectionId, item.id, currentOpcaoId, response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveEscolhaAction({ status: "idle" }, formData);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
    });
  }

  function handleChange(newOpcaoId: string) {
    setOpcaoId(newOpcaoId);
    save(newOpcaoId);
  }

  const requiresPhoto = opcoes.find((o) => o.id === opcaoId)?.exige_foto === true;

  return (
    <div className="escolha-options">
      {opcoes.map((o) => (
        <label key={o.id} className={`escolha-option escolha-option--${resolveEscolhaColorModifier(opcoes, o.id)}`}>
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
      {requiresPhoto && (
        <PhotoManager inspectionId={inspectionId} itemTemplateId={item.id} initialPhotos={photos} />
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {error && (
        <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => save(opcaoId)}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
```

Troque `TextoCell` inteira por:

```tsx
function TextoCell({
  inspectionId,
  item,
  response,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
}) {
  const [value, setValue] = useState(response?.resposta_texto ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(currentValue: string) {
    setError(null);
    const formData = new FormData();
    formData.set("inspectionId", inspectionId);
    formData.set("itemTemplateId", item.id);
    formData.set("resposta_texto", currentValue);
    formData.set("observacao", response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveTextoAction({ status: "idle" }, formData);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
    });
  }

  function handleBlur() {
    if (value === (response?.resposta_texto ?? "")) return;
    save(value);
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
      {error && (
        <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => save(value)}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
```

Troque `DataCell` inteira por:

```tsx
function DataCell({
  inspectionId,
  item,
  response,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
}) {
  const [value, setValue] = useState(response?.resposta_data ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function save(currentValue: string) {
    setError(null);
    const formData = new FormData();
    formData.set("inspectionId", inspectionId);
    formData.set("itemTemplateId", item.id);
    formData.set("resposta_data", currentValue);
    formData.set("observacao", response?.observacao ?? "");
    startTransition(async () => {
      const result = await saveDataAction({ status: "idle" }, formData);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
    });
  }

  function handleBlur() {
    if (value === (response?.resposta_data ?? "")) return;
    save(value);
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
      {error && (
        <button type="button" className="btn btn-secondary" disabled={isPending} onClick={() => save(value)}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
```

Troque `MedicaoCell` inteira por:

```tsx
function MedicaoCell({
  inspectionId,
  item,
  response,
  resultado,
  initialValores,
  initialPhotos,
}: {
  inspectionId: string;
  item: TableItem;
  response: TableResponse | undefined;
  resultado: "ok" | "atencao" | "critico" | null;
  initialValores: number[];
  initialPhotos: Photo[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
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

  function handleMedicaoSaved() {
    router.refresh();
    dialogRef.current?.close();
  }

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
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => dialogRef.current?.close()}
        >
          Cancelar
        </button>
        <ItemMedicaoForm
          inspectionId={inspectionId}
          itemTemplateId={item.id}
          qtdPontos={item.qtd_pontos_medicao ?? 1}
          unidadeMedicao={item.unidade_medicao}
          initialValores={initialValores}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={initialPhotos}
          onSuccess={handleMedicaoSaved}
        />
      </dialog>
    </>
  );
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx"`
Expected: PASS

- [ ] **Step 6: Remover `pageUrl` do caller (`page.tsx`)**

Em `app/(app)/inspections/[id]/checklist/[groupId]/page.tsx`, remova as duas linhas:

```ts
  const subParam = activeSubcategoria ?? SEM_SUBCATEGORIA_PARAM;
  const pageUrl = `/inspections/${id}/checklist/${groupId}?sub=${encodeURIComponent(subParam)}`;
```

e a prop `pageUrl={pageUrl}` da chamada `<ChecklistItemTable ... />`. Se `SEM_SUBCATEGORIA_PARAM` ficar sem nenhum outro uso no arquivo depois disso, remova também esse import (confira com `grep -n SEM_SUBCATEGORIA_PARAM "app/(app)/inspections/[id]/checklist/[groupId]/page.tsx"` — se aparecer só na linha do import, o import também sai; a função `groupItemsBySubcategoria` que usa a constante internamente continua importada normalmente).

- [ ] **Step 7: Rodar toda a suíte e `tsc --noEmit`**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: PASS / sem erros de tipo.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/page.tsx"
git commit -m "fix: replace redirect-to-self with router.refresh(), add retry to texto/data cells"
```

---

## Self-Review

**Cobertura do spec:** §2 (causa raiz do piscar) → Task 1 (remove redirect) + Task 3 (router.refresh). §3.1 (Server Actions) → Task 1. §3.2 (remoção de `nextUrl`/`pageUrl` de ponta a ponta) → Tasks 1, 2, 3 (cada uma remove sua parte da cadeia). §3.3 (`router.refresh()` + fechamento do diálogo de medição) → Tasks 2 e 3. §3.4 (retry padronizado) → Task 3. §4 (testes) → embutido em cada task. §5 (verificação manual) → fora das tasks, é o gate de fechamento da fase (`verify`/navegador antes de `finishing-a-development-branch`).

**Consistência de tipos:** `SaveMeasurementState` com o variant `"success"` definido na Task 1 é exatamente o que a Task 2 consome no `useEffect` (`state.status === "success"`) — mesmo nome de campo, mesmo literal. `onSuccess?: () => void` como prop de `ItemMedicaoForm` (Task 2, produz) é o mesmo nome e assinatura que `MedicaoCell` usa ao passar `onSuccess={handleMedicaoSaved}` (Task 3, consome). Nenhuma task deixa `nextUrl` para trás: Task 1 remove da leitura em `actions.ts`, Task 2 remove do prop/hidden-input de `ItemMedicaoForm`, Task 3 remove do prop `pageUrl` de `ChecklistItemTable` e do caller em `page.tsx` — a cadeia inteira fecha dentro desta plano, nada fica "quase removido".

**Placeholders:** nenhum `TBD`/`TODO` — todo step tem código completo, incluindo os testes novos e as substituições de função inteira.
