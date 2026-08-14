# Acesso do cliente ao relatório — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o cliente final (sem login) ver o relatório de uma inspeção aprovada a partir de um link que o admin compartilha manualmente, passando antes por uma barreira que registra de onde ele veio.

**Architecture:** Rota pública nova (`app/relatorio/[codigo]/`), fora do middleware de autenticação. Uma função `security definer` no banco (`get_relatorio_publico`) é o único ponto de acesso anônimo aos dados — nenhuma tabela ganha policy de RLS nova para `anon`. A renderização visual do relatório (hoje só em `app/(app)/inspections/[id]/relatorio/page.tsx`) é extraída para um componente compartilhado em `components/relatorio/`, consumido tanto pela rota interna (técnico/admin, autenticada) quanto pela nova rota pública.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres function `security definer`, RLS), TypeScript, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-14-acesso-cliente-design.md`

## Global Constraints

- Sem captura de email — só a origem do acesso é registada (desvio deliberado do texto literal de RF-55/56, aprovado pelo usuário).
- A barreira de origem aparece em **todo** carregamento de página — sem cookie, sem persistência entre visitas.
- Lista fixa de origem, exatamente estas 5 opções, nesta ordem: WhatsApp, Stand / Loja física, Indicação, Redes sociais, Outro.
- Nenhuma tabela (`inspections`, `vehicle_data`, `checklist_item_responses`, `photos`, `opcoes`, `medicoes_resultado`, `equipamento_inspecao`, `equipamento_fotos`, `inspection_score`) ganha policy de RLS nova para o papel `anon`. O único ponto de acesso anônimo aos dados do relatório é a função `get_relatorio_publico`.
- `get_relatorio_publico` nunca seleciona `client_data` — a exclusão é estrutural na query, não uma checagem depois (mesma garantia do RF-50).
- Sem rate-limiting / CAPTCHA nesta fase (decisão explícita — entropia do código de 8 caracteres em alfabeto de 36 já torna força bruta inviável).
- RF-52 (busca pública de certificado por código) está fora de escopo deste repositório — não criar nenhuma rota/tela para isso.
- Erro de código inválido ou inspeção não aprovada deve ser genérico — nunca revelar qual dos dois casos ocorreu.

---

### Task 1: Extrair a renderização do relatório para um componente compartilhado

**Files:**
- Create: `components/relatorio/relatorio-conteudo.tsx`
- Create: `components/relatorio/relatorio-conteudo.test.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/analise-tecnica.tsx` → `components/relatorio/analise-tecnica.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/analise-tecnica.test.tsx` → `components/relatorio/analise-tecnica.test.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/outros-equipamentos.tsx` → `components/relatorio/outros-equipamentos.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/outros-equipamentos.test.tsx` → `components/relatorio/outros-equipamentos.test.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/hero-carousel.tsx` → `components/relatorio/hero-carousel.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/hero-carousel.test.tsx` → `components/relatorio/hero-carousel.test.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/certificado-info.tsx` → `components/relatorio/certificado-info.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/certificado-info.test.tsx` → `components/relatorio/certificado-info.test.tsx`
- Move: `app/(app)/inspections/[id]/relatorio/use-print-expands-details.ts` → `components/relatorio/use-print-expands-details.ts`
- Move: `app/(app)/inspections/[id]/relatorio/relatorio.css` → `components/relatorio/relatorio.css`
- Modify: `app/(app)/inspections/[id]/relatorio/page.tsx` (fica só com a busca de dados)
- Modify: `lib/report/build-relatorio.ts` (nova função pura `formatDataInspecao`)
- Test: `lib/report/build-relatorio.test.ts` (cobre a função nova)

**Interfaces:**
- Produces: `RelatorioConteudo({ dados: RelatorioDados }): JSX.Element` — componente de apresentação puro, sem busca de dados própria. `RelatorioDados` (tipo exportado do mesmo arquivo) é o formato que Tasks 3 e a rota interna (já modificada nesta task) precisam construir. `formatDataInspecao(dataFinalizacao: string | null, dataAbertura: string | null): string | null` (exportada de `lib/report/build-relatorio.ts`) — usada por esta task e pela Task 3.
- Consumes (sem mudança de assinatura, só de localização/import path): `AnaliseTecnica`, `OutrosEquipamentos`, `HeroCarousel` (+ `type HeroCarouselPhoto`), `CertificadoInfoButton`, `usePrintExpandsDetails`, e os tipos já exportados por `@/lib/report/build-relatorio` (`RelatorioGroupTemplate`, `RelatorioItemTemplate`, `RelatorioResponse`, `RelatorioOpcao`, `RelatorioMedicaoResultado`, `RelatorioPhoto`).

Nenhum dos 4 componentes movidos muda de comportamento ou assinatura — só de pasta. Os imports relativos entre eles (`./use-print-expands-details`) continuam corretos porque todos se movem juntos para `components/relatorio/`.

- [ ] **Step 1: Mover os 4 componentes + hook + CSS pra `components/relatorio/`**

```bash
mkdir -p components/relatorio
git mv "app/(app)/inspections/[id]/relatorio/analise-tecnica.tsx" components/relatorio/analise-tecnica.tsx
git mv "app/(app)/inspections/[id]/relatorio/analise-tecnica.test.tsx" components/relatorio/analise-tecnica.test.tsx
git mv "app/(app)/inspections/[id]/relatorio/outros-equipamentos.tsx" components/relatorio/outros-equipamentos.tsx
git mv "app/(app)/inspections/[id]/relatorio/outros-equipamentos.test.tsx" components/relatorio/outros-equipamentos.test.tsx
git mv "app/(app)/inspections/[id]/relatorio/hero-carousel.tsx" components/relatorio/hero-carousel.tsx
git mv "app/(app)/inspections/[id]/relatorio/hero-carousel.test.tsx" components/relatorio/hero-carousel.test.tsx
git mv "app/(app)/inspections/[id]/relatorio/certificado-info.tsx" components/relatorio/certificado-info.tsx
git mv "app/(app)/inspections/[id]/relatorio/certificado-info.test.tsx" components/relatorio/certificado-info.test.tsx
git mv "app/(app)/inspections/[id]/relatorio/use-print-expands-details.ts" components/relatorio/use-print-expands-details.ts
git mv "app/(app)/inspections/[id]/relatorio/relatorio.css" components/relatorio/relatorio.css
```

Nenhum conteúdo desses 10 arquivos muda nesta etapa — só a localização. Não editar nada dentro deles ainda.

- [ ] **Step 2: Rodar os testes movidos, confirmar que ainda passam do novo local**

Run: `npx vitest run components/relatorio/`
Expected: os 4 arquivos de teste passam (mesma contagem de antes do `git mv`) — confirma que o `git mv` não quebrou nenhum import relativo.

- [ ] **Step 3: Adicionar `formatDataInspecao` a `lib/report/build-relatorio.ts`**

Adicionar ao final do arquivo (depois de `buildRelatorioGrupos`):

```ts
// Data da inspeção em si (quando o tecnico finalizou em campo), nao a data
// de emissao do certificado (que e so quando o admin aprovou depois).
export function formatDataInspecao(dataFinalizacao: string | null, dataAbertura: string | null): string | null {
  const data = dataFinalizacao ?? dataAbertura;
  return data ? new Date(data).toLocaleDateString("pt-PT") : null;
}
```

- [ ] **Step 4: Escrever o teste de `formatDataInspecao`**

Adicionar a `lib/report/build-relatorio.test.ts`:

```ts
describe("formatDataInspecao", () => {
  it("usa data_finalizacao quando existe", () => {
    expect(formatDataInspecao("2026-08-10T10:00:00Z", "2026-08-01T10:00:00Z")).toBe(
      new Date("2026-08-10T10:00:00Z").toLocaleDateString("pt-PT")
    );
  });

  it("cai pra data_abertura quando data_finalizacao e null", () => {
    expect(formatDataInspecao(null, "2026-08-01T10:00:00Z")).toBe(
      new Date("2026-08-01T10:00:00Z").toLocaleDateString("pt-PT")
    );
  });

  it("devolve null quando as duas sao null", () => {
    expect(formatDataInspecao(null, null)).toBeNull();
  });
});
```

Adicionar `formatDataInspecao` ao import existente de `@/lib/report/build-relatorio` no topo do arquivo de teste.

- [ ] **Step 5: Rodar o teste novo, confirmar que passa**

Run: `npx vitest run lib/report/build-relatorio.test.ts`
Expected: PASS, incluindo os 3 casos novos.

- [ ] **Step 6: Criar `components/relatorio/relatorio-conteudo.tsx`**

Primeiro leia o arquivo atual `app/(app)/inspections/[id]/relatorio/page.tsx` (ele ainda não foi modificado nesta task) — as linhas 1-42 (imports, `dmSans`, `GAUGE_RADIUS`/`GAUGE_CIRCUMFERENCE`/`gaugeOffset`/`Gauge`) e 163-526 (todo o JSX de `<main>` até `</main>`) migram quase verbatim para este arquivo novo, com as substituições da tabela abaixo.

Estrutura do arquivo novo:

```tsx
// components/relatorio/relatorio-conteudo.tsx
import { DM_Sans } from "next/font/google";
import {
  type RelatorioGroupTemplate,
  type RelatorioItemTemplate,
  type RelatorioResponse,
  type RelatorioOpcao,
  type RelatorioMedicaoResultado,
  type RelatorioPhoto,
} from "@/lib/report/build-relatorio";
import { AnaliseTecnica } from "./analise-tecnica";
import { CertificadoInfoButton } from "./certificado-info";
import { HeroCarousel, type HeroCarouselPhoto } from "./hero-carousel";
import { OutrosEquipamentos, type EquipamentoRow, type EquipamentoFoto } from "./outros-equipamentos";
import "./relatorio.css";

// Fonte exclusiva desta rota (identidade visual dark-glassmorphism) -- nao
// entra em app/layout.tsx, que so carrega Space Grotesk/Inter para o resto da app.
export const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Anel do gauge circular (SVG real, nao so um circulo com borda) -- raio 42
// num viewBox 100x100, escalado via CSS pelo tamanho do container.
const GAUGE_RADIUS = 42;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function gaugeOffset(notaSobre10: number): number {
  const fracao = Math.min(Math.max(notaSobre10 / 10, 0), 1);
  return GAUGE_CIRCUMFERENCE * (1 - fracao);
}

function Gauge({ nota, strokeTrack = 8, strokeFill = 8 }: { nota: number; strokeTrack?: number; strokeFill?: number }) {
  return (
    <svg className="relatorio-gauge__ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="relatorio-gauge__track" cx="50" cy="50" r={GAUGE_RADIUS} fill="none" strokeWidth={strokeTrack} />
      <circle
        className="relatorio-gauge__fill"
        cx="50"
        cy="50"
        r={GAUGE_RADIUS}
        fill="none"
        strokeWidth={strokeFill}
        strokeDasharray={GAUGE_CIRCUMFERENCE}
        strokeDashoffset={gaugeOffset(nota)}
      />
    </svg>
  );
}

export type RelatorioVehicle = {
  marca: string | null;
  modelo: string | null;
  versao_trim: string | null;
  ano_fabrico: number | null;
  ano_modelo: number | null;
  cor: string | null;
  vin: string | null;
  numero_motor: string | null;
  numero_portas: number | null;
  combustivel: string | null;
  caixa_velocidades: string | null;
  quilometragem: number | null;
  codigo_cor: string | null;
  tracao: string | null;
  potencia_cv: number | null;
  torque_nm: number | null;
  matricula: string | null;
  situacao_fiscal_regular: string | null;
  numero_proprietarios_anteriores: number | null;
  indicios_adulteracao_presentes: boolean | null;
  indicios_adulteracao_km: string | null;
  registo_acidentes_anteriores: string | null;
  historico_manutencao: string | null;
  inspecoes_periodicas_ipo_data: string | null;
  inspecoes_periodicas_ipo_notas: string | null;
  data_primeira_matricula: string | null;
  valor_base_iuc_anual: number | null;
  veiculo_importado: boolean | null;
  pais_origem: string | null;
  matricula_origem: string | null;
  data_importacao: string | null;
  possui_coc: boolean | null;
  isencao_isv_aplicada: boolean | null;
  numero_dav: string | null;
} | null;

export type RelatorioDados = {
  vehicle: RelatorioVehicle;
  score: { nota_geral: number; classificacao: string } | null;
  fotosCapa: HeroCarouselPhoto[];
  codigoCertificado: string | null;
  certificadoEmitidoEm: string | null;
  parceiroNome: string | null;
  parceiroLogoUrl: string | null;
  parceiroTelefone: string | null;
  dataInspecao: string | null;
  tecnicoNome: string | null;
  tecnicoCredencial: string | null;
  groups: RelatorioGroupTemplate[];
  items: RelatorioItemTemplate[];
  responses: RelatorioResponse[];
  opcoes: RelatorioOpcao[];
  medicaoResultados: RelatorioMedicaoResultado[];
  photos: RelatorioPhoto[];
  equipamentos: EquipamentoRow[];
  equipamentoFotos: EquipamentoFoto[];
};

export function RelatorioConteudo({ dados }: { dados: RelatorioDados }) {
  const { vehicle, score } = dados;

  return (
    <main className={`relatorio-page ${dmSans.className}`}>
      {/* ... corpo do <main> movido de page.tsx, ver tabela de substituicao abaixo ... */}
    </main>
  );
}
```

**Tabela de substituição** (aplicar ao colar o JSX das linhas 163-526 do `page.tsx` atual dentro do `<main>` acima):

| Expressão no `page.tsx` atual | Nova expressão em `RelatorioConteudo` |
|---|---|
| `vehicle?.X` (qualquer campo) | `vehicle?.X` (sem mudança — `vehicle` já é desestruturado de `dados` no topo da função) |
| `score` | `score` (sem mudança — já desestruturado) |
| `fotosCapa ?? []` | `dados.fotosCapa` |
| `inspection.codigo_certificado` | `dados.codigoCertificado` |
| `inspection.certificado_emitido_em` | `dados.certificadoEmitidoEm` |
| `inspection.parceiro_nome` | `dados.parceiroNome` |
| `inspection.parceiro_logo_url` | `dados.parceiroLogoUrl` |
| `inspection.parceiro_telefone` | `dados.parceiroTelefone` |
| `dataInspecao` | `dados.dataInspecao` |
| `inspection.users?.nome` | `dados.tecnicoNome` |
| `inspection.users?.credencial_interna` | `dados.tecnicoCredencial` |
| `groups ?? []` (prop de `AnaliseTecnica`) | `dados.groups` |
| `items ?? []` (prop de `AnaliseTecnica`) | `dados.items` |
| `responses ?? []` (prop de `AnaliseTecnica`) | `dados.responses` |
| `opcoes ?? []` (prop de `AnaliseTecnica`) | `dados.opcoes` |
| `medicaoResultados ?? []` (prop de `AnaliseTecnica`) | `dados.medicaoResultados` |
| `photos ?? []` (prop de `AnaliseTecnica`) | `dados.photos` |
| `equipamentos ?? []` (prop de `OutrosEquipamentos`) | `dados.equipamentos` |
| `equipamentoFotos ?? []` (prop de `OutrosEquipamentos`) | `dados.equipamentoFotos` |

O `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` (Material Symbols) e o comentário acima dele migram sem alteração. Os 4 componentes filhos (`HeroCarousel`, `CertificadoInfoButton`, `AnaliseTecnica`, `OutrosEquipamentos`) são usados exatamente como hoje, só que importados de `./analise-tecnica` etc. (mesmo diretório agora).

- [ ] **Step 7: Escrever `components/relatorio/relatorio-conteudo.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RelatorioConteudo, type RelatorioDados } from "./relatorio-conteudo";

const dadosBase: RelatorioDados = {
  vehicle: {
    marca: "Toyota",
    modelo: "Corolla",
    versao_trim: "1.8",
    ano_fabrico: 2020,
    ano_modelo: 2020,
    cor: "Prata",
    vin: "JTDKP5C1XL0012345",
    numero_motor: "2ZR-FE",
    numero_portas: 4,
    combustivel: "Gasolina",
    caixa_velocidades: "Manual",
    quilometragem: 45000,
    codigo_cor: null,
    tracao: null,
    potencia_cv: null,
    torque_nm: null,
    matricula: "AA-00-XX",
    situacao_fiscal_regular: null,
    numero_proprietarios_anteriores: null,
    indicios_adulteracao_presentes: false,
    indicios_adulteracao_km: null,
    registo_acidentes_anteriores: null,
    historico_manutencao: null,
    inspecoes_periodicas_ipo_data: null,
    inspecoes_periodicas_ipo_notas: null,
    data_primeira_matricula: null,
    valor_base_iuc_anual: null,
    veiculo_importado: false,
    pais_origem: null,
    matricula_origem: null,
    data_importacao: null,
    possui_coc: null,
    isencao_isv_aplicada: null,
    numero_dav: null,
  },
  score: { nota_geral: 8.5, classificacao: "A" },
  fotosCapa: [],
  codigoCertificado: "CK7X29QP",
  certificadoEmitidoEm: "2026-08-12T10:00:00Z",
  parceiroNome: null,
  parceiroLogoUrl: null,
  parceiroTelefone: null,
  dataInspecao: "12/08/2026",
  tecnicoNome: "Técnico Teste",
  tecnicoCredencial: null,
  groups: [],
  items: [],
  responses: [],
  opcoes: [],
  medicaoResultados: [],
  photos: [],
  equipamentos: [],
  equipamentoFotos: [],
};

describe("RelatorioConteudo", () => {
  it("renderiza os dados técnicos do veículo e o código de certificado", () => {
    const { container } = render(<RelatorioConteudo dados={dadosBase} />);
    expect(container.textContent).toContain("Toyota");
    expect(container.textContent).toContain("Corolla");
    expect(container.textContent).toContain("AA-00-XX");
    expect(container.textContent).toContain("CK7X29QP");
  });

  it("nunca aninha <dialog> dentro de <p> (regressão de hidratação, RF-50-adjacente)", () => {
    const { container } = render(<RelatorioConteudo dados={dadosBase} />);
    expect(container.querySelector("p dialog")).toBeNull();
  });

  it("renderiza o nome do parceiro quando presente", () => {
    const { container } = render(
      <RelatorioConteudo dados={{ ...dadosBase, parceiroNome: "Stand Central" }} />
    );
    expect(container.textContent).toContain("Stand Central");
  });
});
```

- [ ] **Step 8: Rodar o teste novo, confirmar que passa**

Run: `npx vitest run components/relatorio/relatorio-conteudo.test.tsx`
Expected: PASS, os 3 casos.

- [ ] **Step 9: Reescrever `app/(app)/inspections/[id]/relatorio/page.tsx` pra só buscar dados e montar `RelatorioDados`**

Substituir o arquivo inteiro por:

```tsx
// app/(app)/inspections/[id]/relatorio/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { formatDataInspecao } from "@/lib/report/build-relatorio";
import { RelatorioConteudo, type RelatorioDados } from "@/components/relatorio/relatorio-conteudo";

export default async function RelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) notFound();

  const supabase = await createClient();

  // Select amplo (`*`) na tabela base por necessidade: sem um Database type
  // gerado, um column-list explicito na tabela base faz o postgrest-js
  // inferir os embeds vehicle_data/users como array em vez de objeto unico
  // (~24 erros TS2339) -- mesmo padrao ja usado em
  // app/(app)/inspections/[id]/page.tsx:40. RF-50 continua garantido porque
  // client_data e uma tabela fisicamente separada, nunca embutida aqui.
  const { data: inspection } = await supabase
    .from("inspections")
    .select("*, vehicle_data(*), users(nome, credencial_interna)")
    .eq("id", id)
    .single();

  if (!inspection || inspection.status !== "aprovada") notFound();

  const [
    { data: score },
    { data: fotosCapa },
    { data: groups, error: groupsError },
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
    { data: equipamentos, error: equipamentosError },
  ] = await Promise.all([
    supabase.from("inspection_score").select("nota_geral, classificacao").eq("inspection_id", id).maybeSingle(),
    supabase
      .from("photos")
      .select("id, url, ordem")
      .eq("inspection_id", id)
      .eq("contexto", "capa")
      .order("ordem")
      .order("criado_em"),
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase
      .from("checklist_item_templates")
      .select("id, group_id, subcategoria, nome, tipo, conjunto_opcao_id"),
    supabase
      .from("checklist_item_responses")
      .select("id, item_template_id, opcao_id, resposta_texto, resposta_data, observacao")
      .eq("inspection_id", id),
    supabase
      .from("equipamento_inspecao")
      .select("id, categoria, nome_equipamento, condicao, comentario, ordem")
      .eq("inspection_id", id)
      .order("ordem"),
  ]);

  // Falha silenciosa aqui renderizaria um certificado com "0 pontos
  // verificados" -- pior que uma pagina de erro, porque parece valido.
  // score/fotosCapa ficam de fora de proposito: ja degradam bem (sem nota ->
  // UI de fallback; sem foto de capa -> hero sem carrossel).
  if (groupsError || itemsError || responsesError || equipamentosError) {
    console.error("relatorio checklist fetch failed", {
      groupsError,
      itemsError,
      responsesError,
      equipamentosError,
    });
    throw new Error("Não foi possível carregar os dados do relatório.");
  }

  const conjuntoIds = Array.from(
    new Set((items ?? []).map((i) => i.conjunto_opcao_id).filter((v): v is string => v !== null))
  );
  const responseIds = (responses ?? []).map((r) => r.id);
  const equipamentoIds = (equipamentos ?? []).map((e) => e.id);

  const [
    { data: opcoes, error: opcoesError },
    { data: medicaoResultados, error: medicaoResultadosError },
    { data: photos, error: photosError },
    { data: equipamentoFotos, error: equipamentoFotosError },
  ] = await Promise.all([
    conjuntoIds.length > 0
      ? supabase.from("opcoes").select("id, conjunto_id, label, ordem, exige_foto").in("conjunto_id", conjuntoIds)
      : Promise.resolve({ data: [], error: null }),
    responseIds.length > 0
      ? supabase.from("medicoes_resultado").select("item_response_id, resultado").in("item_response_id", responseIds)
      : Promise.resolve({ data: [], error: null }),
    responseIds.length > 0
      ? supabase
          .from("photos")
          .select("id, url, item_response_id")
          .eq("contexto", "item")
          .in("item_response_id", responseIds)
      : Promise.resolve({ data: [], error: null }),
    equipamentoIds.length > 0
      ? supabase
          .from("equipamento_fotos")
          .select("id, url, equipamento_inspecao_id")
          .in("equipamento_inspecao_id", equipamentoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (opcoesError || medicaoResultadosError || photosError || equipamentoFotosError) {
    console.error("relatorio checklist detail fetch failed", {
      opcoesError,
      medicaoResultadosError,
      photosError,
      equipamentoFotosError,
    });
    throw new Error("Não foi possível carregar os dados do relatório.");
  }

  const dados: RelatorioDados = {
    vehicle: inspection.vehicle_data,
    score: score ?? null,
    fotosCapa: fotosCapa ?? [],
    codigoCertificado: inspection.codigo_certificado,
    certificadoEmitidoEm: inspection.certificado_emitido_em,
    parceiroNome: inspection.parceiro_nome,
    parceiroLogoUrl: inspection.parceiro_logo_url,
    parceiroTelefone: inspection.parceiro_telefone,
    dataInspecao: formatDataInspecao(inspection.data_finalizacao, inspection.data_abertura),
    tecnicoNome: inspection.users?.nome ?? null,
    tecnicoCredencial: inspection.users?.credencial_interna ?? null,
    groups: groups ?? [],
    items: items ?? [],
    responses: responses ?? [],
    opcoes: opcoes ?? [],
    medicaoResultados: medicaoResultados ?? [],
    photos: photos ?? [],
    equipamentos: equipamentos ?? [],
    equipamentoFotos: equipamentoFotos ?? [],
  };

  return <RelatorioConteudo dados={dados} />;
}
```

- [ ] **Step 10: Rodar a suíte inteira e o typecheck, confirmar que nada quebrou**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros de tipo, todos os testes passam — incluindo `app/(app)/inspections/[id]/relatorio/page.test.tsx` **sem nenhuma alteração no próprio arquivo de teste** (ele continua mockando `@/lib/supabase/server` e chamando `RelatorioPage(...)` exatamente como antes; se ele quebrar, algum campo do `dados` acima está com nome ou fallback diferente do original).

- [ ] **Step 11: Commit**

```bash
git add components/relatorio "app/(app)/inspections/[id]/relatorio/page.tsx" lib/report/build-relatorio.ts lib/report/build-relatorio.test.ts
git commit -m "refactor: extrai renderização do relatório pra componente compartilhado"
```

---

### Task 2: Migration — acesso público ao relatório

**Files:**
- Create: `supabase/migrations/00053_acesso_cliente_publico.sql`
- Create: `supabase/tests/00053_acesso_cliente_publico.test.sql`

**Interfaces:**
- Produces: função `public.get_relatorio_publico(p_codigo text) returns jsonb` — devolve `null` se o código não existir ou a inspeção não estiver `aprovada`; caso contrário devolve um objeto com as chaves `inspection_id`, `inspection` (codigo_certificado, certificado_emitido_em, parceiro_nome, parceiro_logo_url, parceiro_telefone, data_finalizacao, data_abertura, tecnico_nome, tecnico_credencial), `vehicle` (todas as colunas de `vehicle_data` exceto `id`/`inspection_id`), `score` (nota_geral, classificacao, ou `null`), `fotos_capa`, `groups`, `items`, `responses`, `opcoes`, `medicao_resultados`, `photos`, `equipamentos`, `equipamento_fotos` (arrays, cada um no mesmo formato de campo que as queries equivalentes de `page.tsx`, ver Task 1 Step 9). Nunca inclui `client_data`. Consumida pela Task 3.
- Produces: policies `client_access_logs_insert` (anon insere) e `client_access_logs_select` (admin lê) — consumidas pela Task 3.
- Produces: `client_access_logs.email` deixa de ser `not null`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/00053_acesso_cliente_publico.sql
-- Fase 7 (acesso do cliente): docs/superpowers/specs/2026-08-14-acesso-cliente-design.md
-- RF-54 a RF-56. email deixa de ser obrigatorio (decisao do usuario: so a
-- origem e capturada). client_access_logs tinha RLS ligada desde a
-- migration 00010 sem nenhuma policy (bloqueio total) -- essas sao as
-- policies prometidas la. get_relatorio_publico e o unico ponto de acesso
-- anonimo aos dados do relatorio: nenhuma outra tabela ganha policy pro
-- papel anon. security definer + search_path vazio (mesmo padrao das
-- outras funcoes do projeto) + toda referencia de tabela/coluna totalmente
-- qualificada. Nunca seleciona client_data -- garantia estrutural do RF-50
-- aplicada aqui na origem dos dados, nao so na camada de apresentacao.

alter table public.client_access_logs alter column email drop not null;

create policy client_access_logs_insert on public.client_access_logs
  for insert to anon
  with check (true);

create policy client_access_logs_select on public.client_access_logs
  for select to authenticated
  using (public.is_admin());

create function public.get_relatorio_publico(p_codigo text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_result jsonb;
begin
  select id into v_id
  from public.inspections
  where codigo_certificado = p_codigo and status = 'aprovada';

  if v_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'inspection_id', v_id,
    'inspection', (
      select jsonb_build_object(
        'codigo_certificado', i.codigo_certificado,
        'certificado_emitido_em', i.certificado_emitido_em,
        'parceiro_nome', i.parceiro_nome,
        'parceiro_logo_url', i.parceiro_logo_url,
        'parceiro_telefone', i.parceiro_telefone,
        'data_finalizacao', i.data_finalizacao,
        'data_abertura', i.data_abertura,
        'tecnico_nome', u.nome,
        'tecnico_credencial', u.credencial_interna
      )
      from public.inspections i
      join public.users u on u.id = i.tecnico_id
      where i.id = v_id
    ),
    'vehicle', (
      select to_jsonb(vd) - 'id' - 'inspection_id'
      from public.vehicle_data vd
      where vd.inspection_id = v_id
    ),
    'score', (
      select jsonb_build_object('nota_geral', s.nota_geral, 'classificacao', s.classificacao)
      from public.inspection_score s
      where s.inspection_id = v_id
    ),
    'fotos_capa', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url) order by p.ordem, p.criado_em), '[]'::jsonb)
      from public.photos p
      where p.inspection_id = v_id and p.contexto = 'capa'
    ),
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'ordem', g.ordem, 'nome', g.nome)), '[]'::jsonb)
      from public.checklist_group_templates g
      where g.ativo = true
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', it.id, 'group_id', it.group_id, 'subcategoria', it.subcategoria,
        'nome', it.nome, 'tipo', it.tipo, 'conjunto_opcao_id', it.conjunto_opcao_id
      )), '[]'::jsonb)
      from public.checklist_item_templates it
    ),
    'responses', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'item_template_id', r.item_template_id, 'opcao_id', r.opcao_id,
        'resposta_texto', r.resposta_texto, 'resposta_data', r.resposta_data, 'observacao', r.observacao
      )), '[]'::jsonb)
      from public.checklist_item_responses r
      where r.inspection_id = v_id
    ),
    'opcoes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'conjunto_id', o.conjunto_id, 'label', o.label, 'ordem', o.ordem, 'exige_foto', o.exige_foto
      )), '[]'::jsonb)
      from public.opcoes o
    ),
    'medicao_resultados', (
      select coalesce(jsonb_agg(jsonb_build_object('item_response_id', mr.item_response_id, 'resultado', mr.resultado)), '[]'::jsonb)
      from public.medicoes_resultado mr
      join public.checklist_item_responses r on r.id = mr.item_response_id
      where r.inspection_id = v_id
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'url', p.url, 'item_response_id', p.item_response_id)), '[]'::jsonb)
      from public.photos p
      join public.checklist_item_responses r on r.id = p.item_response_id
      where r.inspection_id = v_id and p.contexto = 'item'
    ),
    'equipamentos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'categoria', e.categoria, 'nome_equipamento', e.nome_equipamento,
        'condicao', e.condicao, 'comentario', e.comentario, 'ordem', e.ordem
      ) order by e.ordem), '[]'::jsonb)
      from public.equipamento_inspecao e
      where e.inspection_id = v_id
    ),
    'equipamento_fotos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', ef.id, 'url', ef.url, 'equipamento_inspecao_id', ef.equipamento_inspecao_id)), '[]'::jsonb)
      from public.equipamento_fotos ef
      where ef.inspection_id = v_id
    )
  ) into v_result;

  return v_result;
end;
$$;
```

- [ ] **Step 2: Escrever o teste SQL**

```sql
-- supabase/tests/00053_acesso_cliente_publico.test.sql
-- Cobre a migration 00053: get_relatorio_publico so devolve dados de
-- inspecao aprovada, nunca inclui client_data (nao ha coluna client_data no
-- retorno pois a funcao nunca faz join com essa tabela), e as policies
-- novas de client_access_logs (anon insere, nao le; admin le).

begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'tecnico-00053@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'admin-00053@example.com');
insert into public.users (id, nome, email, role) values
  ('11111111-1111-1111-1111-111111111111', 'Tecnico 00053', 'tecnico-00053@example.com', 'tecnico'),
  ('22222222-2222-2222-2222-222222222222', 'Admin 00053', 'admin-00053@example.com', 'admin');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare
  v_inspection_id uuid;
begin
  v_inspection_id := public.create_inspection(
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-053',
    p_marca => 'Marca 053',
    p_modelo => 'Modelo 053',
    p_nome_solicitante => 'Cliente Sensível 053',
    p_quilometragem => 1000
  );
  perform set_config('acesso_cliente_053.inspection_id', v_inspection_id::text, false);
end $$;

reset role;

do $$
declare
  v_inspection_id uuid := current_setting('acesso_cliente_053.inspection_id')::uuid;
  v_resultado jsonb;
begin
  -- ainda 'rascunho': get_relatorio_publico nao deve devolver nada mesmo
  -- com codigo certo, porque a inspecao nao esta aprovada.
  update public.inspections set codigo_certificado = 'TESTE0053' where id = v_inspection_id;

  set local role anon;
  v_resultado := public.get_relatorio_publico('TESTE0053');
  if v_resultado is not null then
    raise exception 'FALHOU: get_relatorio_publico devolveu dados de inspecao nao aprovada';
  end if;
  raise notice 'OK: get_relatorio_publico bloqueia inspecao nao aprovada';

  v_resultado := public.get_relatorio_publico('CODIGOINEXISTENTE');
  if v_resultado is not null then
    raise exception 'FALHOU: get_relatorio_publico devolveu dados pra codigo inexistente';
  end if;
  raise notice 'OK: get_relatorio_publico devolve null pra codigo inexistente';
  reset role;

  update public.inspections set status = 'aprovada' where id = v_inspection_id;

  set local role anon;
  v_resultado := public.get_relatorio_publico('TESTE0053');
  if v_resultado is null then
    raise exception 'FALHOU: get_relatorio_publico nao devolveu dados de inspecao aprovada com codigo certo';
  end if;
  if v_resultado->'inspection'->>'codigo_certificado' <> 'TESTE0053' then
    raise exception 'FALHOU: codigo_certificado incorreto no retorno';
  end if;
  if v_resultado ? 'client_data' then
    raise exception 'FALHOU: retorno inclui client_data (RF-50)';
  end if;
  if v_resultado::text ilike '%Cliente Sensível 053%' then
    raise exception 'FALHOU: retorno vaza o nome do solicitante (RF-50)';
  end if;
  raise notice 'OK: get_relatorio_publico devolve dados corretos sem client_data pra inspecao aprovada';
  reset role;
end $$;

-- client_access_logs: anon insere, nao le; admin le.
set local role anon;
do $$
declare
  v_inspection_id uuid := current_setting('acesso_cliente_053.inspection_id')::uuid;
begin
  insert into public.client_access_logs (inspection_id, origem) values (v_inspection_id, 'whatsapp');
  raise notice 'OK: anon consegue inserir em client_access_logs';

  begin
    perform 1 from public.client_access_logs limit 1;
    raise exception 'FALHOU: anon conseguiu ler client_access_logs';
  exception when insufficient_privilege then
    raise notice 'OK: anon bloqueado ao tentar ler client_access_logs';
  end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.client_access_logs;
  if v_count < 1 then
    raise exception 'FALHOU: admin nao conseguiu ler client_access_logs';
  end if;
  raise notice 'OK: admin le client_access_logs';
end $$;
reset role;

rollback;
```

- [ ] **Step 3: Aplicar a migration localmente (se houver banco de dev acessível) e rodar o teste**

Run: `supabase db reset` (ou o comando equivalente já usado no projeto pra aplicar migrations locais), depois `psql "$DATABASE_URL" -f supabase/tests/00053_acesso_cliente_publico.test.sql` (mesmo padrão dos testes SQL anteriores do projeto).
Expected: todos os `raise notice 'OK: ...'` aparecem, nenhum `FALHOU`.

Se este ambiente não tiver acesso a um banco Supabase real (mesma limitação já registrada nas fases anteriores — ver Fase 4 no `docs/ROADMAP.md`), documentar no relatório da task que a migration foi revisada estaticamente e que o usuário precisa aplicá-la manualmente no Supabase e rodar o teste lá, como as anteriores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00053_acesso_cliente_publico.sql supabase/tests/00053_acesso_cliente_publico.test.sql
git commit -m "feat: migration RF-54 a RF-56 -- get_relatorio_publico e RLS de client_access_logs"
```

---

### Task 3: Rota pública `/relatorio/[codigo]`

**Files:**
- Create: `app/relatorio/[codigo]/page.tsx`
- Create: `app/relatorio/[codigo]/relatorio-gate.tsx`
- Create: `app/relatorio/[codigo]/relatorio-gate.test.tsx`
- Create: `app/relatorio/[codigo]/actions.ts`
- Create: `app/relatorio/[codigo]/actions.test.ts`
- Modify: `components/relatorio/relatorio.css` (classes novas pro ecrã de origem)

**Interfaces:**
- Consumes: `RelatorioConteudo`, `type RelatorioDados` (Task 1, `@/components/relatorio/relatorio-conteudo`); `dmSans` (idem, exportado por essa task, reaproveitado aqui pro ecrã de origem); `get_relatorio_publico` (Task 2, via `supabase.rpc(...)`); `client_access_logs` (Task 2, via `supabase.from(...).insert(...)`).
- Produces: `registrarAcessoAction(codigo: string, origem: OrigemAcesso): Promise<{ status: "ok"; dados: RelatorioDados } | { status: "erro" }>` e `type OrigemAcesso = "whatsapp" | "stand" | "indicacao" | "redes_sociais" | "outro"` (ambos exportados de `./actions`) — usados só por `relatorio-gate.tsx` nesta task.

- [ ] **Step 1: Escrever `app/relatorio/[codigo]/actions.ts`**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { formatDataInspecao } from "@/lib/report/build-relatorio";
import type { RelatorioDados } from "@/components/relatorio/relatorio-conteudo";

export type OrigemAcesso = "whatsapp" | "stand" | "indicacao" | "redes_sociais" | "outro";

type RpcRelatorio = {
  inspection_id: string;
  inspection: {
    codigo_certificado: string | null;
    certificado_emitido_em: string | null;
    parceiro_nome: string | null;
    parceiro_logo_url: string | null;
    parceiro_telefone: string | null;
    data_finalizacao: string | null;
    data_abertura: string;
    tecnico_nome: string | null;
    tecnico_credencial: string | null;
  };
  vehicle: RelatorioDados["vehicle"];
  score: RelatorioDados["score"];
  fotos_capa: RelatorioDados["fotosCapa"];
  groups: RelatorioDados["groups"];
  items: RelatorioDados["items"];
  responses: RelatorioDados["responses"];
  opcoes: RelatorioDados["opcoes"];
  medicao_resultados: RelatorioDados["medicaoResultados"];
  photos: RelatorioDados["photos"];
  equipamentos: RelatorioDados["equipamentos"];
  equipamento_fotos: RelatorioDados["equipamentoFotos"];
};

function mapRpcToRelatorioDados(rpc: RpcRelatorio): RelatorioDados {
  return {
    vehicle: rpc.vehicle,
    score: rpc.score,
    fotosCapa: rpc.fotos_capa,
    codigoCertificado: rpc.inspection.codigo_certificado,
    certificadoEmitidoEm: rpc.inspection.certificado_emitido_em,
    parceiroNome: rpc.inspection.parceiro_nome,
    parceiroLogoUrl: rpc.inspection.parceiro_logo_url,
    parceiroTelefone: rpc.inspection.parceiro_telefone,
    dataInspecao: formatDataInspecao(rpc.inspection.data_finalizacao, rpc.inspection.data_abertura),
    tecnicoNome: rpc.inspection.tecnico_nome,
    tecnicoCredencial: rpc.inspection.tecnico_credencial,
    groups: rpc.groups,
    items: rpc.items,
    responses: rpc.responses,
    opcoes: rpc.opcoes,
    medicaoResultados: rpc.medicao_resultados,
    photos: rpc.photos,
    equipamentos: rpc.equipamentos,
    equipamentoFotos: rpc.equipamento_fotos,
  };
}

export async function registrarAcessoAction(
  codigo: string,
  origem: OrigemAcesso
): Promise<{ status: "ok"; dados: RelatorioDados } | { status: "erro" }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_relatorio_publico", { p_codigo: codigo });
  if (error || !data) return { status: "erro" };

  const rpc = data as unknown as RpcRelatorio;

  // Best-effort: uma falha aqui nao deve impedir o cliente de ver o
  // relatorio que ele veio buscar -- mesmo criterio ja usado pra
  // score/fotosCapa na rota interna (Task 1), so registrado no log do
  // servidor.
  const { error: logError } = await supabase
    .from("client_access_logs")
    .insert({ inspection_id: rpc.inspection_id, origem });
  if (logError) {
    console.error("client_access_logs insert failed", logError);
  }

  return { status: "ok", dados: mapRpcToRelatorioDados(rpc) };
}
```

- [ ] **Step 2: Escrever `app/relatorio/[codigo]/actions.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const insert = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: (table: string) => {
      if (table === "client_access_logs") return { insert };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const rpcPayload = {
  inspection_id: "insp-1",
  inspection: {
    codigo_certificado: "CK7X29QP",
    certificado_emitido_em: "2026-08-12T10:00:00Z",
    parceiro_nome: null,
    parceiro_logo_url: null,
    parceiro_telefone: null,
    data_finalizacao: "2026-08-10T10:00:00Z",
    data_abertura: "2026-08-01T10:00:00Z",
    tecnico_nome: "Técnico Teste",
    tecnico_credencial: null,
  },
  vehicle: { marca: "Toyota", modelo: "Corolla" },
  score: { nota_geral: 8.5, classificacao: "A" },
  fotos_capa: [],
  groups: [],
  items: [],
  responses: [],
  opcoes: [],
  medicao_resultados: [],
  photos: [],
  equipamentos: [],
  equipamento_fotos: [],
};

beforeEach(() => {
  rpc.mockReset();
  insert.mockClear();
});

describe("registrarAcessoAction", () => {
  it("devolve status erro quando a RPC não encontra o código", async () => {
    const { registrarAcessoAction } = await import("./actions");
    rpc.mockResolvedValue({ data: null, error: null });

    const resultado = await registrarAcessoAction("CODIGOINVALIDO", "whatsapp");
    expect(resultado.status).toBe("erro");
    expect(insert).not.toHaveBeenCalled();
  });

  it("registra o acesso e devolve os dados mapeados quando a RPC encontra o código", async () => {
    const { registrarAcessoAction } = await import("./actions");
    rpc.mockResolvedValue({ data: rpcPayload, error: null });

    const resultado = await registrarAcessoAction("CK7X29QP", "whatsapp");
    expect(resultado.status).toBe("ok");
    if (resultado.status !== "ok") throw new Error("esperava ok");
    expect(resultado.dados.codigoCertificado).toBe("CK7X29QP");
    expect(resultado.dados.tecnicoNome).toBe("Técnico Teste");
    expect(insert).toHaveBeenCalledWith({ inspection_id: "insp-1", origem: "whatsapp" });
  });

  it("ainda devolve os dados quando o insert do log falha (best-effort, não bloqueia)", async () => {
    const { registrarAcessoAction } = await import("./actions");
    rpc.mockResolvedValue({ data: rpcPayload, error: null });
    insert.mockResolvedValueOnce({ error: { message: "boom" } });

    const resultado = await registrarAcessoAction("CK7X29QP", "outro");
    expect(resultado.status).toBe("ok");
  });
});
```

- [ ] **Step 3: Rodar o teste, confirmar que passa**

Run: `npx vitest run "app/relatorio/[codigo]/actions.test.ts"`
Expected: PASS, os 3 casos.

- [ ] **Step 4: Adicionar as classes CSS do ecrã de origem a `components/relatorio/relatorio.css`**

Adicionar ao final do arquivo:

```css
/* Ecra de origem (RF-55/56) -- mesma identidade dark-glassmorphism do
   resto do relatorio, mas e a primeira coisa que o visitante anonimo ve,
   antes do <main class="relatorio-page"> do relatorio em si existir --
   por isso relatorio-gate.tsx aplica a classe relatorio-page na sua
   propria raiz tambem, pra herdar as CSS custom properties. */
.relatorio-gate-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 1.5rem;
}

.relatorio-gate {
  width: 100%;
  max-width: 420px;
  padding: 2rem;
  border-radius: 1rem;
  text-align: center;
}

.relatorio-gate h1 {
  font-size: 1.5rem;
  margin: 0 0 0.5rem;
}

.relatorio-gate p {
  color: var(--relatorio-ink-muted);
  margin: 0;
}

.relatorio-gate__opcoes {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.relatorio-gate__opcao {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--relatorio-border);
  background: transparent;
  color: var(--relatorio-ink);
  font-size: 0.95rem;
  cursor: pointer;
}

.relatorio-gate__opcao:hover:not(:disabled) {
  border-color: var(--relatorio-mint);
}

.relatorio-gate__opcao:disabled {
  opacity: 0.5;
  cursor: default;
}

.relatorio-gate__erro {
  color: var(--relatorio-red);
}
```

- [ ] **Step 5: Escrever `app/relatorio/[codigo]/relatorio-gate.tsx`**

```tsx
"use client";

import { useState } from "react";
import { registrarAcessoAction, type OrigemAcesso } from "./actions";
import { RelatorioConteudo, dmSans, type RelatorioDados } from "@/components/relatorio/relatorio-conteudo";

const OPCOES_ORIGEM: { value: OrigemAcesso; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "stand", label: "Stand / Loja física" },
  { value: "indicacao", label: "Indicação" },
  { value: "redes_sociais", label: "Redes sociais" },
  { value: "outro", label: "Outro" },
];

export function RelatorioGate({ codigo }: { codigo: string }) {
  const [estado, setEstado] = useState<"gate" | "carregando" | "erro">("gate");
  const [dados, setDados] = useState<RelatorioDados | null>(null);

  async function onEscolherOrigem(origem: OrigemAcesso) {
    setEstado("carregando");
    const resultado = await registrarAcessoAction(codigo, origem);
    if (resultado.status === "erro") {
      setEstado("erro");
      return;
    }
    setDados(resultado.dados);
  }

  if (dados) return <RelatorioConteudo dados={dados} />;

  return (
    <main className={`relatorio-page relatorio-gate-page ${dmSans.className}`}>
      <div className="relatorio-gate glass">
        <h1>Ver relatório</h1>
        {estado === "erro" ? (
          <p role="alert" className="relatorio-gate__erro">
            Relatório não encontrado.
          </p>
        ) : (
          <>
            <p>De onde você está vindo?</p>
            <div className="relatorio-gate__opcoes">
              {OPCOES_ORIGEM.map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  className="relatorio-gate__opcao"
                  disabled={estado === "carregando"}
                  onClick={() => onEscolherOrigem(opcao.value)}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Escrever `app/relatorio/[codigo]/relatorio-gate.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RelatorioGate } from "./relatorio-gate";

const registrarAcessoAction = vi.fn();
vi.mock("./actions", () => ({
  registrarAcessoAction: (...args: unknown[]) => registrarAcessoAction(...args),
}));

vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ className: "mock-dm-sans" }),
}));

beforeEach(() => {
  registrarAcessoAction.mockReset();
});

describe("RelatorioGate", () => {
  it("mostra as 5 opções de origem antes de qualquer escolha", () => {
    render(<RelatorioGate codigo="CK7X29QP" />);
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Stand / Loja física")).toBeInTheDocument();
    expect(screen.getByText("Indicação")).toBeInTheDocument();
    expect(screen.getByText("Redes sociais")).toBeInTheDocument();
    expect(screen.getByText("Outro")).toBeInTheDocument();
  });

  it("troca pro relatório quando a origem é aceita", async () => {
    registrarAcessoAction.mockResolvedValue({
      status: "ok",
      dados: {
        vehicle: { marca: "Toyota", modelo: "Corolla" },
        score: null,
        fotosCapa: [],
        codigoCertificado: "CK7X29QP",
        certificadoEmitidoEm: null,
        parceiroNome: null,
        parceiroLogoUrl: null,
        parceiroTelefone: null,
        dataInspecao: null,
        tecnicoNome: null,
        tecnicoCredencial: null,
        groups: [],
        items: [],
        responses: [],
        opcoes: [],
        medicaoResultados: [],
        photos: [],
        equipamentos: [],
        equipamentoFotos: [],
      },
    });

    render(<RelatorioGate codigo="CK7X29QP" />);
    fireEvent.click(screen.getByText("WhatsApp"));

    await waitFor(() => expect(screen.getByText("CK7X29QP")).toBeInTheDocument());
    expect(registrarAcessoAction).toHaveBeenCalledWith("CK7X29QP", "whatsapp");
  });

  it("mostra erro genérico quando o código é inválido", async () => {
    registrarAcessoAction.mockResolvedValue({ status: "erro" });

    render(<RelatorioGate codigo="INVALIDO" />);
    fireEvent.click(screen.getByText("Outro"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Relatório não encontrado."));
  });
});
```

- [ ] **Step 7: Rodar o teste, confirmar que passa**

Run: `npx vitest run "app/relatorio/[codigo]/relatorio-gate.test.tsx"`
Expected: PASS, os 3 casos.

- [ ] **Step 8: Escrever `app/relatorio/[codigo]/page.tsx`**

```tsx
import { RelatorioGate } from "./relatorio-gate";

export default async function RelatorioPublicoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  return <RelatorioGate codigo={codigo} />;
}
```

- [ ] **Step 9: Rodar a suíte inteira e o typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros de tipo, todos os testes passam.

- [ ] **Step 10: Verificação manual (não substitui, complementa os testes automatizados)**

Confirmar que `middleware.ts` (`config.matcher: ["/inspections/:path*", "/admin/:path*"]`) realmente não cobre `/relatorio/:path*` — já confirmado por leitura nesta sessão, mas reconfirmar visualmente o arquivo antes de seguir, já que qualquer mudança futura nesse matcher quebraria esta rota silenciosamente.

- [ ] **Step 11: Commit**

```bash
git add "app/relatorio" components/relatorio/relatorio.css
git commit -m "feat: rota pública /relatorio/[codigo] com barreira de origem (RF-54 a RF-56)"
```

---

### Task 4: Botão "Copiar link do relatório" no admin

**Files:**
- Create: `app/(app)/inspections/[id]/copiar-link-relatorio.tsx`
- Create: `app/(app)/inspections/[id]/copiar-link-relatorio.test.tsx`
- Modify: `app/(app)/inspections/[id]/page.tsx`

**Interfaces:**
- Produces: `CopiarLinkRelatorioButton({ codigo: string }): JSX.Element` — usado só nesta task.

- [ ] **Step 1: Escrever `app/(app)/inspections/[id]/copiar-link-relatorio.tsx`**

```tsx
"use client";

import { useState } from "react";

export function CopiarLinkRelatorioButton({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const link = `${window.location.origin}/relatorio/${codigo}`;
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button type="button" className="btn btn-secondary summary-cta" onClick={copiar}>
      {copiado ? "Copiado!" : "Copiar link do relatório"}
    </button>
  );
}
```

- [ ] **Step 2: Escrever `app/(app)/inspections/[id]/copiar-link-relatorio.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopiarLinkRelatorioButton } from "./copiar-link-relatorio";

const writeText = vi.fn(async () => {});

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
  vi.stubGlobal("location", { origin: "https://checkauto.pt" });
});

describe("CopiarLinkRelatorioButton", () => {
  it("copia o link público com o código do certificado e mostra feedback", async () => {
    render(<CopiarLinkRelatorioButton codigo="CK7X29QP" />);

    fireEvent.click(screen.getByText("Copiar link do relatório"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://checkauto.pt/relatorio/CK7X29QP"));
    expect(screen.getByText("Copiado!")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar o teste, confirmar que passa**

Run: `npx vitest run "app/(app)/inspections/[id]/copiar-link-relatorio.test.tsx"`
Expected: PASS.

- [ ] **Step 4: Adicionar `codigo_certificado` ao select de `page.tsx` e renderizar o botão**

Em `app/(app)/inspections/[id]/page.tsx`, o select já traz `.select("*, vehicle_data(*), client_data(*), users(nome)")` (select amplo `*` na tabela base, então `inspection.codigo_certificado` já está disponível sem mudança de query).

Adicionar o import:

```tsx
import { CopiarLinkRelatorioButton } from "./copiar-link-relatorio";
```

No bloco `summary-actions` (onde já está o botão "Ver relatório", visível quando `status === 'aprovada'`), adicionar logo depois:

```tsx
        {status === "aprovada" && (
          <Link href={`/inspections/${id}/relatorio`} className="btn btn-secondary summary-cta">
            Ver relatório
          </Link>
        )}

        {status === "aprovada" && currentUser?.role === "admin" && inspection.codigo_certificado && (
          <CopiarLinkRelatorioButton codigo={inspection.codigo_certificado} />
        )}
```

- [ ] **Step 5: Rodar a suíte inteira e o typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros de tipo, todos os testes passam.

- [ ] **Step 6: Verificação manual no navegador**

Abrir a página de resumo de uma inspeção aprovada como admin — confirmar que "Copiar link do relatório" aparece ao lado de "Ver relatório", que clicar copia `https://<host-atual>/relatorio/<codigo>` (colar em algum lugar pra conferir), e que o texto do botão muda pra "Copiado!" por 2 segundos. Depois, logado como técnico (não-admin), confirmar que o botão **não** aparece. Depois, abrir esse link copiado numa aba anônima (sem sessão), confirmar o fluxo completo do gate → relatório (mesma verificação já prevista na Task 3).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/inspections/[id]/copiar-link-relatorio.tsx" "app/(app)/inspections/[id]/copiar-link-relatorio.test.tsx" "app/(app)/inspections/[id]/page.tsx"
git commit -m "feat: botão Copiar link do relatório na tela de resumo (admin)"
```
