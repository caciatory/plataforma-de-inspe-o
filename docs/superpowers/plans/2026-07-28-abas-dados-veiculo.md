# Abas de dados do veículo (Peça 3, recorte 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar o formulário único de "nova inspeção" (`app/(app)/inspections/new/new-inspection-form.tsx`) em 5 abas (Cliente, Identificação, Histórico, Especificações, Equipamentos), sem criar tela nova nem mudar o envio único no final, e corrigir um bug real: campos não controlados perdem o valor digitado quando o servidor devolve um erro de validação.

**Architecture:** Bottom-up: primeiro o mapa puro campo→aba (`lib/inspection/tabs.ts`, testável isoladamente, sem depender de React), depois a pequena adição em `actions.ts` (o servidor passa a dizer qual campo falhou), depois o CSS das abas (`app/globals.css`, tokens já existentes), e por último a reescrita do formulário em si, que consome as três peças anteriores. Tasks 1–3 não tocam `new-inspection-form.tsx` — o app continua funcionando exatamente como hoje até a Task 4, que é a única que efetivamente liga a nova UI.

**Tech Stack:** Next.js 15 (App Router, Server Actions, `useActionState`), React 19 (`useState`, `useEffect`), TypeScript, Zod, Vitest + Testing Library.

## Global Constraints

- Branch: nova worktree `worktree-peca3-abas-veiculo` (via `superpowers:using-git-worktrees`) — não reaproveitar worktree existente.
- Sem mudança na tela de login, no `create_inspection` RPC, no schema Zod (`lib/inspection/schema.ts`), ou em qualquer tela fora do formulário de nova inspeção — fora de escopo por decisão do design doc §1.
- `security-review` não se aplica — sem mudança de auth/RLS/permissões (design doc §8).
- Trocar de aba é só troca de visualização no navegador — nenhuma aba salva nada sozinha; o envio continua sendo um único `Guardar` no final, como hoje (design doc §2).
- **Histórico** e **Equipamentos** não recebem nenhum campo novo neste recorte — só a aba navegável com um aviso de "sem dados ainda" (design doc §2, §3). Não inventar campo.
- Todo campo de `NewInspectionForm` passa a ser controlado (`useState` + `value` + `onChange`) — corrige ao mesmo tempo a persistência entre abas e o bug de perda de valor no erro (design doc §4).
- O atributo `required` nativo dos campos que já têm hoje (`nomeSolicitante`, `matricula`, `marca`, `modelo`, `quilometragem`) continua exatamente como está — não remover. Um campo `required` dentro de um contêiner com o atributo `hidden` é excluído da validação nativa do navegador (não é "rendered", por spec HTML5), então não bloqueia o envio silenciosamente mesmo estando numa aba diferente da ativa — a validação de verdade continua sendo o Zod do servidor.
- Run `npm test` (não filtrado) ao final de cada task.

**Real discoveries feitas ao ler o código-fonte pra este plano (vs. o que o design doc assumia):**
- O bug de perda de valor (design doc §4) foi reproduzido ao vivo contornando a validação nativa do navegador (`form.noValidate = true`) pra forçar o erro a vir do servidor: campos controlados (`email`, `nomeSolicitante`, `contacto`, `tipoCliente`, `objetivo`) sobreviveram; todos os não controlados (`matricula`, `marca`, `modelo`, `quilometragem`, `versaoTrim`, `anoFabrico`, `anoModelo`, `cor`, `vin`, `numeroMotor`, `numeroPortas`, `combustivel`, `caixaVelocidades`, `tracao`, `potenciaCv`, `torqueNm`, `responsavelPresente`) foram apagados. Confirma a causa raiz do design doc: o React reseta o `<form>` depois de qualquer Server Action, e só campos controlados sobrevivem porque o React os redesenha a partir do estado.
- `hidden` num `<div>` ancestral realmente exclui os campos `required` dentro dele da validação nativa (elemento "não renderizado" não entra na *constraint validation* do HTML5) — confirmado contra a spec, não é uma suposição. Isso significa que o plano **não precisa remover nenhum `required` existente**, só envolver os campos nas divs de aba com `hidden={activeTab !== "..."}`.
- **Gotcha de CSS real, não hipotético:** o atributo `hidden` aplica `display: none` via a folha de estilo do navegador com a mesma especificidade de uma classe CSS simples — se `.form-tabs__panel { display: flex }` for declarada depois na cascata (é, já que é CSS de autor, aplicado depois da UA stylesheet), ela **cancela** o `display: none` do `hidden` e a aba continua visível mesmo escondida. Task 3 já inclui a regra `.form-tabs__panel[hidden] { display: none }` pra blindar contra isso — sem essa regra, o recurso de trocar de aba simplesmente não funcionaria.
- `StandAutocomplete` (`app/(app)/inspections/new/stand-autocomplete.tsx`) e seu teste (`stand-autocomplete.test.tsx`) são reaproveitados sem nenhuma mudança — só muda onde `NewInspectionForm` o renderiza (dentro do painel da aba Cliente, exatamente como já é renderizado hoje).
- A ordem dos issues que o Zod devolve em `parsed.error.issues` segue a ordem dos campos no `z.object({...})` de `inspectionFormSchema` — confirmado lendo `lib/inspection/schema.ts`: `tipoCliente, objetivo, nomeSolicitante, contacto, email, responsavelPresente, matricula, marca, modelo, quilometragem, versaoTrim, ...`. Os testes da Task 2 dependem disso pra prever qual `field` volta primeiro.

---

### Task 1: `lib/inspection/tabs.ts` — mapa puro campo→aba

**Files:**
- Create: `lib/inspection/tabs.ts`
- Test: `lib/inspection/tabs.test.ts`

**Interfaces:**
- Consome: nada novo.
- Produz:
  - `TAB_IDS = ["cliente", "identificacao", "historico", "especificacoes", "equipamentos"] as const` — nova, na ordem de exibição da barra de abas — consumida pela Task 4 (`new-inspection-form.tsx`, pra montar os botões).
  - `TabId = (typeof TAB_IDS)[number]` — novo tipo.
  - `resolveTabForField(field: string | undefined): TabId | null` — nova, devolve a aba de um nome de campo Zod, ou `null` se o campo for desconhecido ou `field` for `undefined` — consumida pela Task 4 pra trocar de aba automaticamente no erro.

- [ ] **Step 1: Write the failing tests**

Criar `lib/inspection/tabs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TAB_IDS, resolveTabForField } from "./tabs";

describe("TAB_IDS", () => {
  it("has the 5 tabs in display order", () => {
    expect(TAB_IDS).toEqual(["cliente", "identificacao", "historico", "especificacoes", "equipamentos"]);
  });
});

describe("resolveTabForField", () => {
  it("maps every Cliente field to the cliente tab", () => {
    expect(resolveTabForField("tipoCliente")).toBe("cliente");
    expect(resolveTabForField("objetivo")).toBe("cliente");
    expect(resolveTabForField("nomeSolicitante")).toBe("cliente");
    expect(resolveTabForField("contacto")).toBe("cliente");
    expect(resolveTabForField("email")).toBe("cliente");
    expect(resolveTabForField("responsavelPresente")).toBe("cliente");
  });

  it("maps every Identificação field to the identificacao tab", () => {
    expect(resolveTabForField("matricula")).toBe("identificacao");
    expect(resolveTabForField("marca")).toBe("identificacao");
    expect(resolveTabForField("modelo")).toBe("identificacao");
    expect(resolveTabForField("versaoTrim")).toBe("identificacao");
    expect(resolveTabForField("anoFabrico")).toBe("identificacao");
    expect(resolveTabForField("anoModelo")).toBe("identificacao");
    expect(resolveTabForField("cor")).toBe("identificacao");
    expect(resolveTabForField("vin")).toBe("identificacao");
    expect(resolveTabForField("quilometragem")).toBe("identificacao");
  });

  it("maps every Especificações field to the especificacoes tab", () => {
    expect(resolveTabForField("numeroMotor")).toBe("especificacoes");
    expect(resolveTabForField("numeroPortas")).toBe("especificacoes");
    expect(resolveTabForField("combustivel")).toBe("especificacoes");
    expect(resolveTabForField("caixaVelocidades")).toBe("especificacoes");
    expect(resolveTabForField("tracao")).toBe("especificacoes");
    expect(resolveTabForField("potenciaCv")).toBe("especificacoes");
    expect(resolveTabForField("torqueNm")).toBe("especificacoes");
  });

  it("returns null for a field with no known tab", () => {
    expect(resolveTabForField("campoInexistente")).toBeNull();
  });

  it("returns null when field is undefined", () => {
    expect(resolveTabForField(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/inspection/tabs.test.ts`
Expected: FAIL — `./tabs` não existe ainda.

- [ ] **Step 3: Write the implementation**

Criar `lib/inspection/tabs.ts`:

```ts
export const TAB_IDS = ["cliente", "identificacao", "historico", "especificacoes", "equipamentos"] as const;

export type TabId = (typeof TAB_IDS)[number];

const FIELD_TO_TAB: Record<string, TabId> = {
  tipoCliente: "cliente",
  objetivo: "cliente",
  nomeSolicitante: "cliente",
  contacto: "cliente",
  email: "cliente",
  responsavelPresente: "cliente",
  matricula: "identificacao",
  marca: "identificacao",
  modelo: "identificacao",
  versaoTrim: "identificacao",
  anoFabrico: "identificacao",
  anoModelo: "identificacao",
  cor: "identificacao",
  vin: "identificacao",
  quilometragem: "identificacao",
  numeroMotor: "especificacoes",
  numeroPortas: "especificacoes",
  combustivel: "especificacoes",
  caixaVelocidades: "especificacoes",
  tracao: "especificacoes",
  potenciaCv: "especificacoes",
  torqueNm: "especificacoes",
};

export function resolveTabForField(field: string | undefined): TabId | null {
  if (!field) return null;
  return FIELD_TO_TAB[field] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/inspection/tabs.test.ts`
Expected: PASS, todos os testes verdes.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — nada mais importa esses exports ainda, então nenhum outro arquivo deve ser afetado.

- [ ] **Step 6: Commit**

```bash
git add lib/inspection/tabs.ts lib/inspection/tabs.test.ts
git commit -m "feat: add pure field-to-tab map for vehicle-data tabs"
```

---

### Task 2: `actions.ts` — devolver qual campo falhou na validação

**Files:**
- Modify: `app/(app)/inspections/new/actions.ts`
- Modify: `app/(app)/inspections/new/actions.test.ts`

**Interfaces:**
- Consome: nada novo.
- Produz:
  - `CreateInspectionState` ganha um campo opcional a mais: `{ status: "idle" } | { status: "error"; message: string; field?: string }` — o `field` novo é consumido pela Task 4 (`new-inspection-form.tsx`, junto com `resolveTabForField` da Task 1) pra trocar de aba automaticamente.
  - `createInspectionAction`, `searchStandContactsAction` e `StandContact` — comportamento inalterado fora do `field` novo no branch de validação.

- [ ] **Step 1: Write the failing tests**

Substituir o conteúdo completo de `app/(app)/inspections/new/actions.test.ts` — é o arquivo já existente com duas asserções novas nos dois testes de erro de validação (tudo mais é idêntico ao que já está no disco hoje):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const clientDataQuery = {
  select: vi.fn(() => clientDataQuery),
  eq: vi.fn(() => clientDataQuery),
  ilike: vi.fn(() => clientDataQuery),
  order: vi.fn(() => clientDataQuery),
  limit: vi.fn(),
};
const from = vi.fn(() => clientDataQuery);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from }),
}));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  rpc.mockReset();
  from.mockClear();
  clientDataQuery.select.mockClear();
  clientDataQuery.eq.mockClear();
  clientDataQuery.ilike.mockClear();
  clientDataQuery.order.mockClear();
  clientDataQuery.limit.mockReset();
  redirect.mockClear();
});

describe("createInspectionAction", () => {
  it("returns a validation error (with the failing field) without calling the RPC when required fields are missing", async () => {
    const { createInspectionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    // matricula/marca/modelo/nomeSolicitante/quilometragem missing

    const result = await createInspectionAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
    if (result.status === "error") {
      expect(result.field).toBe("nomeSolicitante");
    }
  });

  it("returns a validation error (with field=quilometragem) when quilometragem is missing", async () => {
    const { createInspectionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    // quilometragem missing

    const result = await createInspectionAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
    if (result.status === "error") {
      expect(result.field).toBe("quilometragem");
    }
  });

  it("calls create_inspection with mapped params and redirects on success", async () => {
    rpc.mockResolvedValue({ data: "11111111-1111-1111-1111-111111111111", error: null });
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
      "REDIRECT:/inspections/11111111-1111-1111-1111-111111111111"
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_inspection",
      expect.objectContaining({
        p_tipo_cliente: "particular",
        p_objetivo: "compra",
        p_matricula: "AA-00-BB",
        p_marca: "Toyota",
        p_modelo: "Corolla",
        p_nome_solicitante: "Cliente Teste",
        p_quilometragem: 45000,
      })
    );
  });

  it("returns an error when the RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");

    const result = await createInspectionAction({ status: "idle" }, formData);
    expect(result).toEqual({
      status: "error",
      message: "Não foi possível guardar a inspeção. Tente novamente.",
    });
  });
});

describe("searchStandContactsAction", () => {
  it("returns [] for queries under 2 characters without touching the database", async () => {
    const { searchStandContactsAction } = await import("./actions");
    const result = await searchStandContactsAction("S");
    expect(result).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("queries client_data filtered by tipo=stand and the search term (RF-05)", async () => {
    clientDataQuery.limit.mockResolvedValue({
      data: [{ nome_solicitante: "Stand Central", contacto: "910000000", email: "s@c.pt" }],
      error: null,
    });
    const { searchStandContactsAction } = await import("./actions");

    const result = await searchStandContactsAction("Stand");

    expect(from).toHaveBeenCalledWith("client_data");
    expect(clientDataQuery.eq).toHaveBeenCalledWith("tipo", "stand");
    expect(clientDataQuery.ilike).toHaveBeenCalledWith("nome_solicitante", "%Stand%");
    expect(result).toEqual([
      { nome_solicitante: "Stand Central", contacto: "910000000", email: "s@c.pt" },
    ]);
  });

  it("returns [] when the query errors", async () => {
    clientDataQuery.limit.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { searchStandContactsAction } = await import("./actions");
    const result = await searchStandContactsAction("Stand");
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/(app)/inspections/new/actions.test.ts"`
Expected: FAIL — os dois testes novos com `expect(result.field)` falham porque `field` ainda não existe no retorno.

- [ ] **Step 3: Rewrite the implementation**

Substituir o conteúdo completo de `app/(app)/inspections/new/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inspectionFormSchema } from "@/lib/inspection/schema";
import type { StandContact } from "./stand-autocomplete";

export type CreateInspectionState = { status: "idle" } | { status: "error"; message: string; field?: string };

export async function createInspectionAction(
  _prevState: CreateInspectionState,
  formData: FormData
): Promise<CreateInspectionState> {
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
  const { data: inspectionId, error } = await supabase.rpc("create_inspection", {
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
  });

  if (error) {
    console.error("create_inspection failed", error);
    return { status: "error", message: "Não foi possível guardar a inspeção. Tente novamente." };
  }

  redirect(`/inspections/${inspectionId}`);
}

export async function searchStandContactsAction(query: string): Promise<StandContact[]> {
  if (query.trim().length < 2) return [];

  // RF-05: plain select, no RPC. The existing client_data_select RLS policy
  // (supabase/migrations/00008_rls_helpers_and_core.sql) already scopes this to
  // stands the current user can see (técnico: own inspections; admin: all) —
  // see Global Constraints for why cross-técnico visibility was rejected.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_data")
    .select("nome_solicitante, contacto, email")
    .eq("tipo", "stand")
    .ilike("nome_solicitante", `%${query}%`)
    .order("nome_solicitante")
    .limit(5);

  if (error) {
    console.error("searchStandContactsAction failed", error);
    return [];
  }

  return data ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/(app)/inspections/new/actions.test.ts"`
Expected: PASS, todos os testes verdes.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — `new-inspection-form.tsx` ainda não lê `state.field` (isso é Task 4), então nenhum outro teste deve ser afetado.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/new/actions.ts" "app/(app)/inspections/new/actions.test.ts"
git commit -m "feat: return the failing field name from createInspectionAction"
```

---

### Task 3: `app/globals.css` — estilo das abas

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consome: nada (CSS puro, composto só dos tokens já existentes: `--space-*`, `--color-green-*`, `--color-ink*`, `--color-border`, `--font-family-body`).
- Produz: `.form-tabs`, `.form-tabs__button`, `.form-tabs__button--active`, `.form-tabs__panel` — consumidas pela Task 4 (`new-inspection-form.tsx`).

Sem teste — CSS puro, verificado visualmente na verificação obrigatória ponta a ponta no navegador.

- [ ] **Step 1: Add the tab CSS**

Em `app/globals.css`, inserir o bloco a seguir imediatamente antes do bloco `@media (prefers-reduced-motion: reduce)` (hoje o último bloco do arquivo):

```css
/* Form tabs — reorganizes existing single-page forms into labeled sections (Peça 3, recorte 2) */

.form-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-5);
}

.form-tabs__button {
  font-family: var(--font-family-body);
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-ink-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: var(--space-3) var(--space-4);
  min-height: 44px;
  cursor: pointer;
  transition: color 150ms ease-out, border-color 150ms ease-out;
}

.form-tabs__button:hover {
  color: var(--color-ink);
}

.form-tabs__button--active {
  color: var(--color-green-800);
  border-bottom-color: var(--color-green-600);
}

.form-tabs__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* [hidden] and this class both set `display`, same specificity — without
   this rule, whichever the author stylesheet applies last (this one) would
   silently cancel the `hidden` attribute's own display:none. */
.form-tabs__panel[hidden] {
  display: none;
}
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS — mudança só de CSS, nenhum teste deveria ser afetado.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add form-tabs CSS for vehicle-data tab redesign"
```

---

### Task 4: `new-inspection-form.tsx` — reescrever com abas e campos controlados

**Files:**
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx`
- Modify: `app/(app)/inspections/new/new-inspection-form.test.tsx`

**Interfaces:**
- Consome: `TAB_IDS`, `TabId`, `resolveTabForField` (Task 1); `CreateInspectionState` com `field` novo (Task 2); `.form-tabs*` (Task 3); `StandAutocomplete`/`StandContact` (existente, `stand-autocomplete.tsx`, reaproveitado sem mudança); `resolveObjetivo`, `tipoClienteValues`, `objetivoValues`, `TipoCliente`, `Objetivo` (existente, `lib/inspection/schema.ts`, sem mudança).
- Produz: nada novo — exporta só `NewInspectionForm`, o componente de página (`page.tsx`) já a importa e não precisa mudar.

**Notas de design carregadas do design doc + descobertas reais de ler o código-fonte:**
- Todo campo (inclusive os 16 que hoje são `<input>` simples sem `useState`) vira controlado — corrige ao mesmo tempo a persistência entre abas e o bug de perda de valor no erro (ver Global Constraints).
- Os atributos `required`/`type`/`min`/`step` que já existem hoje em cada campo continuam exatamente iguais — só ganham `value`/`onChange`. Não remover `required` de nenhum campo: um `required` dentro de uma aba escondida (`hidden`) é excluído da validação nativa do navegador, então não bloqueia o envio silenciosamente (ver Global Constraints).
- `StandAutocomplete` continua renderizado só quando `tipoCliente === "stand"`, dentro do painel da aba Cliente — nenhuma mudança nele.
- O `<input type="hidden" name="objetivo" .../>` que hoje existe pra quando `objetivo` está desabilitado (cliente stand) continua igual, dentro do painel Cliente.
- Um `useEffect` observa `state`: quando `state.status === "error"`, resolve a aba do `state.field` via `resolveTabForField` e troca `activeTab` se encontrar uma — assim o erro aparece na aba certa mesmo que o usuário estivesse vendo outra.
- Histórico e Equipamentos: painel com só um `<p className="hint">Nenhum dado ainda.</p>`.

- [ ] **Step 1: Write the failing tests**

Substituir o conteúdo completo de `app/(app)/inspections/new/new-inspection-form.test.tsx` — os 3 testes que já existem continuam, com 4 novos ao final:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewInspectionForm } from "./new-inspection-form";

const createInspectionAction = vi.fn(async (_prevState: unknown) => ({ status: "idle" }));
vi.mock("./actions", () => ({
  createInspectionAction: (...args: unknown[]) => createInspectionAction(...args),
  searchStandContactsAction: vi.fn(async () => []),
}));

describe("NewInspectionForm", () => {
  it("locks objetivo to venda when tipoCliente is stand", () => {
    render(<NewInspectionForm />);

    const tipoCliente = screen.getByLabelText("Tipo de cliente") as HTMLSelectElement;
    const objetivo = screen.getByLabelText("Objetivo") as HTMLSelectElement;

    expect(objetivo.disabled).toBe(false);

    fireEvent.change(tipoCliente, { target: { value: "stand" } });

    expect(objetivo.value).toBe("venda");
    expect(objetivo.disabled).toBe(true);
  });

  it("re-enables objetivo when switching back to particular", () => {
    render(<NewInspectionForm />);
    const tipoCliente = screen.getByLabelText("Tipo de cliente") as HTMLSelectElement;
    const objetivo = screen.getByLabelText("Objetivo") as HTMLSelectElement;

    fireEvent.change(tipoCliente, { target: { value: "stand" } });
    fireEvent.change(tipoCliente, { target: { value: "particular" } });

    expect(objetivo.disabled).toBe(false);
  });

  it("submits objetivo=venda via a hidden input when the select is disabled for stand (regression)", async () => {
    createInspectionAction.mockClear();

    const { container } = render(<NewInspectionForm />);
    const tipoCliente = screen.getByLabelText("Tipo de cliente") as HTMLSelectElement;
    const nomeSolicitante = screen.getByLabelText("Nome do solicitante") as HTMLInputElement;

    fireEvent.change(tipoCliente, { target: { value: "stand" } });
    fireEvent.change(nomeSolicitante, { target: { value: "Cliente Teste" } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(createInspectionAction).toHaveBeenCalled());

    const formData = createInspectionAction.mock.calls[0][1] as FormData;
    expect(formData.get("objetivo")).toBe("venda");
  });

  it("shows only the active tab's fields, keeping the others mounted", () => {
    render(<NewInspectionForm />);

    expect(screen.getByLabelText("Nome do solicitante")).toBeVisible();
    expect(screen.queryByLabelText("Matrícula")).not.toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));

    expect(screen.getByLabelText("Matrícula")).toBeVisible();
    expect(screen.queryByLabelText("Nome do solicitante")).not.toBeVisible();
  });

  it("keeps a previously typed value on a hidden tab after switching away and back", () => {
    render(<NewInspectionForm />);

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));
    fireEvent.change(screen.getByLabelText("Matrícula"), { target: { value: "AA-00-BB" } });

    fireEvent.click(screen.getByRole("tab", { name: "Cliente" }));
    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));

    expect((screen.getByLabelText("Matrícula") as HTMLInputElement).value).toBe("AA-00-BB");
  });

  it("keeps a typed value after the server returns a validation error (regression: React resets uncontrolled fields after a Server Action)", async () => {
    createInspectionAction.mockResolvedValueOnce({
      status: "error",
      message: "Matrícula é obrigatória",
      field: "matricula",
    });

    const { container } = render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Toyota" } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Matrícula é obrigatória"));

    expect((screen.getByLabelText("Marca") as HTMLInputElement).value).toBe("Toyota");
  });

  it("switches to the tab containing the field the server reported as invalid", async () => {
    createInspectionAction.mockResolvedValueOnce({
      status: "error",
      message: "Informe o combustível",
      field: "combustivel",
    });

    const { container } = render(<NewInspectionForm />);
    // active tab starts as "cliente"; the erroring field lives in "especificacoes"
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByLabelText("Combustível")).toBeVisible());
    expect(screen.queryByLabelText("Nome do solicitante")).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: FAIL — `role="tab"`/nomes de aba ainda não existem, campos ainda não são controlados.

- [ ] **Step 3: Rewrite the implementation**

Substituir o conteúdo completo de `app/(app)/inspections/new/new-inspection-form.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import {
  resolveObjetivo,
  tipoClienteValues,
  objetivoValues,
  type TipoCliente,
  type Objetivo,
} from "@/lib/inspection/schema";
import { createInspectionAction, type CreateInspectionState } from "./actions";
import { StandAutocomplete, type StandContact } from "./stand-autocomplete";
import { TAB_IDS, resolveTabForField, type TabId } from "@/lib/inspection/tabs";

const initialState: CreateInspectionState = { status: "idle" };

const TAB_LABELS: Record<TabId, string> = {
  cliente: "Cliente",
  identificacao: "Identificação",
  historico: "Histórico",
  especificacoes: "Especificações",
  equipamentos: "Equipamentos",
};

export function NewInspectionForm() {
  const [activeTab, setActiveTab] = useState<TabId>("cliente");
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("particular");
  const [objetivo, setObjetivo] = useState<Objetivo>("compra");
  const [nomeSolicitante, setNomeSolicitante] = useState("");
  const [contacto, setContacto] = useState("");
  const [email, setEmail] = useState("");
  const [responsavelPresente, setResponsavelPresente] = useState("");
  const [matricula, setMatricula] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [quilometragem, setQuilometragem] = useState("");
  const [versaoTrim, setVersaoTrim] = useState("");
  const [anoFabrico, setAnoFabrico] = useState("");
  const [anoModelo, setAnoModelo] = useState("");
  const [cor, setCor] = useState("");
  const [vin, setVin] = useState("");
  const [numeroMotor, setNumeroMotor] = useState("");
  const [numeroPortas, setNumeroPortas] = useState("");
  const [combustivel, setCombustivel] = useState("");
  const [caixaVelocidades, setCaixaVelocidades] = useState("");
  const [tracao, setTracao] = useState("");
  const [potenciaCv, setPotenciaCv] = useState("");
  const [torqueNm, setTorqueNm] = useState("");
  const [state, formAction] = useActionState(createInspectionAction, initialState);

  useEffect(() => {
    if (state.status !== "error") return;
    const tab = resolveTabForField(state.field);
    if (tab) setActiveTab(tab);
  }, [state]);

  function handleTipoClienteChange(value: TipoCliente) {
    setTipoCliente(value);
    setObjetivo(resolveObjetivo(value, objetivo));
  }

  function handleStandSelect(contact: StandContact) {
    setNomeSolicitante(contact.nome_solicitante);
    setContacto(contact.contacto ?? "");
    setEmail(contact.email ?? "");
  }

  return (
    <form action={formAction} className="stack">
      <div className="form-tabs" role="tablist">
        {TAB_IDS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`form-tabs__button${activeTab === tab ? " form-tabs__button--active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "cliente"}>
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Cliente</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="tipoCliente" className="label">
                Tipo de cliente
              </label>
              <select
                id="tipoCliente"
                name="tipoCliente"
                className="input"
                value={tipoCliente}
                onChange={(e) => handleTipoClienteChange(e.target.value as TipoCliente)}
              >
                {tipoClienteValues.map((v) => (
                  <option key={v} value={v}>
                    {v === "particular" ? "Particular" : "Stand"}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="objetivo" className="label">
                Objetivo
              </label>
              <select
                id="objetivo"
                name="objetivo"
                className="input"
                value={objetivo}
                disabled={tipoCliente === "stand"}
                onChange={(e) => setObjetivo(e.target.value as Objetivo)}
              >
                {objetivoValues.map((v) => (
                  <option key={v} value={v}>
                    {v === "compra" ? "Compra" : "Venda"}
                  </option>
                ))}
              </select>
              {tipoCliente === "stand" && <input type="hidden" name="objetivo" value={objetivo} />}
            </div>

            <div className="field">
              <label htmlFor="nomeSolicitante" className="label">
                Nome do solicitante
              </label>
              <input
                id="nomeSolicitante"
                name="nomeSolicitante"
                className="input"
                required
                value={nomeSolicitante}
                onChange={(e) => setNomeSolicitante(e.target.value)}
              />
            </div>

            {tipoCliente === "stand" && <StandAutocomplete onSelect={handleStandSelect} />}

            <div className="field">
              <label htmlFor="contacto" className="label">
                Contacto
              </label>
              <input
                id="contacto"
                name="contacto"
                className="input"
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="responsavelPresente" className="label">
                Responsável presente
              </label>
              <input
                id="responsavelPresente"
                name="responsavelPresente"
                className="input"
                value={responsavelPresente}
                onChange={(e) => setResponsavelPresente(e.target.value)}
              />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "identificacao"}>
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Identificação</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="matricula" className="label">
                Matrícula
              </label>
              <input
                id="matricula"
                name="matricula"
                className="input"
                required
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="marca" className="label">
                Marca
              </label>
              <input
                id="marca"
                name="marca"
                className="input"
                required
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="modelo" className="label">
                Modelo
              </label>
              <input
                id="modelo"
                name="modelo"
                className="input"
                required
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="quilometragem" className="label">
                Quilometragem
              </label>
              <input
                id="quilometragem"
                name="quilometragem"
                type="number"
                className="input"
                required
                min={0}
                value={quilometragem}
                onChange={(e) => setQuilometragem(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="versaoTrim" className="label">
                Versão
              </label>
              <input
                id="versaoTrim"
                name="versaoTrim"
                className="input"
                value={versaoTrim}
                onChange={(e) => setVersaoTrim(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="anoFabrico" className="label">
                Ano de fabrico
              </label>
              <input
                id="anoFabrico"
                name="anoFabrico"
                type="number"
                className="input"
                value={anoFabrico}
                onChange={(e) => setAnoFabrico(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="anoModelo" className="label">
                Ano do modelo
              </label>
              <input
                id="anoModelo"
                name="anoModelo"
                type="number"
                className="input"
                value={anoModelo}
                onChange={(e) => setAnoModelo(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="cor" className="label">
                Cor
              </label>
              <input id="cor" name="cor" className="input" value={cor} onChange={(e) => setCor(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="vin" className="label">
                VIN
              </label>
              <input id="vin" name="vin" className="input" value={vin} onChange={(e) => setVin(e.target.value)} />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "historico"}>
        <p className="hint">Nenhum dado ainda.</p>
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "especificacoes"}>
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Especificações</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="numeroMotor" className="label">
                Número do motor
              </label>
              <input
                id="numeroMotor"
                name="numeroMotor"
                className="input"
                value={numeroMotor}
                onChange={(e) => setNumeroMotor(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="numeroPortas" className="label">
                Número de portas
              </label>
              <input
                id="numeroPortas"
                name="numeroPortas"
                type="number"
                className="input"
                value={numeroPortas}
                onChange={(e) => setNumeroPortas(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="combustivel" className="label">
                Combustível
              </label>
              <input
                id="combustivel"
                name="combustivel"
                className="input"
                value={combustivel}
                onChange={(e) => setCombustivel(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="caixaVelocidades" className="label">
                Caixa de velocidades
              </label>
              <input
                id="caixaVelocidades"
                name="caixaVelocidades"
                className="input"
                value={caixaVelocidades}
                onChange={(e) => setCaixaVelocidades(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="tracao" className="label">
                Tração
              </label>
              <input
                id="tracao"
                name="tracao"
                className="input"
                value={tracao}
                onChange={(e) => setTracao(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="potenciaCv" className="label">
                Potência (cv)
              </label>
              <input
                id="potenciaCv"
                name="potenciaCv"
                type="number"
                className="input"
                value={potenciaCv}
                onChange={(e) => setPotenciaCv(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="torqueNm" className="label">
                Torque (Nm)
              </label>
              <input
                id="torqueNm"
                name="torqueNm"
                type="number"
                step="0.01"
                className="input"
                value={torqueNm}
                onChange={(e) => setTorqueNm(e.target.value)}
              />
            </div>
          </div>
        </fieldset>
      </div>

      <div className="form-tabs__panel" role="tabpanel" hidden={activeTab !== "equipamentos"}>
        <p className="hint">Nenhum dado ainda.</p>
      </div>

      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-primary">
        Guardar
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: PASS, todos os testes verdes (os 3 antigos + os 4 novos).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — esta é a task que efetivamente liga a nova UI; rodar `npx tsc --noEmit` também, já que este arquivo é o primeiro a importar `@/lib/inspection/tabs` numa rota de verdade.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inspections/new/new-inspection-form.tsx" "app/(app)/inspections/new/new-inspection-form.test.tsx"
git commit -m "feat: reorganize new-inspection form into 5 tabs, make every field controlled"
```

---

## After all 4 tasks land

Design doc §7 exige verificação ponta a ponta obrigatória no navegador (conta técnico de teste) antes de considerar esta peça pronta — nenhuma task acima substitui isso. Verificar no mínimo: as 5 abas trocam de visualização sem perder o que foi digitado nas outras; um envio com sucesso continua criando a inspeção e redirecionando, igual hoje; um envio com campo obrigatório vazio numa aba diferente da ativa (ex. deixar Matrícula vazio estando na aba Cliente) mostra o erro E troca sozinho pra aba Identificação, sem apagar o que já tinha sido digitado nas outras abas; o fluxo de `tipoCliente=stand` (autocomplete, trava de objetivo, input escondido) continua funcionando dentro da aba Cliente; Histórico e Equipamentos abrem mostrando o aviso, sem erro de console. Depois, seguir o gate padrão do projeto (`docs/ROADMAP.md`, seção final): `requesting-code-review` → `ponytail-review` → `verify` → `verification-before-completion` → `finishing-a-development-branch`. `security-review` não se aplica (sem mudança de auth/RLS).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
