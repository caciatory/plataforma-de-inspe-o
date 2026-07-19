# Design — Validade da Inspeção

## 1. Escopo

Introduz o conceito de validade de uma inspeção emitida: uma inspeção deixa de estar "válida" quando passam mais de 6 meses desde a emissão do certificado, ou quando o veículo já rodou mais de 100km desde a quilometragem registada na inspeção.

Cobre: novo campo de quilometragem, cálculo de validade (função pura), exibição de um selo na página de detalhe da inspeção.

**Fora de escopo deste documento** (decidido no brainstorming, 2026-07-19):
- **Comparação entre inspeções do mesmo veículo** — a validade é uma propriedade da própria inspeção (emissão + 6 meses, km registada + 100), não uma comparação com uma inspeção mais recente do mesmo veículo. Se essa necessidade aparecer no futuro, é uma extensão separada.
- **Lista de inspeções do admin (RF-57–61)** — ainda não existe no app (pertence à Fase 5, não iniciada). A função de cálculo fica pronta para ser consumida quando essa lista for construída; nenhuma UI de listagem é criada aqui.
- **Página de relatório final do cliente (Fase 6)** — também não existe ainda. A função de cálculo fica pronta para ser consumida por ela; nenhuma página de relatório é criada aqui.
- **Alterar o item de checklist "Quilometragem atual"** — esse item continua sendo uma classificação (bom/regular/ruim/NF) independente; não vira o número usado no cálculo de validade.
- **Estilização do selo** — sai como HTML puro + emoji, igual ao resto do app hoje (sem CSS/framework). Estilização é uma pendência real do v1.0 mas fica para uma fase própria, decidida separadamente, não para ser resolvida em pedaços a cada feature nova.
- **Status de km calculado ao vivo** — não há leitura de odômetro ao vivo em nenhum lugar do sistema; o limite de km aparece só como texto informativo, nunca como um `válido`/`expirado` computado.

## 2. Novo dado — quilometragem

Campo novo `vehicle_data.quilometragem` (`int`, `not null`, `check (quilometragem >= 0)`), preenchido pelo técnico no mesmo formulário de dados básicos onde hoje entram matrícula/marca/modelo (RF-02–06). Requer:

- Migration adicionando a coluna.
- RPC `create_inspection` (migration `00017_fase1a_create_inspection.sql`) ganha um parâmetro `p_quilometragem int` obrigatório.
- `app/(app)/inspections/new/new-inspection-form.tsx` ganha um `<input type="number" id="quilometragem" name="quilometragem" required min={0}>`.
- `lib/inspection/schema.ts` (`inspectionFormSchema`) valida o novo campo.
- `actions.ts` (`createInspectionAction`) passa `p_quilometragem: v.quilometragem` para a RPC.

## 3. Cálculo de validade — função pura

"6 meses a partir de agora" depende de `now()`, que não é imutável — não dá para ser uma `generated column` do Postgres. Segue o padrão já estabelecido em `lib/checklist/progress.ts`: computado em runtime, não persistido.

Novo módulo `lib/inspection/validity.ts`:

```typescript
export type InspectionValidityStatus = "nao_emitida" | "valida" | "expirada";

export type InspectionValidity = {
  status: InspectionValidityStatus;
  validoAte: Date | null;   // null quando status === "nao_emitida"
  kmLimite: number | null;  // null quando status === "nao_emitida"
};

export function computeInspectionValidity(
  certificadoEmitidoEm: string | null, // timestamptz ISO string
  quilometragem: number,
  now: Date = new Date()
): InspectionValidity
```

Regras:
- Se `certificadoEmitidoEm` é `null` → `status: "nao_emitida"`, `validoAte: null`, `kmLimite: null`.
- Senão, `validoAte` = `certificadoEmitidoEm` + 6 meses, calculado com `Date` nativo (`setMonth(getMonth() + 6)`) — projeto não tem `date-fns`/`dayjs`/`luxon` como dependência, e não há motivo para adicionar uma só para isso.
- `kmLimite` = `quilometragem + 100`.
- `status` = `"valida"` se `now <= validoAte`, senão `"expirada"`.

Testado com casos puros: sem certificado emitido, exatamente no limite de 6 meses (borda), um dia depois do limite, quilometragem 0.

## 4. Exibição

Na página `/inspections/[id]/page.tsx` (já existe), adiciona-se uma linha condicional:

- `status === "nao_emitida"` → nada é exibido — não faz sentido mostrar validade de uma inspeção que ainda não foi emitida.
- `status === "valida"` → `✅ Válida até {validoAte formatada} (até {kmLimite} km)`
- `status === "expirada"` → `⚠️ Expirada em {validoAte formatada} (válida para até 100km rodados desde a inspeção)`

Sem estilo (CSS) além do que já existe globalmente (`app/globals.css`).

## 5. Testes

- `lib/inspection/validity.test.ts`: cobre as 4 regras da seção 3 (não emitida, válida, expirada, borda dos 6 meses).
- `lib/inspection/schema.test.ts` (se existir) ou equivalente: valida que `quilometragem` é obrigatória e `>= 0`.
- RPC: estender o teste existente de `00017_fase1a_create_inspection.test.sql` para cobrir o novo parâmetro.
