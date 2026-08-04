# Reescrita do "aplicar aos demais" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o mecanismo de gravação do lote "aplicar aos demais" (RPC atômico `apply_opcoes_batch`) por chamadas sequenciais da mesma Server Action já usada pelo salvamento individual (`saveEscolhaAction`), e trocar a sincronização visual de um `useEffect` de resync (que não resolveu o sintoma em teste ao vivo) por remontagem via `key` — eliminando o bug onde um lote aplicado a itens irmãos não refletia na tela sem reabrir o diálogo.

**Architecture:** `BatchApplyPanel.handleConfirm()` chama `saveEscolhaAction` uma vez por linha incluída, em sequência, dentro de um único `startTransition`, parando no primeiro erro; um único `router.refresh()` no final se tudo salvar. `EscolhaCell` ganha uma `key` derivada do valor de resposta atual, forçando o React a desmontar/remontar sempre que a resposta mudar por uma fonte externa ao próprio componente (lote, outro técnico) — sem precisar sincronizar estado manualmente.

**Tech Stack:** Next.js App Router (Server Actions), React 19, TypeScript, Vitest + Testing Library.

## Global Constraints

- Escopo só cobre itens `tipo='escolha'` — `TextoCell`/`DataCell` não participam de `grupo_replicacao` hoje e não são tocados neste plano.
- `apply_opcoes_batch` (RPC + migration `00035`) fica no banco sem uso — sem migration de drop.
- Perda de atomicidade no lote é aceita: se uma linha falhar no meio, as anteriores já salvas ficam salvas; o loop para ali, sem continuar pros itens seguintes.
- `npm test` e `npx tsc --noEmit` devem ficar limpos ao final de cada task.

---

### Task 1: Mover `buildEscolhaFormData` pra `lib/checklist/siblings.ts`

`batch-apply-panel.tsx` vai precisar da mesma função de montagem de `FormData` que `checklist-item-table.tsx` já usa pra `saveEscolhaAction`. Os dois arquivos já importam de `lib/checklist/siblings.ts` (não há import circular entre eles), então esse é o lugar certo pra compartilhar — em vez de duplicar a função nos dois lugares.

**Files:**
- Modify: `lib/checklist/siblings.ts`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx:183-195` (remove a função local, troca o import)

**Interfaces:**
- Produces: `buildEscolhaFormData(inspectionId: string, itemTemplateId: string, opcaoId: string, observacao: string): FormData`, exportada de `lib/checklist/siblings.ts`, usada pela Task 2 e pelo `EscolhaCell` existente.

- [ ] **Step 1: Adicionar a função em `lib/checklist/siblings.ts`**

No final do arquivo (depois de `resolveEscolhaColorModifier`), adicionar:

```ts
export function buildEscolhaFormData(
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

- [ ] **Step 2: Remover a função local de `checklist-item-table.tsx` e importar a versão compartilhada**

Remover o bloco (linhas 183-195 do arquivo atual):

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

No topo do arquivo, o import de `lib/checklist/siblings.ts` já existe assim:

```ts
import {
  deriveSiblingRows,
  buildBatchRows,
  resolveEscolhaColorModifier,
  type BatchRow,
  type SiblingSourceItem,
  type SiblingResponseRow,
} from "@/lib/checklist/siblings";
```

Trocar por (adiciona `buildEscolhaFormData` na lista):

```ts
import {
  deriveSiblingRows,
  buildBatchRows,
  buildEscolhaFormData,
  resolveEscolhaColorModifier,
  type BatchRow,
  type SiblingSourceItem,
  type SiblingResponseRow,
} from "@/lib/checklist/siblings";
```

- [ ] **Step 3: Rodar a suíte pra confirmar que o move não quebrou nada**

Run: `npx tsc --noEmit && npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx"`
Expected: `tsc` sem erros, todos os testes existentes passando (é um move puro, nenhum comportamento muda).

- [ ] **Step 4: Commit**

```bash
git add lib/checklist/siblings.ts "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx"
git commit -m "refactor: move buildEscolhaFormData to lib/checklist/siblings.ts (shared by BatchApplyPanel next)"
```

---

### Task 2: `BatchApplyPanel` — trocar o RPC de lote por chamadas sequenciais de `saveEscolhaAction`

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.tsx`
- Test: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx`

**Interfaces:**
- Consumes: `saveEscolhaAction(prevState: {status:"idle"}, formData: FormData): Promise<{status:"idle"} | {status:"error", message:string}>` (de `./actions`, já existe, mesma assinatura usada por `EscolhaCell.save()`); `buildEscolhaFormData` da Task 1 (de `@/lib/checklist/siblings`).
- Produces: nenhuma interface nova exposta — `handleConfirm` continua sendo um handler interno do componente.

- [ ] **Step 1: Escrever os testes que description o novo comportamento (substituindo os que testavam `applyOpcoesBatchAction`)**

Em `batch-apply-panel.test.tsx`, trocar o topo do arquivo (imports e mocks) — de:

```ts
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

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  applyOpcoesBatchAction.mockReset();
  refresh.mockClear();
});
```

para:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BatchApplyPanel } from "./batch-apply-panel";

const saveEscolhaAction = vi.fn();
vi.mock("./actions", () => ({
  saveEscolhaAction: (...args: unknown[]) => saveEscolhaAction(...args),
  attachPhotoAction: vi.fn(),
  deletePhotoAction: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) } }),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  saveEscolhaAction.mockReset();
  refresh.mockClear();
});
```

O restante do arquivo (`opcoes`, `rowA`, `rowB`, `rowAlreadyAnswered`, e os testes "renders one fieldset...", "shows already-answered siblings...", "re-includes an already-answered sibling...", "calls onCancel...") fica igual. No teste `"blocks confirmation and names the row when a row whose opcao exige_foto has no photo, without calling the action"`, trocar a última linha:

```ts
    expect(applyOpcoesBatchAction).not.toHaveBeenCalled();
```

por:

```ts
    expect(saveEscolhaAction).not.toHaveBeenCalled();
```

Substituir o teste `"submits only included rows and refreshes the router on success"` por:

```ts
  it("calls saveEscolhaAction once per included row, in order, then refreshes the router", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "idle" });

    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA, rowB, rowAlreadyAnswered]} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(saveEscolhaAction).toHaveBeenCalledTimes(2));

    expect(saveEscolhaAction.mock.calls[0][1].get("itemTemplateId")).toBe("item-1");
    expect(saveEscolhaAction.mock.calls[0][1].get("opcao_id")).toBe("opt-otimo");
    expect(saveEscolhaAction.mock.calls[0][1].get("observacao")).toBe("Sem avarias");
    expect(saveEscolhaAction.mock.calls[1][1].get("itemTemplateId")).toBe("item-2");

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("stops at the first failing row without saving the rest, and does not refresh", async () => {
    saveEscolhaAction
      .mockResolvedValueOnce({ status: "idle" })
      .mockResolvedValueOnce({ status: "error", message: "Não foi possível guardar." });

    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA, rowB]} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível guardar."));
    expect(saveEscolhaAction).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
  });
```

E o teste `"shows the action's error message and does not refresh on failure"` vira:

```ts
  it("shows the action's error message and does not refresh on failure", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "error", message: "Não foi possível guardar." });

    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA]} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível guardar."));
    expect(refresh).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Rodar os testes pra confirmar que falham (o componente ainda chama a action antiga)**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"`
Expected: FAIL — `saveEscolhaAction` nunca é chamada (o componente ainda importa `applyOpcoesBatchAction`), erros de "not defined"/mock não usado.

- [ ] **Step 3: Reescrever `handleConfirm` em `batch-apply-panel.tsx`**

Trocar o import (linha 5-7 do arquivo atual):

```ts
import { applyOpcoesBatchAction } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";
import { resolveEscolhaColorModifier, type BatchRow, type Opcao } from "@/lib/checklist/siblings";
```

por:

```ts
import { saveEscolhaAction } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";
import { buildEscolhaFormData, resolveEscolhaColorModifier, type BatchRow, type Opcao } from "@/lib/checklist/siblings";
```

Trocar o corpo de `handleConfirm` (linhas 31-60 do arquivo atual):

```ts
  function handleConfirm() {
    setError(null);

    const includedRows = rows.filter((r) => r.included);
    const exigeFotoByOpcaoId = new Map(opcoes.map((o) => [o.id, o.exige_foto]));
    const missingFoto = includedRows.filter((r) => exigeFotoByOpcaoId.get(r.opcao_id) && r.photos.length === 0);
    if (missingFoto.length > 0) {
      setError(`Anexe pelo menos 1 foto antes de confirmar: ${missingFoto.map((r) => r.nome).join(", ")}.`);
      return;
    }

    startTransition(async () => {
      const result = await applyOpcoesBatchAction(
        inspectionId,
        includedRows.map((r) => ({
          itemTemplateId: r.itemTemplateId,
          opcaoId: r.opcao_id,
          observacao: r.observacao || null,
        }))
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      onSuccess?.();
    });
  }
```

por:

```ts
  function handleConfirm() {
    setError(null);

    const includedRows = rows.filter((r) => r.included);
    const exigeFotoByOpcaoId = new Map(opcoes.map((o) => [o.id, o.exige_foto]));
    const missingFoto = includedRows.filter((r) => exigeFotoByOpcaoId.get(r.opcao_id) && r.photos.length === 0);
    if (missingFoto.length > 0) {
      setError(`Anexe pelo menos 1 foto antes de confirmar: ${missingFoto.map((r) => r.nome).join(", ")}.`);
      return;
    }

    startTransition(async () => {
      // Mesma Server Action que o salvamento individual (EscolhaCell.save())
      // já usa — reaproveitada aqui em vez do RPC de lote, pra ter a mesma
      // confiabilidade comprovada. Não é atômico: uma falha no meio para o
      // loop e deixa os itens anteriores já salvos (decisão aceita — a
      // checagem de foto acima já cobre o caso comum de bloqueio).
      for (const row of includedRows) {
        const formData = buildEscolhaFormData(inspectionId, row.itemTemplateId, row.opcao_id, row.observacao);
        const result = await saveEscolhaAction({ status: "idle" }, formData);
        if (result.status === "error") {
          setError(result.message);
          return;
        }
      }

      router.refresh();
      onSuccess?.();
    });
  }
```

- [ ] **Step 4: Rodar os testes pra confirmar que passam**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"`
Expected: PASS — todos os testes, incluindo os 2 novos.

- [ ] **Step 5: `tsc` limpo**

Run: `npx tsc --noEmit`
Expected: sem erros (confirma que nada mais no repo ainda referencia o `applyOpcoesBatchAction` importado aqui — a Task 4 remove a função em si).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.tsx" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/batch-apply-panel.test.tsx"
git commit -m "fix: BatchApplyPanel reuses saveEscolhaAction instead of the batch RPC"
```

---

### Task 3: `EscolhaCell` — trocar o `useEffect` de resync por remontagem via `key`

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx`

**Interfaces:**
- Nenhuma interface pública muda — `EscolhaCell` continua com as mesmas props.

- [ ] **Step 1: Remover o `useEffect` de resync de `EscolhaCell`**

Remover (linhas 219-226 do arquivo atual, dentro de `EscolhaCell`):

```ts
  // useState's initializer only runs on mount — when a sibling save (batch
  // apply) or another técnico's edit updates this item's response out from
  // under this component via router.refresh(), the prop changes but this
  // local copy doesn't, leaving the pill showing the pre-update selection
  // until the técnico happens to touch it. Resync whenever the prop moves.
  useEffect(() => {
    setOpcaoId(response?.opcao_id ?? "");
  }, [response?.opcao_id]);

```

(`useEffect` continua importado e usado por `TextoCell`/`DataCell` — não remover o import.)

- [ ] **Step 2: Adicionar `key` na chamada de `EscolhaCell` dentro de `ChecklistItemTable`**

Trocar (linhas 111-121 do arquivo atual):

```tsx
                {item.tipo === "escolha" && (
                  <EscolhaCell
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    opcoes={opcoes.filter((o) => o.conjunto_id === item.conjunto_opcao_id)}
                    photos={response ? (photosByResponseId.get(response.id) ?? []) : []}
                    onSaveStart={() => markOptimistic(item.id)}
                    onSaveError={() => unmarkOptimistic(item.id)}
                  />
                )}
```

por:

```tsx
                {item.tipo === "escolha" && (
                  <EscolhaCell
                    // Força remount quando a resposta muda por uma fonte
                    // externa ao componente (lote aplicado num irmão, outro
                    // técnico) — mais robusto que sincronizar manualmente via
                    // useEffect (tentativa anterior, não resolveu em teste ao
                    // vivo). O useState inicial já lê o valor fresco do prop.
                    key={`${item.id}:${response?.opcao_id ?? "vazio"}`}
                    inspectionId={inspectionId}
                    item={item}
                    response={response}
                    opcoes={opcoes.filter((o) => o.conjunto_id === item.conjunto_opcao_id)}
                    photos={response ? (photosByResponseId.get(response.id) ?? []) : []}
                    onSaveStart={() => markOptimistic(item.id)}
                    onSaveError={() => unmarkOptimistic(item.id)}
                  />
                )}
```

- [ ] **Step 3: Rodar a suíte de `checklist-item-table.test.tsx` — o teste de resync já existente deve continuar passando**

Run: `npm test -- --run "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.test.tsx"`
Expected: PASS em todos, incluindo `"resyncs the escolha pill and row state when the response prop changes externally"` — o teste não conhece o mecanismo interno (efeito vs. remount), só verifica o resultado visível, então continua válido como está.

- [ ] **Step 4: `tsc` limpo**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/checklist-item-table.tsx"
git commit -m "fix: remount EscolhaCell via key instead of useEffect resync when response changes externally"
```

---

### Task 4: Deletar `applyOpcoesBatchAction` órfã de `actions.ts` e seus testes

**Files:**
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts:144-197`
- Modify: `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts:230-314`

**Interfaces:**
- Remove: `BatchItem` (type) e `applyOpcoesBatchAction` (function) de `./actions` — confirmar antes de deletar que não sobrou nenhum import (Task 2 já trocou o único caller).

- [ ] **Step 1: Confirmar que não há mais nenhum caller**

Run: `grep -rn "applyOpcoesBatchAction\|BatchItem" --include="*.ts" --include="*.tsx" app lib | grep -v "actions.ts:" | grep -v "actions.test.ts:"`
Expected: nenhum resultado (Task 2 já trocou `batch-apply-panel.tsx`; se aparecer algo, pare e investigue antes de deletar).

- [ ] **Step 2: Remover `BatchItem` e `applyOpcoesBatchAction` de `actions.ts`**

Remover o bloco completo (linhas 144-197 do arquivo atual):

```ts
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

(mantém uma linha em branco entre `saveMeasurementAction` e `saveTextoAction`, exatamente como já é entre as outras actions do arquivo)

- [ ] **Step 3: Remover o bloco `describe("applyOpcoesBatchAction", ...)` de `actions.test.ts`**

Remover o bloco completo (linhas 230-314 do arquivo atual, do `describe("applyOpcoesBatchAction", ...)` até o `});` que o fecha) — os 4 testes que chamavam `applyOpcoesBatchAction`. Não mexer nos mocks compartilhados (`templateQuery`, `opcoesQuery`, `rpc`) no topo do arquivo — `rpc` e o padrão `.eq()/.single()` continuam usados por `saveMeasurementAction`; os campos `.in` de `templateQuery`/`opcoesQuery` ficam sem uso mas não atrapalham (não vale o churn de tocar a definição do mock compartilhado por causa disso).

- [ ] **Step 4: Rodar a suíte completa**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: `tsc` sem erros; todos os testes passando (contagem total menor que antes, já que 4 testes de `applyOpcoesBatchAction` saíram e 1 novo entrou na Task 2 — resultado líquido esperado é próximo do anterior, não precisa bater um número exato, só não pode ter regressão).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.ts" "app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/actions.test.ts"
git commit -m "chore: remove orphaned applyOpcoesBatchAction (superseded by Task 2)"
```

---

### Task 5: Verificação final e nota pro usuário testar ao vivo

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Suíte completa + typecheck**

Run: `npx tsc --noEmit && npm test -- --run`
Expected: ambos limpos.

- [ ] **Step 2: Grep de confirmação — nada mais referencia o RPC de lote no código de app**

Run: `grep -rn "apply_opcoes_batch\|applyOpcoesBatchAction" --include="*.ts" --include="*.tsx" app lib`
Expected: nenhum resultado (o RPC continua só no banco/migrations, sem nenhuma referência no código TypeScript).

- [ ] **Step 3: Pedir verificação manual ao usuário**

Não é automatizável — pedir pro usuário: abrir um item de grupo (ex. um pneu), responder, clicar no ícone 👪, marcar 1+ irmãos, confirmar, fechar o diálogo, e confirmar que a tela já mostra os irmãos como respondidos **sem reabrir o diálogo de novo**. Esse é o critério de "pronto" que os 2 patches anteriores não bateram.

- [ ] **Step 4: Atualizar `docs/ROADMAP.md`**

Na seção "Pendências descobertas em teste ao vivo", item 3 — trocar "ainda sem `brainstorming`/plano próprio" por uma nota de conclusão (data, resumo do que mudou, resultado da verificação do usuário), seguindo o mesmo estilo narrativo das outras entradas do documento.

- [ ] **Step 5: Commit da atualização do ROADMAP**

```bash
git add docs/ROADMAP.md
git commit -m "docs: sync ROADMAP — reescrita do aplicar-aos-demais concluída"
```
