# Relatório final da inspeção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o relatório final da inspeção (`/inspections/[id]/relatorio`) — página web acessível só a usuários autenticados, com identidade visual dark-glassmorphism exclusiva, consolidando veículo/checklist/pontuação/parceiro/certificado — e habilitar o botão "Gerar relatório" hoje desabilitado.

**Architecture:** Server Components para busca de dados (mesmo padrão já usado em `app/(app)/inspections/[id]/page.tsx` e `.../checklist/[groupId]/page.tsx`); um Client Component só para a seção interativa (grupos colapsáveis + diálogos de foto/comentário); toda a agregação de dados (grupo → subcategoria → item, contagem OK/atenção, cor por resposta) isolada em funções puras testáveis (`lib/report/`). Nenhuma view nova no banco — reaproveita `inspection_score`, `vehicle_data`, `checklist_item_responses`/`_templates`, `opcoes`, `medicoes_resultado`, `photos`.

**Tech Stack:** Next.js App Router (Server Actions, `useActionState`), Supabase (Postgres + RLS + Storage), TypeScript, Vitest + Testing Library, CSS puro (sem Tailwind/CSS Modules — segue o padrão de arquivo único `app/globals.css` já usado no projeto).

## Global Constraints

- RF-50: `client_data` (nome/contacto/email do solicitante) nunca é consultado nem renderizado nesta página — só `vehicle_data` (técnico) e o bloco de parceiro (dado independente, digitado pelo admin).
- Classificação usa só A/B/C reais de `inspection_score` — **não existe grau "A+"**; nota exibida na escala real 0-10 (não 0-100).
- Selo "Elegível para Garantia" é fixo/estático (branding), nunca condicionado a dado de inspeção — decisão explícita do usuário, mantida apesar de não ter dado real por trás.
- Identidade visual dark-glassmorphism é **exclusiva desta rota** (`/inspections/[id]/relatorio`) — não deve vazar para o resto do app nem reconciliar com `DESIGN.md`. Toda regra CSS nova fica escopada sob a classe `.relatorio-page`.
- Acesso só autenticado (mesma regra de leitura de `inspections_select`: `is_admin()` ou `tecnico_id = auth.uid()`); sem tela pública nesta fase.
- Sem pipeline de PDF — impressão via `@media print` do navegador.
- Código de certificado: 8 caracteres, alfabeto `A-Z0-9`, gerado só em `approveInspectionAction`.
- Sem RLS nova em nenhuma tabela — todas as escritas novas (parceiro, fotos de capa) já são cobertas por policies existentes com bypass `is_admin()` (`inspections_update`, `photos_insert`/`photos_delete`, `fotos_inspecao_insert` no storage).

---

## File Structure

**Novos:**
- `supabase/migrations/00052_relatorio_parceiro.sql` — 3 colunas nullable em `inspections`.
- `supabase/tests/00052_relatorio_parceiro.test.sql` — cobertura RLS (admin escreve em inspeção aprovada, técnico não-admin é bloqueado).
- `lib/report/certificado.ts` — gera o código de 8 caracteres.
- `lib/report/certificado.test.ts`
- `lib/report/build-relatorio.ts` — agrega templates/respostas/opções/medições/fotos num `ReportGroup[]` pronto para renderizar.
- `lib/report/build-relatorio.test.ts`
- `app/(app)/admin/actions.ts` — `saveParceiroAction`, `attachCapaPhotoAction`, `deleteCapaPhotoAction`.
- `app/(app)/admin/actions.test.ts`
- `app/(app)/admin/fotos-parceiro-dialog.tsx` — diálogo do admin (fotos de capa + campos do parceiro).
- `app/(app)/admin/fotos-parceiro-dialog.test.tsx`
- `app/(app)/inspections/[id]/relatorio/page.tsx` — Server Component: dados, hero, specs, parceiro, veredito, rodapé.
- `app/(app)/inspections/[id]/relatorio/analise-tecnica.tsx` — Client Component: grupos colapsáveis + diálogos.
- `app/(app)/inspections/[id]/relatorio/analise-tecnica.test.tsx`
- `app/(app)/inspections/[id]/relatorio/relatorio.css` — identidade visual dark-glass, escopada sob `.relatorio-page`.

**Modificados:**
- `app/(app)/inspections/[id]/actions.ts` — `approveInspectionAction` passa a gerar `codigo_certificado`/`certificado_emitido_em`.
- `app/(app)/inspections/[id]/actions.test.ts` — novo assert na suíte de `approveInspectionAction`.
- `lib/inspection/admin-list.ts` — `AdminInspectionRow` ganha `parceiroNome` (usado só para decidir se mostra "editar" vs "adicionar" no botão — não é exibido na tabela).
- `lib/inspection/admin-list.test.ts` — cobre o campo novo.
- `app/(app)/admin/page.tsx` — inclui `parceiro_nome, parceiro_logo_url, parceiro_telefone` no select.
- `app/(app)/admin/inspections-table.tsx` — botão "Fotos & Parceiro" (só quando `status === 'aprovada'`) + monta o diálogo.
- `app/(app)/inspections/[id]/page.tsx` — botão "Gerar relatório" habilitado e virando `<Link>` quando `status === 'aprovada'`.

---

### Task 1: Migration — colunas do parceiro

**Files:**
- Create: `supabase/migrations/00052_relatorio_parceiro.sql`
- Create: `supabase/tests/00052_relatorio_parceiro.test.sql`

**Interfaces:**
- Produces: `inspections.parceiro_nome text`, `inspections.parceiro_logo_url text`, `inspections.parceiro_telefone text` (todas nullable) — consumidas pelas Tasks 4 e 5.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/00052_relatorio_parceiro.sql
-- Fase 6 (relatorio final): docs/superpowers/specs/2026-08-12-relatorio-final-design.md
-- secao 4.1. Campos do parceiro/stand, preenchidos do zero pelo admin numa
-- secao separada apos a aprovacao (nao bloqueiam approveInspectionAction).
-- Nullable -- nem toda inspecao tem parceiro associado. Sem RLS nova: a
-- policy inspections_update (00008_rls_helpers_and_core.sql) ja permite
-- is_admin() escrever independente do status da inspecao.
alter table public.inspections
  add column parceiro_nome text,
  add column parceiro_logo_url text,
  add column parceiro_telefone text;
```

- [ ] **Step 2: Escrever o teste SQL (RLS + bypass de admin)**

```sql
-- supabase/tests/00052_relatorio_parceiro.test.sql
-- Cobre a migration 00052: colunas de parceiro sao escritas via a policy
-- inspections_update ja existente (00008), sem policy nova. Confirma que
-- admin escreve mesmo com a inspecao ja aprovada (nao editavel) e que um
-- tecnico nao-admin continua bloqueado.

begin;

insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'admin-00052@example.com');
insert into public.users (id, nome, email, role) values
  ('44444444-4444-4444-4444-444444444444', 'Admin 00052', 'admin-00052@example.com', 'admin');

insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'tecnico-00052@example.com');
insert into public.users (id, nome, email, role) values
  ('55555555-5555-5555-5555-555555555555', 'Tecnico 00052', 'tecnico-00052@example.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

do $$
declare
  v_inspection_id uuid;
begin
  v_inspection_id := public.create_inspection(
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-052',
    p_marca => 'Marca',
    p_modelo => 'Modelo',
    p_nome_solicitante => 'Cliente',
    p_quilometragem => 1000
  );
  perform set_config('test.inspection_id', v_inspection_id::text, true);
end $$;

reset role;

set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';

do $$
declare
  v_inspection_id uuid := current_setting('test.inspection_id')::uuid;
  v_nome text;
begin
  -- admin aprova (bypassa o trigger de transicao, 00045) e escreve parceiro_* na mesma chamada
  update public.inspections
  set status = 'aprovada', parceiro_nome = 'Stand Central', parceiro_telefone = '351912345678'
  where id = v_inspection_id;

  select parceiro_nome into v_nome from public.inspections where id = v_inspection_id;
  if v_nome <> 'Stand Central' then
    raise exception 'FALHOU: admin nao conseguiu escrever parceiro_nome numa inspecao aprovada';
  end if;
  raise notice 'OK: admin aprova e escreve parceiro_* na mesma inspecao (sem policy nova)';
end $$;

reset role;

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

do $$
declare
  v_inspection_id uuid := current_setting('test.inspection_id')::uuid;
  v_count int;
begin
  update public.inspections set parceiro_nome = 'Tentativa Tecnico' where id = v_inspection_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico nao-admin conseguiu escrever parceiro_nome em inspecao aprovada';
  end if;
  raise notice 'OK: tecnico nao-admin bloqueado (0 linhas) ao tentar escrever parceiro_* em inspecao aprovada';
end $$;

reset role;
rollback;
```

- [ ] **Step 3: Aplicação manual**

Este ambiente não tem acesso autenticado ao Supabase CLI. Peça ao usuário para rodar a migration e o teste (via `supabase db push` local ou colando no SQL Editor do painel Supabase) e reportar o resultado (as duas linhas `raise notice 'OK: ...'` devem aparecer, sem `FALHOU`) antes de seguir para a Task 2.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00052_relatorio_parceiro.sql supabase/tests/00052_relatorio_parceiro.test.sql
git commit -m "feat: adicionar colunas de parceiro em inspections"
```

---

### Task 2: Geração do código de certificado na aprovação

**Files:**
- Create: `lib/report/certificado.ts`
- Create: `lib/report/certificado.test.ts`
- Modify: `app/(app)/inspections/[id]/actions.ts:69-103` (`approveInspectionAction`)
- Modify: `app/(app)/inspections/[id]/actions.test.ts:134-150`

**Interfaces:**
- Produces: `gerarCodigoCertificado(): string` — usada só por `approveInspectionAction`.

- [ ] **Step 1: Escrever o teste da função pura**

```ts
// lib/report/certificado.test.ts
import { describe, it, expect } from "vitest";
import { gerarCodigoCertificado } from "./certificado";

describe("gerarCodigoCertificado", () => {
  it("gera um código de 8 caracteres maiúsculos/numéricos", () => {
    const codigo = gerarCodigoCertificado();
    expect(codigo).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("gera códigos diferentes em chamadas sucessivas", () => {
    const codigos = new Set(Array.from({ length: 20 }, () => gerarCodigoCertificado()));
    expect(codigos.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run lib/report/certificado.test.ts`
Expected: FAIL — `Cannot find module './certificado'`

- [ ] **Step 3: Implementar**

```ts
// lib/report/certificado.ts
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function gerarCodigoCertificado(): string {
  return Array.from({ length: 8 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join("");
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/report/certificado.test.ts`
Expected: PASS

- [ ] **Step 5: Atualizar `approveInspectionAction` para gerar o certificado**

Em `app/(app)/inspections/[id]/actions.ts`, adicionar o import e trocar o `update` final:

```ts
import { gerarCodigoCertificado } from "@/lib/report/certificado";
```

```ts
  const { error: updateError } = await supabase
    .from("inspections")
    .update({
      status: "aprovada",
      codigo_certificado: gerarCodigoCertificado(),
      certificado_emitido_em: new Date().toISOString(),
    })
    .eq("id", inspectionId);
```

- [ ] **Step 6: Atualizar o teste existente de `approveInspectionAction`**

Em `app/(app)/inspections/[id]/actions.test.ts`, trocar o assert final do teste `"inserts an aprovacao review_event and updates status to aprovada"`:

```ts
    expect(result.status).toBe("success");
    expect(reviewEventsQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      tipo: "aprovacao",
      autor_id: "admin-1",
    });
    const updateArgs = inspectionQuery.update.mock.calls[0][0];
    expect(updateArgs.status).toBe("aprovada");
    expect(updateArgs.codigo_certificado).toMatch(/^[A-Z0-9]{8}$/);
    expect(typeof updateArgs.certificado_emitido_em).toBe("string");
```

- [ ] **Step 7: Rodar a suíte inteira do arquivo e confirmar que passa**

Run: `npx vitest run "app/(app)/inspections/[id]/actions.test.ts"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add lib/report/certificado.ts lib/report/certificado.test.ts "app/(app)/inspections/[id]/actions.ts" "app/(app)/inspections/[id]/actions.test.ts"
git commit -m "feat: gerar codigo de certificado na aprovacao da inspecao"
```

---

### Task 3: `lib/report/build-relatorio.ts` — agregação pura grupo/item

**Files:**
- Create: `lib/report/build-relatorio.ts`
- Create: `lib/report/build-relatorio.test.ts`

**Interfaces:**
- Consumes: `resolveEscolhaColorModifier(opcoes, opcaoId)` de `@/lib/checklist/siblings` (assinatura já existente, `lib/checklist/siblings.ts:88-101`).
- Produces (usado pelas Tasks 5 e 6):
  ```ts
  export type ReportItemStatus = "otimo" | "medio" | "ruim" | "na" | "info";
  export type ReportItem = {
    id: string;
    nome: string;
    subcategoria: string | null;
    respostaLabel: string;
    status: ReportItemStatus;
    fotos: { id: string; url: string }[];
    comentario: string | null;
    piscaComentario: boolean;
  };
  export type ReportGroup = { id: string; nome: string; ok: number; atencao: number; items: ReportItem[] };
  export function buildRelatorioGrupos(
    groups: RelatorioGroupTemplate[],
    items: RelatorioItemTemplate[],
    responses: RelatorioResponse[],
    opcoes: RelatorioOpcao[],
    medicaoResultados: RelatorioMedicaoResultado[],
    photos: RelatorioPhoto[]
  ): ReportGroup[]
  ```

- [ ] **Step 1: Escrever os testes**

```ts
// lib/report/build-relatorio.test.ts
import { describe, it, expect } from "vitest";
import { buildRelatorioGrupos } from "./build-relatorio";

const groups = [
  { id: "g1", ordem: 1, nome: "Pneus" },
  { id: "g2", ordem: 2, nome: "Sem resposta nenhuma" },
];

const items = [
  { id: "i1", group_id: "g1", subcategoria: "Rodas", nome: "Pneu dianteiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i2", group_id: "g1", subcategoria: "Rodas", nome: "Pneu traseiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i3", group_id: "g1", subcategoria: "Travões", nome: "Espessura pastilha", tipo: "medicao" as const, conjunto_opcao_id: null },
  { id: "i4", group_id: "g1", subcategoria: "Rodas", nome: "Cor da jante", tipo: "texto" as const, conjunto_opcao_id: null },
  { id: "i5", group_id: "g2", subcategoria: null, nome: "Item nunca respondido", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
];

const opcoes = [
  { id: "o1", conjunto_id: "c1", label: "Ótimo", ordem: 1, exige_foto: false },
  { id: "o2", conjunto_id: "c1", label: "Médio", ordem: 2, exige_foto: false },
  { id: "o3", conjunto_id: "c1", label: "Mau", ordem: 3, exige_foto: true },
];

const responses = [
  { id: "r1", item_template_id: "i1", opcao_id: "o1", resposta_texto: null, resposta_data: null, observacao: null },
  { id: "r2", item_template_id: "i2", opcao_id: "o3", resposta_texto: null, resposta_data: null, observacao: "Risco fundo na lateral" },
  { id: "r3", item_template_id: "i3", opcao_id: null, resposta_texto: null, resposta_data: null, observacao: null },
  { id: "r4", item_template_id: "i4", opcao_id: null, resposta_texto: "Preto", resposta_data: null, observacao: "Cor repintada" },
];

const medicaoResultados = [{ item_response_id: "r3", resultado: "critico" as const }];

const photos = [{ id: "p1", url: "https://example.com/a.jpg", item_response_id: "r2" }];

describe("buildRelatorioGrupos", () => {
  it("só inclui grupos com pelo menos um item respondido (RF-46)", () => {
    const result = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    expect(result.map((g) => g.id)).toEqual(["g1"]);
  });

  it("classifica escolha pela posição da opção (ótimo/ruim)", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const pneuDianteiro = grupo.items.find((i) => i.id === "i1")!;
    const pneuTraseiro = grupo.items.find((i) => i.id === "i2")!;
    expect(pneuDianteiro.status).toBe("otimo");
    expect(pneuTraseiro.status).toBe("ruim");
    expect(pneuDianteiro.respostaLabel).toBe("Ótimo");
    expect(pneuTraseiro.respostaLabel).toBe("Mau");
  });

  it("classifica medição por medicoes_resultado.resultado", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const medicao = grupo.items.find((i) => i.id === "i3")!;
    expect(medicao.status).toBe("ruim");
    expect(medicao.respostaLabel).toBe("Crítico");
  });

  it("texto/data nunca são destacados (status info)", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const texto = grupo.items.find((i) => i.id === "i4")!;
    expect(texto.status).toBe("info");
    expect(texto.respostaLabel).toBe("Preto");
  });

  it("conta OK/atenção por grupo com base em quantos itens são 'ruim'", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    expect(grupo.atencao).toBe(2); // i2 (ruim) + i3 (crítico -> ruim)
    expect(grupo.ok).toBe(2); // i1 (ótimo) + i4 (info)
  });

  it("anexa fotos ao item pela resposta correspondente", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const pneuTraseiro = grupo.items.find((i) => i.id === "i2")!;
    expect(pneuTraseiro.fotos).toEqual([{ id: "p1", url: "https://example.com/a.jpg" }]);
    expect(grupo.items.find((i) => i.id === "i1")!.fotos).toEqual([]);
  });

  it("pisca o comentário só quando o item também está 'ruim' (RF-48 + regra do piscar)", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const pneuTraseiro = grupo.items.find((i) => i.id === "i2")!; // ruim + comentário
    const textoComComentario = grupo.items.find((i) => i.id === "i4")!; // info + comentário
    expect(pneuTraseiro.piscaComentario).toBe(true);
    expect(textoComComentario.piscaComentario).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run lib/report/build-relatorio.test.ts`
Expected: FAIL — `Cannot find module './build-relatorio'`

- [ ] **Step 3: Implementar**

```ts
// lib/report/build-relatorio.ts
import { resolveEscolhaColorModifier, type Opcao } from "@/lib/checklist/siblings";

export type RelatorioGroupTemplate = { id: string; ordem: number; nome: string };
export type RelatorioItemTemplate = {
  id: string;
  group_id: string;
  subcategoria: string | null;
  nome: string;
  tipo: "escolha" | "medicao" | "texto" | "data";
  conjunto_opcao_id: string | null;
};
export type RelatorioResponse = {
  id: string;
  item_template_id: string;
  opcao_id: string | null;
  resposta_texto: string | null;
  resposta_data: string | null;
  observacao: string | null;
};
export type RelatorioOpcao = Opcao & { conjunto_id: string };
export type RelatorioMedicaoResultado = { item_response_id: string; resultado: "ok" | "atencao" | "critico" };
export type RelatorioPhoto = { id: string; url: string; item_response_id: string };

export type ReportItemStatus = "otimo" | "medio" | "ruim" | "na" | "info";

export type ReportItem = {
  id: string;
  nome: string;
  subcategoria: string | null;
  respostaLabel: string;
  status: ReportItemStatus;
  fotos: { id: string; url: string }[];
  comentario: string | null;
  piscaComentario: boolean;
};

export type ReportGroup = { id: string; nome: string; ok: number; atencao: number; items: ReportItem[] };

const MEDICAO_LABEL: Record<RelatorioMedicaoResultado["resultado"], string> = {
  ok: "Conforme",
  atencao: "Atenção",
  critico: "Crítico",
};

const MEDICAO_STATUS: Record<RelatorioMedicaoResultado["resultado"], ReportItemStatus> = {
  ok: "otimo",
  atencao: "medio",
  critico: "ruim",
};

function resolveStatusAndLabel(
  item: RelatorioItemTemplate,
  response: RelatorioResponse,
  opcoesDoConjunto: RelatorioOpcao[],
  medicaoByResponseId: Map<string, RelatorioMedicaoResultado["resultado"]>
): { status: ReportItemStatus; respostaLabel: string } {
  if (item.tipo === "escolha") {
    if (!response.opcao_id) return { status: "info", respostaLabel: "Sem resposta" };
    const opcao = opcoesDoConjunto.find((o) => o.id === response.opcao_id);
    const status = resolveEscolhaColorModifier(opcoesDoConjunto, response.opcao_id) as ReportItemStatus;
    return { status, respostaLabel: opcao?.label ?? "Sem resposta" };
  }
  if (item.tipo === "medicao") {
    const resultado = medicaoByResponseId.get(response.id);
    if (!resultado) return { status: "info", respostaLabel: "Sem resposta" };
    return { status: MEDICAO_STATUS[resultado], respostaLabel: MEDICAO_LABEL[resultado] };
  }
  if (item.tipo === "texto") {
    return { status: "info", respostaLabel: response.resposta_texto ?? "Sem resposta" };
  }
  // data
  return {
    status: "info",
    respostaLabel: response.resposta_data ? new Date(response.resposta_data).toLocaleDateString("pt-PT") : "Sem resposta",
  };
}

export function buildRelatorioGrupos(
  groups: RelatorioGroupTemplate[],
  items: RelatorioItemTemplate[],
  responses: RelatorioResponse[],
  opcoes: RelatorioOpcao[],
  medicaoResultados: RelatorioMedicaoResultado[],
  photos: RelatorioPhoto[]
): ReportGroup[] {
  const responseByItemId = new Map(responses.map((r) => [r.item_template_id, r]));
  const medicaoByResponseId = new Map(medicaoResultados.map((m) => [m.item_response_id, m.resultado]));
  const fotosByResponseId = new Map<string, { id: string; url: string }[]>();
  for (const p of photos) {
    const list = fotosByResponseId.get(p.item_response_id) ?? [];
    list.push({ id: p.id, url: p.url });
    fotosByResponseId.set(p.item_response_id, list);
  }
  const itemsByGroupId = new Map<string, RelatorioItemTemplate[]>();
  for (const item of items) {
    const list = itemsByGroupId.get(item.group_id) ?? [];
    list.push(item);
    itemsByGroupId.set(item.group_id, list);
  }

  return groups
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((group) => {
      const reportItems: ReportItem[] = (itemsByGroupId.get(group.id) ?? [])
        .map((item): ReportItem | null => {
          const response = responseByItemId.get(item.id);
          if (!response) return null;
          const opcoesDoConjunto = opcoes.filter((o) => o.conjunto_id === item.conjunto_opcao_id);
          const { status, respostaLabel } = resolveStatusAndLabel(item, response, opcoesDoConjunto, medicaoByResponseId);
          return {
            id: item.id,
            nome: item.nome,
            subcategoria: item.subcategoria,
            respostaLabel,
            status,
            fotos: fotosByResponseId.get(response.id) ?? [],
            comentario: response.observacao,
            piscaComentario: response.observacao !== null && status === "ruim",
          };
        })
        .filter((i): i is ReportItem => i !== null);

      return {
        id: group.id,
        nome: group.nome,
        ok: reportItems.filter((i) => i.status !== "ruim").length,
        atencao: reportItems.filter((i) => i.status === "ruim").length,
        items: reportItems,
      };
    })
    .filter((g) => g.items.length > 0);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run lib/report/build-relatorio.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/report/build-relatorio.ts lib/report/build-relatorio.test.ts
git commit -m "feat: agregacao pura de grupos/itens do relatorio final"
```

---

### Task 4: Admin — diálogo "Fotos & Parceiro"

**Files:**
- Create: `app/(app)/admin/actions.ts`
- Create: `app/(app)/admin/actions.test.ts`
- Create: `app/(app)/admin/fotos-parceiro-dialog.tsx`
- Create: `app/(app)/admin/fotos-parceiro-dialog.test.tsx`
- Modify: `lib/inspection/admin-list.ts`
- Modify: `lib/inspection/admin-list.test.ts`
- Modify: `app/(app)/admin/page.tsx`
- Modify: `app/(app)/admin/inspections-table.tsx`

**Interfaces:**
- Consumes: `Task 1` colunas `parceiro_*`; padrão de upload de `app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/photo-manager.tsx` (bucket `fotos-inspecao`, `supabase.storage.from("fotos-inspecao").upload/getPublicUrl`).
- Produces: `saveParceiroAction(inspectionId, formData) => Promise<{error?: string}>`, `attachCapaPhotoAction(inspectionId, url) => Promise<{error?: string; photoId?: string}>`, `deleteCapaPhotoAction(photoId) => Promise<{error?: string}>` — consumidos só pelo diálogo desta task.

- [ ] **Step 1: Expor `status` já existe em `AdminInspectionRow` — adicionar só `parceiroNome`**

`lib/inspection/admin-list.ts` — trocar a assinatura e o corpo:

```ts
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
  parceiroNome: string | null;
};

export function buildAdminInspectionRows(
  inspections: {
    id: string;
    status: InspectionStatus;
    tipo_cliente: "particular" | "stand";
    data_abertura: string;
    atrasada: boolean;
    parceiro_nome: string | null;
    vehicle_data: { matricula: string; marca: string; modelo: string } | null;
    users: { nome: string } | null;
  }[],
  scores: { inspection_id: string; nota_geral: number; classificacao: string }[]
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
      atrasada: i.atrasada,
      parceiroNome: i.parceiro_nome,
    };
  });
}
```

- [ ] **Step 2: Atualizar `lib/inspection/admin-list.test.ts`**

Adicionar `parceiro_nome: null` (e num segundo caso `"Stand Central"`) nos dois objetos de `inspections`, e um teste novo:

```ts
  it("passa parceiroNome adiante, null quando a inspeção não tem parceiro", () => {
    const rows = buildAdminInspectionRows(inspections, scores);
    expect(rows[0].parceiroNome).toBeNull();
  });
```

(Adicionar `parceiro_nome: null` no objeto `insp-1` e `parceiro_nome: "Stand Central"` no objeto `insp-2` do array `inspections` já existente no topo do arquivo, para o teste ter os dois casos.)

- [ ] **Step 3: Rodar o teste e confirmar que passa**

Run: `npx vitest run lib/inspection/admin-list.test.ts`
Expected: PASS

- [ ] **Step 4: Escrever o teste das server actions**

```ts
// app/(app)/admin/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const inspectionsQuery: any = { update: vi.fn(() => updateQuery) };
const updateQuery: any = { eq: vi.fn() };
const photosInsertQuery: any = { insert: vi.fn(() => photosSelectQuery) };
const photosSelectQuery: any = { select: vi.fn(() => photosSingleQuery) };
const photosSingleQuery: any = { single: vi.fn() };
const photosDeleteQuery: any = { delete: vi.fn(() => photosDeleteEqQuery) };
const photosDeleteEqQuery: any = { eq: vi.fn() };

const from = vi.fn((table: string) => {
  if (table === "inspections") return inspectionsQuery;
  if (table === "photos") return { insert: photosInsertQuery.insert, delete: photosDeleteQuery.delete };
  throw new Error(`unexpected table ${table}`);
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

beforeEach(() => {
  from.mockClear();
  inspectionsQuery.update.mockClear();
  updateQuery.eq.mockReset();
  photosInsertQuery.insert.mockClear();
  photosSelectQuery.select.mockClear();
  photosSingleQuery.single.mockReset();
  photosDeleteQuery.delete.mockClear();
  photosDeleteEqQuery.eq.mockReset();
});

describe("saveParceiroAction", () => {
  it("faz update dos 3 campos de parceiro na inspeção", async () => {
    updateQuery.eq.mockResolvedValue({ error: null });
    const { saveParceiroAction } = await import("./actions");

    const formData = new FormData();
    formData.set("parceiro_nome", "Stand Central");
    formData.set("parceiro_logo_url", "https://example.com/logo.png");
    formData.set("parceiro_telefone", "351912345678");

    const result = await saveParceiroAction("insp-1", formData);

    expect(result.error).toBeUndefined();
    expect(inspectionsQuery.update).toHaveBeenCalledWith({
      parceiro_nome: "Stand Central",
      parceiro_logo_url: "https://example.com/logo.png",
      parceiro_telefone: "351912345678",
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "insp-1");
  });

  it("retorna erro amigável quando o update falha", async () => {
    updateQuery.eq.mockResolvedValue({ error: { message: "boom" } });
    const { saveParceiroAction } = await import("./actions");

    const result = await saveParceiroAction("insp-1", new FormData());

    expect(result.error).toBe("Não foi possível guardar os dados do parceiro. Tente novamente.");
  });
});

describe("attachCapaPhotoAction", () => {
  it("insere a foto com contexto='capa' e item_response_id null", async () => {
    photosSingleQuery.single.mockResolvedValue({ data: { id: "photo-1" }, error: null });
    const { attachCapaPhotoAction } = await import("./actions");

    const result = await attachCapaPhotoAction("insp-1", "https://example.com/capa.jpg");

    expect(result.photoId).toBe("photo-1");
    expect(photosInsertQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      contexto: "capa",
      item_response_id: null,
      url: "https://example.com/capa.jpg",
    });
  });
});

describe("deleteCapaPhotoAction", () => {
  it("remove a foto pelo id", async () => {
    photosDeleteEqQuery.eq.mockResolvedValue({ error: null });
    const { deleteCapaPhotoAction } = await import("./actions");

    const result = await deleteCapaPhotoAction("photo-1");

    expect(result.error).toBeUndefined();
    expect(photosDeleteEqQuery.eq).toHaveBeenCalledWith("id", "photo-1");
  });
});
```

- [ ] **Step 5: Rodar o teste e confirmar que falha**

Run: `npx vitest run "app/(app)/admin/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`

- [ ] **Step 6: Implementar as server actions**

```ts
// app/(app)/admin/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveParceiroAction(
  inspectionId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const parceiroNome = (formData.get("parceiro_nome") as string) || null;
  const parceiroLogoUrl = (formData.get("parceiro_logo_url") as string) || null;
  const parceiroTelefone = (formData.get("parceiro_telefone") as string) || null;

  const { error } = await supabase
    .from("inspections")
    .update({ parceiro_nome: parceiroNome, parceiro_logo_url: parceiroLogoUrl, parceiro_telefone: parceiroTelefone })
    .eq("id", inspectionId);

  if (error) {
    console.error("saveParceiroAction failed", error);
    return { error: "Não foi possível guardar os dados do parceiro. Tente novamente." };
  }

  return {};
}

export async function attachCapaPhotoAction(
  inspectionId: string,
  url: string
): Promise<{ error?: string; photoId?: string }> {
  const supabase = await createClient();

  const { data: photo, error } = await supabase
    .from("photos")
    .insert({ inspection_id: inspectionId, contexto: "capa", item_response_id: null, url })
    .select("id")
    .single();

  if (error || !photo) {
    console.error("attachCapaPhotoAction failed", error);
    return { error: "Não foi possível anexar a foto de capa. Tente novamente." };
  }

  return { photoId: photo.id };
}

export async function deleteCapaPhotoAction(photoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("photos").delete().eq("id", photoId);

  if (error) {
    console.error("deleteCapaPhotoAction failed", error);
    return { error: "Não foi possível remover a foto. Tente novamente." };
  }

  return {};
}
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `npx vitest run "app/(app)/admin/actions.test.ts"`
Expected: PASS

- [ ] **Step 8: Escrever o teste do diálogo**

```tsx
// app/(app)/admin/fotos-parceiro-dialog.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FotosParceiroDialog } from "./fotos-parceiro-dialog";

const saveParceiroAction = vi.fn();
const attachCapaPhotoAction = vi.fn();
const deleteCapaPhotoAction = vi.fn();
vi.mock("./actions", () => ({
  saveParceiroAction: (...args: unknown[]) => saveParceiroAction(...args),
  attachCapaPhotoAction: (...args: unknown[]) => attachCapaPhotoAction(...args),
  deleteCapaPhotoAction: (...args: unknown[]) => deleteCapaPhotoAction(...args),
}));

const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload, getPublicUrl }) } }),
}));

beforeEach(() => {
  saveParceiroAction.mockReset();
  attachCapaPhotoAction.mockReset();
  deleteCapaPhotoAction.mockReset();
  upload.mockReset();
  getPublicUrl.mockReset();
});

describe("FotosParceiroDialog", () => {
  it("abre o diálogo ao clicar no botão gatilho", () => {
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: null, parceiro_logo_url: null, parceiro_telefone: null }}
        initialFotos={[]}
      />
    );

    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));

    expect(dialog.open).toBe(true);
  });

  it("pré-preenche os campos do parceiro quando já existem", () => {
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: "Stand Central", parceiro_logo_url: null, parceiro_telefone: "351912345678" }}
        initialFotos={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));

    expect(screen.getByLabelText("Nome do parceiro")).toHaveValue("Stand Central");
    expect(screen.getByLabelText("Telefone (WhatsApp)")).toHaveValue("351912345678");
  });

  it("envia os campos do parceiro via saveParceiroAction ao guardar", async () => {
    saveParceiroAction.mockResolvedValue({});
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: null, parceiro_logo_url: null, parceiro_telefone: null }}
        initialFotos={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));
    fireEvent.change(screen.getByLabelText("Nome do parceiro"), { target: { value: "Stand Novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar parceiro" }));

    expect(saveParceiroAction).toHaveBeenCalledWith("insp-1", expect.any(FormData));
  });

  it("lista as fotos de capa já existentes com botão de excluir cada uma", () => {
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: null, parceiro_logo_url: null, parceiro_telefone: null }}
        initialFotos={[{ id: "p1", url: "https://example.com/a.jpg" }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));

    expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(1);
  });
});
```

- [ ] **Step 9: Rodar o teste e confirmar que falha**

Run: `npx vitest run "app/(app)/admin/fotos-parceiro-dialog.test.tsx"`
Expected: FAIL — `Cannot find module './fotos-parceiro-dialog'`

- [ ] **Step 10: Implementar o diálogo**

```tsx
// app/(app)/admin/fotos-parceiro-dialog.tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveParceiroAction, attachCapaPhotoAction, deleteCapaPhotoAction } from "./actions";

type Parceiro = { parceiro_nome: string | null; parceiro_logo_url: string | null; parceiro_telefone: string | null };
type Foto = { id: string; url: string };

function buildCapaPhotoPath(inspectionId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/capa/${Date.now()}-${safeName}`;
}

export function FotosParceiroDialog({
  inspectionId,
  initialParceiro,
  initialFotos,
}: {
  inspectionId: string;
  initialParceiro: Parceiro;
  initialFotos: Foto[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [parceiro, setParceiro] = useState(initialParceiro);
  const [fotos, setFotos] = useState<Foto[]>(initialFotos);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSaveParceiro() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("parceiro_nome", parceiro.parceiro_nome ?? "");
      formData.set("parceiro_logo_url", parceiro.parceiro_logo_url ?? "");
      formData.set("parceiro_telefone", parceiro.parceiro_telefone ?? "");
      const result = await saveParceiroAction(inspectionId, formData);
      if (result.error) setError(result.error);
    });
  }

  function handleUploadCapa(file: File) {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const path = buildCapaPhotoPath(inspectionId, file.name);

      const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, file);
      if (uploadError) {
        setError("Não foi possível enviar a foto. Tente novamente.");
        return;
      }

      const { data } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
      const result = await attachCapaPhotoAction(inspectionId, data.publicUrl);
      if (result.error || !result.photoId) {
        setError(result.error ?? "Não foi possível anexar a foto.");
        return;
      }

      setFotos((prev) => [...prev, { id: result.photoId as string, url: data.publicUrl }]);
    });
  }

  function handleDeleteCapa(photoId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteCapaPhotoAction(photoId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setFotos((prev) => prev.filter((f) => f.id !== photoId));
    });
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn--icon" onClick={() => dialogRef.current?.showModal()}>
        Fotos & Parceiro
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        <div className="stack">
          <h2>Fotos de capa e parceiro</h2>

          <div className="field">
            <label htmlFor="parceiro-nome" className="label">
              Nome do parceiro
            </label>
            <input
              id="parceiro-nome"
              className="input"
              value={parceiro.parceiro_nome ?? ""}
              onChange={(e) => setParceiro((p) => ({ ...p, parceiro_nome: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="parceiro-telefone" className="label">
              Telefone (WhatsApp)
            </label>
            <input
              id="parceiro-telefone"
              className="input"
              value={parceiro.parceiro_telefone ?? ""}
              onChange={(e) => setParceiro((p) => ({ ...p, parceiro_telefone: e.target.value }))}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSaveParceiro} disabled={isPending}>
            Guardar parceiro
          </button>

          <hr />

          <label htmlFor="capa-input" className="btn btn-secondary" aria-disabled={isPending}>
            Adicionar foto de capa
          </label>
          <input
            id="capa-input"
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadCapa(file);
              e.target.value = "";
            }}
          />
          {fotos.length > 0 && (
            <ul className="photo-grid photo-grid--compact">
              {fotos.map((foto) => (
                <li key={foto.id} className="photo-grid__item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.url} alt="Foto de capa" className="photo-grid__thumb" />
                  <button
                    type="button"
                    className="btn btn-danger photo-grid__delete"
                    onClick={() => handleDeleteCapa(foto.id)}
                    disabled={isPending}
                  >
                    Excluir
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}

          <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
            Fechar
          </button>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 11: Rodar o teste e confirmar que passa**

Run: `npx vitest run "app/(app)/admin/fotos-parceiro-dialog.test.tsx"`
Expected: PASS

- [ ] **Step 12: Ligar o diálogo à tabela do admin**

Em `app/(app)/admin/page.tsx`, incluir os 3 campos novos no select e passá-los adiante:

```ts
    supabase
      .from("inspections_with_flags")
      .select(
        "id, status, tipo_cliente, data_abertura, atrasada, parceiro_nome, vehicle_data(matricula, marca, modelo), users(nome)"
      )
      .order("data_abertura", { ascending: false }),
```

Em `app/(app)/admin/inspections-table.tsx`, importar o diálogo e renderizá-lo ao lado do botão "Ver", só quando `r.status === 'aprovada'`:

```tsx
import { FotosParceiroDialog } from "./fotos-parceiro-dialog";
```

Dentro do `<td>` que hoje só tem o link "Ver" (linhas 125-141), adicionar:

```tsx
                <td>
                  <Link
                    href={`/inspections/${r.id}`}
                    className="btn btn-secondary btn--icon"
                    aria-label={`Ver inspeção ${r.matricula}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                    Ver
                  </Link>
                  {r.status === "aprovada" && (
                    <FotosParceiroDialog
                      inspectionId={r.id}
                      initialParceiro={{ parceiro_nome: r.parceiroNome, parceiro_logo_url: null, parceiro_telefone: null }}
                      initialFotos={[]}
                    />
                  )}
                </td>
```

Nota: `parceiro_logo_url`/`parceiro_telefone`/fotos de capa não estão disponíveis na row da tabela (só `parceiroNome`, adicionado no Step 1) — o diálogo abre com esses campos vazios na primeira vez que é aberto nesta sessão. Isso é aceitável: o admin preenche uma vez por inspeção, e reabrir o diálogo na mesma navegação já mantém o que foi digitado (estado do componente `FotosParceiroDialog` não é resetado entre aberturas). Buscar `parceiro_logo_url`/`parceiro_telefone`/fotos de capa completos ao abrir fica fora de escopo desta task — YAGNI até virar necessidade real relatada pelo usuário.

- [ ] **Step 13: Checar tipos e rodar a suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros de tipo, todos os testes passam.

- [ ] **Step 14: Commit**

```bash
git add app/\(app\)/admin lib/inspection/admin-list.ts lib/inspection/admin-list.test.ts
git commit -m "feat: dialogo de fotos de capa e parceiro na lista do admin"
```

---

### Task 5: Página do relatório — dados, hero, especificações, parceiro

**Files:**
- Create: `app/(app)/inspections/[id]/relatorio/page.tsx`
- Modify: `app/(app)/inspections/[id]/page.tsx:216-220`

**Interfaces:**
- Consumes: `buildRelatorioGrupos` (Task 3, usado pelo Client Component da Task 6, mas os dados brutos são buscados aqui e passados adiante); `gerarCodigoCertificado` não é usado aqui (só na aprovação).
- Produces: rota `/inspections/[id]/relatorio`, renderizada só quando `status === 'aprovada'` e o usuário autenticado é admin ou o técnico dono.

- [ ] **Step 1: Habilitar o botão "Gerar relatório" na página de resumo**

Em `app/(app)/inspections/[id]/page.tsx:216-220`, trocar:

```tsx
        {status === "aprovada" && (
          <button type="button" className="btn btn-secondary" disabled title="Em breve">
            Gerar relatório
          </button>
        )}
```

por:

```tsx
        {status === "aprovada" && (
          <Link href={`/inspections/${id}/relatorio`} className="btn btn-secondary summary-cta">
            Ver relatório
          </Link>
        )}
```

- [ ] **Step 2: Criar a página do relatório (Server Component)**

```tsx
// app/(app)/inspections/[id]/relatorio/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AnaliseTecnica } from "./analise-tecnica";
import "./relatorio.css";

export default async function RelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) notFound();

  const supabase = await createClient();

  const { data: inspection } = await supabase
    .from("inspections")
    .select(
      "status, codigo_certificado, certificado_emitido_em, parceiro_nome, parceiro_logo_url, parceiro_telefone, vehicle_data(*), users(nome, credencial_interna)"
    )
    .eq("id", id)
    .single();

  if (!inspection || inspection.status !== "aprovada") notFound();

  const [
    { data: score },
    { data: fotosCapa },
    { data: groups },
    { data: items },
    { data: responses },
  ] = await Promise.all([
    supabase.from("inspection_score").select("nota_geral, classificacao").eq("inspection_id", id).maybeSingle(),
    supabase.from("photos").select("id, url, ordem").eq("inspection_id", id).eq("contexto", "capa").order("ordem"),
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase
      .from("checklist_item_templates")
      .select("id, group_id, subcategoria, nome, tipo, conjunto_opcao_id"),
    supabase
      .from("checklist_item_responses")
      .select("id, item_template_id, opcao_id, resposta_texto, resposta_data, observacao")
      .eq("inspection_id", id),
  ]);

  const conjuntoIds = Array.from(
    new Set((items ?? []).map((i) => i.conjunto_opcao_id).filter((v): v is string => v !== null))
  );
  const responseIds = (responses ?? []).map((r) => r.id);

  const [{ data: opcoes }, { data: medicaoResultados }, { data: photos }] = await Promise.all([
    conjuntoIds.length > 0
      ? supabase.from("opcoes").select("id, conjunto_id, label, ordem, exige_foto").in("conjunto_id", conjuntoIds)
      : Promise.resolve({ data: [] }),
    responseIds.length > 0
      ? supabase.from("medicoes_resultado").select("item_response_id, resultado").in("item_response_id", responseIds)
      : Promise.resolve({ data: [] }),
    responseIds.length > 0
      ? supabase.from("photos").select("id, url, item_response_id").eq("contexto", "item").in("item_response_id", responseIds)
      : Promise.resolve({ data: [] }),
  ]);

  const vehicle = inspection.vehicle_data;
  const capaUrl = fotosCapa?.[0]?.url ?? null;

  return (
    <main className="relatorio-page">
      <section className="relatorio-hero" style={capaUrl ? { backgroundImage: `url(${capaUrl})` } : undefined}>
        <div className="relatorio-hero__overlay">
          <p className="relatorio-hero__matricula">{vehicle?.matricula}</p>
          <h1 className="relatorio-hero__titulo">
            {vehicle?.marca} {vehicle?.modelo}
          </h1>
          {score && (
            <div className="relatorio-gauge" data-classificacao={score.classificacao}>
              <span className="relatorio-gauge__nota">{score.nota_geral.toFixed(1)}</span>
              <span className="relatorio-gauge__classificacao">Classe {score.classificacao}</span>
            </div>
          )}
          <p className="relatorio-hero__status">Inspeção aprovada</p>
        </div>
      </section>

      <section className="relatorio-section">
        <h2>Especificações do veículo</h2>
        <div className="relatorio-specs-grid">
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Matrícula</span>
            <span className="relatorio-spec-card__valor">{vehicle?.matricula ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Marca</span>
            <span className="relatorio-spec-card__valor">{vehicle?.marca ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Modelo</span>
            <span className="relatorio-spec-card__valor">{vehicle?.modelo ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Versão</span>
            <span className="relatorio-spec-card__valor">{vehicle?.versao_trim ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Ano de fabrico</span>
            <span className="relatorio-spec-card__valor">{vehicle?.ano_fabrico ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Ano do modelo</span>
            <span className="relatorio-spec-card__valor">{vehicle?.ano_modelo ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Cor</span>
            <span className="relatorio-spec-card__valor">{vehicle?.cor ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">VIN</span>
            <span className="relatorio-spec-card__valor">{vehicle?.vin ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Motor</span>
            <span className="relatorio-spec-card__valor">{vehicle?.numero_motor ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Portas</span>
            <span className="relatorio-spec-card__valor">{vehicle?.numero_portas ?? "—"}</span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Combustível / Caixa</span>
            <span className="relatorio-spec-card__valor">
              {vehicle?.combustivel ?? "—"} / {vehicle?.caixa_velocidades ?? "—"}
            </span>
          </div>
          <div className="relatorio-spec-card">
            <span className="relatorio-spec-card__label">Quilometragem</span>
            <span className="relatorio-spec-card__valor">
              {vehicle?.quilometragem != null ? `${vehicle.quilometragem} km` : "—"}
            </span>
          </div>
        </div>
      </section>

      {inspection.parceiro_nome && (
        <section className="relatorio-section relatorio-parceiro">
          {inspection.parceiro_logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inspection.parceiro_logo_url} alt={inspection.parceiro_nome} className="relatorio-parceiro__logo" />
          )}
          <span className="relatorio-parceiro__nome">{inspection.parceiro_nome}</span>
          {inspection.parceiro_telefone && (
            <a
              href={`https://wa.me/${inspection.parceiro_telefone.replace(/\D/g, "")}`}
              className="relatorio-parceiro__whatsapp"
              target="_blank"
              rel="noreferrer"
            >
              Falar no WhatsApp
            </a>
          )}
        </section>
      )}

      <AnaliseTecnica
        groups={groups ?? []}
        items={items ?? []}
        responses={responses ?? []}
        opcoes={opcoes ?? []}
        medicaoResultados={medicaoResultados ?? []}
        photos={photos ?? []}
      />

      <section className="relatorio-section relatorio-veredito">
        <h2>Selo de Qualidade Check Auto</h2>
        {score && (
          <div className="relatorio-veredito__gauge" data-classificacao={score.classificacao}>
            <span className="relatorio-veredito__nota">{score.nota_geral.toFixed(1)}</span>
            <span>Pontuação final</span>
          </div>
        )}
        <div className="relatorio-veredito__badges">
          <span className="relatorio-badge relatorio-badge--selo">Estado avaliado</span>
          <span className="relatorio-badge relatorio-badge--garantia">Elegível para Garantia</span>
        </div>
        <p className="relatorio-veredito__assinatura">
          {inspection.users?.nome}
          {inspection.users?.credencial_interna ? `, ${inspection.users.credencial_interna}` : ""}
        </p>
      </section>

      <footer className="relatorio-footer">
        <p>
          Técnico responsável: {inspection.users?.nome}
          {inspection.users?.credencial_interna ? ` (${inspection.users.credencial_interna})` : ""}
        </p>
        {inspection.codigo_certificado && (
          <p>
            Certificado {inspection.codigo_certificado}
            {inspection.certificado_emitido_em &&
              ` — emitido em ${new Date(inspection.certificado_emitido_em).toLocaleDateString("pt-PT")}`}
          </p>
        )}
      </footer>
    </main>
  );
}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: falha só por falta de `./analise-tecnica` e `./relatorio.css` (Tasks 6 e 8) — todos os outros tipos batem com os schemas reais. Confirmar que a única causa de erro é a ausência desses dois arquivos antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/inspections/[id]/relatorio/page.tsx" "app/(app)/inspections/[id]/page.tsx"
git commit -m "feat: pagina do relatorio final (hero, especificacoes, parceiro, veredito)"
```

---

### Task 6: Análise técnica — grupos colapsáveis + diálogos de foto/comentário

**Files:**
- Create: `app/(app)/inspections/[id]/relatorio/analise-tecnica.tsx`
- Create: `app/(app)/inspections/[id]/relatorio/analise-tecnica.test.tsx`

**Interfaces:**
- Consumes: `buildRelatorioGrupos` e todos os tipos `Relatorio*`/`ReportGroup`/`ReportItem` de `@/lib/report/build-relatorio` (Task 3).
- Produces: `<AnaliseTecnica groups items responses opcoes medicaoResultados photos />` — usado por `page.tsx` (Task 5).

- [ ] **Step 1: Escrever os testes**

```tsx
// app/(app)/inspections/[id]/relatorio/analise-tecnica.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnaliseTecnica } from "./analise-tecnica";

const groups = [{ id: "g1", ordem: 1, nome: "Pneus" }];
const items = [
  { id: "i1", group_id: "g1", subcategoria: "Rodas", nome: "Pneu dianteiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i2", group_id: "g1", subcategoria: "Rodas", nome: "Pneu traseiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
];
const opcoes = [
  { id: "o1", conjunto_id: "c1", label: "Ótimo", ordem: 1, exige_foto: false },
  { id: "o2", conjunto_id: "c1", label: "Mau", ordem: 2, exige_foto: true },
];
const responses = [
  { id: "r1", item_template_id: "i1", opcao_id: "o1", resposta_texto: null, resposta_data: null, observacao: null },
  { id: "r2", item_template_id: "i2", opcao_id: "o2", resposta_texto: null, resposta_data: null, observacao: "Risco fundo" },
];
const photos = [{ id: "p1", url: "https://example.com/a.jpg", item_response_id: "r2" }];

describe("AnaliseTecnica", () => {
  it("mostra a contagem OK/atenção no cabeçalho do grupo", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />);
    expect(screen.getByText("Pneus")).toBeInTheDocument();
    expect(screen.getByText("1 OK")).toBeInTheDocument();
    expect(screen.getByText("1 atenção")).toBeInTheDocument();
  });

  it("mostra o ícone de foto só no item que tem foto, e abre o diálogo ao clicar", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={photos} />);

    expect(screen.getAllByRole("button", { name: /Ver foto/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Ver foto/ }));
    expect(screen.getByRole("img", { name: "Foto ampliada" })).toHaveAttribute("src", "https://example.com/a.jpg");
  });

  it("mostra o ícone de comentário só no item que tem observação, e abre o diálogo ao clicar", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /Ver comentário/ }));
    expect(screen.getByText("Risco fundo")).toBeInTheDocument();
  });

  it("aplica a classe de piscar só no ícone de comentário de item 'ruim'", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />);
    const botaoComentario = screen.getByRole("button", { name: /Ver comentário/ });
    expect(botaoComentario.className).toContain("relatorio-item__comentario-icon--pisca");
  });

  it("expande todos os grupos colapsados ao disparar o evento beforeprint, e restaura no afterprint", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />);
    const details = document.querySelector("details") as HTMLDetailsElement;
    details.open = false;

    fireEvent(window, new Event("beforeprint"));
    expect(details.open).toBe(true);

    fireEvent(window, new Event("afterprint"));
    expect(details.open).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run "app/(app)/inspections/[id]/relatorio/analise-tecnica.test.tsx"`
Expected: FAIL — `Cannot find module './analise-tecnica'`

- [ ] **Step 3: Implementar**

```tsx
// app/(app)/inspections/[id]/relatorio/analise-tecnica.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildRelatorioGrupos,
  type RelatorioGroupTemplate,
  type RelatorioItemTemplate,
  type RelatorioResponse,
  type RelatorioOpcao,
  type RelatorioMedicaoResultado,
  type RelatorioPhoto,
} from "@/lib/report/build-relatorio";

// ponytail: <details>/<summary> nativos cobrem o colapsar/expandir sem
// nenhum estado React -- só a impressão precisa de JS, porque um <details>
// fechado nao imprime o conteudo. beforeprint forca tudo aberto e afterprint
// devolve o estado anterior, sem tocar nos que ja estavam abertos.
function usePrintExpandsDetails(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    function expandAll() {
      const list = containerRef.current?.querySelectorAll("details") ?? [];
      list.forEach((d) => {
        if (!d.open) {
          d.setAttribute("data-relatorio-fechado-antes", "true");
          d.open = true;
        }
      });
    }
    function restore() {
      const list = containerRef.current?.querySelectorAll("details[data-relatorio-fechado-antes='true']") ?? [];
      list.forEach((d) => {
        (d as HTMLDetailsElement).open = false;
        d.removeAttribute("data-relatorio-fechado-antes");
      });
    }
    window.addEventListener("beforeprint", expandAll);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", expandAll);
      window.removeEventListener("afterprint", restore);
    };
  }, [containerRef]);
}

export function AnaliseTecnica({
  groups,
  items,
  responses,
  opcoes,
  medicaoResultados,
  photos,
}: {
  groups: RelatorioGroupTemplate[];
  items: RelatorioItemTemplate[];
  responses: RelatorioResponse[];
  opcoes: RelatorioOpcao[];
  medicaoResultados: RelatorioMedicaoResultado[];
  photos: RelatorioPhoto[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  usePrintExpandsDetails(containerRef);

  const [fotoAberta, setFotoAberta] = useState<{ id: string; url: string }[] | null>(null);
  const [comentarioAberto, setComentarioAberto] = useState<string | null>(null);
  const fotoDialogRef = useRef<HTMLDialogElement>(null);
  const comentarioDialogRef = useRef<HTMLDialogElement>(null);

  const grupos = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);

  return (
    <section className="relatorio-section relatorio-analise" ref={containerRef}>
      <h2>Análise técnica</h2>
      {grupos.map((grupo) => (
        <details key={grupo.id} className="relatorio-grupo" open>
          <summary className="relatorio-grupo__cabecalho">
            <span>{grupo.nome}</span>
            <span className="relatorio-grupo__contagem">
              <span className="relatorio-badge relatorio-badge--ok">{grupo.ok} OK</span>
              {grupo.atencao > 0 && (
                <span className="relatorio-badge relatorio-badge--atencao">{grupo.atencao} atenção</span>
              )}
            </span>
          </summary>
          <ul className="relatorio-item-list">
            {grupo.items.map((item) => (
              <li key={item.id} className={`relatorio-item relatorio-item--${item.status}`}>
                <span className="relatorio-item__nome">{item.nome}</span>
                <span className={`relatorio-badge relatorio-badge--${item.status}`}>{item.respostaLabel}</span>
                {item.fotos.length > 0 && (
                  <button
                    type="button"
                    className="relatorio-item__foto-icon"
                    aria-label={`Ver foto de ${item.nome}`}
                    onClick={() => {
                      setFotoAberta(item.fotos);
                      fotoDialogRef.current?.showModal();
                    }}
                  >
                    📷
                  </button>
                )}
                {item.comentario && (
                  <button
                    type="button"
                    className={`relatorio-item__comentario-icon${item.piscaComentario ? " relatorio-item__comentario-icon--pisca" : ""}`}
                    aria-label={`Ver comentário de ${item.nome}`}
                    onClick={() => {
                      setComentarioAberto(item.comentario);
                      comentarioDialogRef.current?.showModal();
                    }}
                  >
                    ℹ️
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}

      <dialog ref={fotoDialogRef} className="dialog-panel relatorio-dialog" onClose={() => setFotoAberta(null)}>
        {fotoAberta?.map((foto) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={foto.id} src={foto.url} alt="Foto ampliada" className="relatorio-dialog__foto" />
        ))}
        <button type="button" className="btn btn-secondary" onClick={() => fotoDialogRef.current?.close()}>
          Fechar
        </button>
      </dialog>

      <dialog ref={comentarioDialogRef} className="dialog-panel relatorio-dialog" onClose={() => setComentarioAberto(null)}>
        <p>{comentarioAberto}</p>
        <button type="button" className="btn btn-secondary" onClick={() => comentarioDialogRef.current?.close()}>
          Fechar
        </button>
      </dialog>
    </section>
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx vitest run "app/(app)/inspections/[id]/relatorio/analise-tecnica.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/[id]/relatorio/analise-tecnica.tsx" "app/(app)/inspections/[id]/relatorio/analise-tecnica.test.tsx"
git commit -m "feat: analise tecnica do relatorio com grupos colapsaveis e dialogos de foto/comentario"
```

---

### Task 7: RF-50 — nenhum dado do solicitante na página do relatório

**Files:**
- Test: `app/(app)/inspections/[id]/relatorio/page.test.tsx`

**Interfaces:**
- Consumes: `RelatorioPage` (Task 5) via mock de `@/lib/supabase/server`.

- [ ] **Step 1: Escrever o teste de regressão do RF-50**

```tsx
// app/(app)/inspections/[id]/relatorio/page.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "admin-1", role: "admin" })),
}));

function buildQuery(result: unknown) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "inspections") {
        return buildQuery({
          data: {
            status: "aprovada",
            codigo_certificado: "CK7X29QP",
            certificado_emitido_em: "2026-08-12T10:00:00Z",
            parceiro_nome: null,
            parceiro_logo_url: null,
            parceiro_telefone: null,
            vehicle_data: { matricula: "AA-00-XX", marca: "Toyota", modelo: "Corolla" },
            users: { nome: "Técnico Teste", credencial_interna: null },
          },
        });
      }
      if (table === "inspection_score") return buildQuery({ data: { nota_geral: 8.5, classificacao: "A" } });
      if (table === "photos") return buildQuery({ data: [] });
      if (table === "checklist_group_templates") return buildQuery({ data: [] });
      if (table === "checklist_item_templates") return buildQuery({ data: [] });
      if (table === "checklist_item_responses") return buildQuery({ data: [] });
      if (table === "opcoes") return buildQuery({ data: [] });
      if (table === "medicoes_resultado") return buildQuery({ data: [] });
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

describe("RelatorioPage — RF-50", () => {
  it("nunca renderiza dados do solicitante (client_data), só dados técnicos do veículo", async () => {
    const { default: RelatorioPage } = await import("./page");
    const jsx = await RelatorioPage({ params: Promise.resolve({ id: "insp-1" }) });
    const { container } = render(jsx);

    expect(container.textContent).not.toMatch(/Cliente Sensível|solicitante/i);
    expect(container.textContent).toContain("AA-00-XX");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que passa**

Run: `npx vitest run "app/(app)/inspections/[id]/relatorio/page.test.tsx"`
Expected: PASS — a página nunca consulta `client_data` (confirmar lendo `page.tsx`: nenhuma query seleciona essa tabela), então o teste passa por construção. Se falhar por causa do mock de alguma query faltando, ajustar `buildQuery` para a tabela reportada no erro.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/inspections/[id]/relatorio/page.test.tsx"
git commit -m "test: regressao RF-50 (relatorio nunca expõe client_data)"
```

---

### Task 8: `relatorio.css` — identidade visual dark-glassmorphism + impressão

**Files:**
- Create: `app/(app)/inspections/[id]/relatorio/relatorio.css`

**Interfaces:**
- Produces: classes consumidas por `page.tsx` (Task 5) e `analise-tecnica.tsx` (Task 6): `.relatorio-page`, `.relatorio-hero`, `.relatorio-hero__overlay`, `.relatorio-gauge`, `.relatorio-section`, `.relatorio-specs-grid`, `.relatorio-spec-card`, `.relatorio-parceiro`, `.relatorio-grupo`, `.relatorio-item`, `.relatorio-badge` (com modificadores `--otimo/--medio/--ruim/--na/--info/--ok/--atencao/--selo/--garantia`), `.relatorio-item__foto-icon`, `.relatorio-item__comentario-icon` (+ `--pisca`), `.relatorio-dialog`, `.relatorio-veredito`, `.relatorio-footer`.

- [ ] **Step 1: Escrever o CSS**

```css
/* app/(app)/inspections/[id]/relatorio/relatorio.css
   Identidade visual exclusiva do relatorio final -- dark glassmorphism,
   adaptada do mockup de referencia fornecido pelo usuario (secao 2 do
   design doc: docs/superpowers/specs/2026-08-12-relatorio-final-design.md).
   Escopado inteiramente sob .relatorio-page -- nao reconcilia com
   app/globals.css (DESIGN.md so vale pro resto do app). */

.relatorio-page {
  --relatorio-bg: #121414;
  --relatorio-surface: rgba(255, 255, 255, 0.05);
  --relatorio-border: rgba(255, 255, 255, 0.1);
  --relatorio-ink: #f4f5f5;
  --relatorio-ink-muted: rgba(244, 245, 245, 0.65);
  --relatorio-mint: #00f5a0;
  --relatorio-red: #ff5470;
  --relatorio-amber: #ffb020;

  background: var(--relatorio-bg);
  color: var(--relatorio-ink);
  font-family: "DM Sans", system-ui, sans-serif;
  min-height: 100vh;
  padding-bottom: 3rem;
}

.relatorio-page h1,
.relatorio-page h2 {
  color: var(--relatorio-ink);
}

.relatorio-hero {
  position: relative;
  min-height: 60vh;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: flex-end;
}

.relatorio-hero__overlay {
  width: 100%;
  padding: 2rem;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.2) 70%);
}

.relatorio-hero__matricula {
  color: var(--relatorio-mint);
  font-weight: 600;
  letter-spacing: 0.05em;
}

.relatorio-hero__titulo {
  font-size: 2rem;
  margin: 0.25rem 0 1rem;
}

.relatorio-gauge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  border: 3px solid var(--relatorio-mint);
  background: var(--relatorio-surface);
}

.relatorio-gauge__nota {
  font-size: 1.5rem;
  font-weight: 700;
}

.relatorio-gauge__classificacao {
  font-size: 0.75rem;
  color: var(--relatorio-ink-muted);
}

.relatorio-section {
  max-width: 960px;
  margin: 2rem auto;
  padding: 0 1.5rem;
}

.relatorio-specs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.relatorio-spec-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  background: var(--relatorio-surface);
  border: 1px solid var(--relatorio-border);
  border-radius: 0.75rem;
  backdrop-filter: blur(8px);
}

.relatorio-spec-card__label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--relatorio-ink-muted);
}

.relatorio-parceiro {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: var(--relatorio-surface);
  border: 1px solid var(--relatorio-border);
  border-radius: 0.75rem;
}

.relatorio-parceiro__logo {
  width: 3rem;
  height: 3rem;
  object-fit: contain;
  border-radius: 0.5rem;
}

.relatorio-parceiro__whatsapp {
  margin-left: auto;
  color: var(--relatorio-mint);
}

.relatorio-grupo {
  background: var(--relatorio-surface);
  border: 1px solid var(--relatorio-border);
  border-radius: 0.75rem;
  margin-bottom: 0.75rem;
  overflow: hidden;
}

.relatorio-grupo__cabecalho {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  font-weight: 600;
}

.relatorio-grupo__contagem {
  display: flex;
  gap: 0.5rem;
}

.relatorio-item-list {
  list-style: none;
  margin: 0;
  padding: 0.5rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.relatorio-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
}

.relatorio-item--ruim {
  background: rgba(255, 84, 112, 0.12);
  border: 1px solid rgba(255, 84, 112, 0.4);
}

.relatorio-item__nome {
  flex: 1;
}

.relatorio-badge {
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  white-space: nowrap;
}

.relatorio-badge--otimo,
.relatorio-badge--ok {
  background: rgba(0, 245, 160, 0.15);
  color: var(--relatorio-mint);
}

.relatorio-badge--medio {
  background: rgba(255, 176, 32, 0.15);
  color: var(--relatorio-amber);
}

.relatorio-badge--ruim,
.relatorio-badge--atencao {
  background: rgba(255, 84, 112, 0.15);
  color: var(--relatorio-red);
}

.relatorio-badge--na,
.relatorio-badge--info {
  background: rgba(255, 255, 255, 0.08);
  color: var(--relatorio-ink-muted);
}

.relatorio-badge--selo,
.relatorio-badge--garantia {
  background: rgba(0, 245, 160, 0.1);
  color: var(--relatorio-mint);
  border: 1px solid var(--relatorio-mint);
}

.relatorio-item__foto-icon,
.relatorio-item__comentario-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

@media (prefers-reduced-motion: no-preference) {
  .relatorio-item__comentario-icon--pisca {
    animation: relatorio-pulse 1.4s ease-in-out infinite;
  }
}

@keyframes relatorio-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.relatorio-dialog {
  background: var(--relatorio-bg);
  color: var(--relatorio-ink);
  border: 1px solid var(--relatorio-border);
  border-radius: 0.75rem;
  padding: 1rem;
  max-width: 90vw;
}

.relatorio-dialog__foto {
  max-width: 100%;
  border-radius: 0.5rem;
  margin-bottom: 0.5rem;
}

.relatorio-veredito {
  text-align: center;
}

.relatorio-veredito__gauge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 8rem;
  height: 8rem;
  border-radius: 50%;
  border: 4px solid var(--relatorio-mint);
  justify-content: center;
  margin: 1rem 0;
}

.relatorio-veredito__nota {
  font-size: 2rem;
  font-weight: 700;
}

.relatorio-veredito__badges {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin: 1rem 0;
}

.relatorio-footer {
  max-width: 960px;
  margin: 2rem auto 0;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--relatorio-border);
  color: var(--relatorio-ink-muted);
  font-size: 0.85rem;
}

@media print {
  .relatorio-page {
    background: white;
    color: black;
  }
  .relatorio-item__comentario-icon--pisca {
    animation: none;
  }
}
```

- [ ] **Step 2: Checar tipos e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros (o `import "./relatorio.css"` em `page.tsx`, Task 5, agora resolve).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/inspections/[id]/relatorio/relatorio.css"
git commit -m "feat: identidade visual dark-glassmorphism do relatorio final"
```

---

### Task 9: Verificação final — suíte completa + smoke visual manual

**Files:** nenhum novo — só verificação.

- [ ] **Step 1: Rodar toda a suíte de testes**

Run: `npx vitest run`
Expected: todos os testes passam, incluindo os novos das Tasks 2-7.

- [ ] **Step 2: Checar tipos do projeto inteiro**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 4: Smoke test manual (navegador)**

Pedir para o usuário (ou, se houver acesso a browser automation neste ambiente, fazer diretamente):
1. Rodar `npm run dev`, logar como admin.
2. Abrir uma inspeção `aprovada` na lista do admin, clicar "Fotos & Parceiro", preencher nome/telefone do parceiro e subir 1-2 fotos de capa.
3. Abrir a inspeção, clicar "Ver relatório" — confirmar: hero com foto de capa e nota, grid de especificações do veículo, bloco do parceiro com link do WhatsApp, grupos colapsáveis com contagem OK/atenção, item "ruim" destacado em vermelho, ícone de foto/comentário funcionando, selo "Elegível para Garantia" visível, rodapé com técnico + código de certificado.
4. `Cmd+P` / preview de impressão — confirmar que os grupos aparecem expandidos mesmo que estivessem colapsados na tela.
5. Reportar qualquer divergência visual antes de considerar a fase concluída.

- [ ] **Step 5: Commit final (se houver ajustes do smoke test)**

Só necessário se o Step 4 revelar algo a corrigir — nesse caso, aplicar o fix, repetir Steps 1-3, e commitar separadamente.
