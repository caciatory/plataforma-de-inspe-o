# Validade da Inspeção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular e exibir a validade de uma inspeção emitida — expira aos 6 meses da emissão do certificado, e informa o limite de 100km rodados desde a quilometragem registada — na página de detalhe da inspeção.

**Architecture:** Um campo novo (`vehicle_data.quilometragem`) capturado no formulário de dados básicos já existente. Uma função pura (`lib/inspection/validity.ts`, mesmo padrão de `lib/checklist/progress.ts`) calcula `status`/`validoAte`/`kmLimite` em runtime — nunca como coluna gerada, porque a matemática depende de `now()`, que não é imutável. A página `/inspections/[id]` (já existe) chama essa função e renderiza um selo condicional.

**Tech Stack:** Next.js 15 App Router (Server Components), Supabase JS client, `zod` (schema de validação já existente), `Date` nativo (sem `date-fns`/`dayjs` — não é dependência do projeto e não há motivo para adicionar uma só para "somar 6 meses"), Vitest.

## Global Constraints

- Escopo é só o cálculo de validade (data + km) e sua exibição na página de detalhe. Sem comparação entre inspeções do mesmo veículo, sem lista de inspeções do admin (RF-57–61, não existe ainda), sem página de relatório do cliente (Fase 6, não existe ainda) — ver `docs/superpowers/specs/2026-07-19-validade-inspecao-design.md` §1.
- `kmLimite` nunca vira um status computado — não há leitura de odômetro ao vivo em lugar nenhum do sistema. Aparece só como texto informativo ao lado do status de data.
- O selo sai sem estilo (HTML puro + emoji), igual ao resto do app hoje. Nenhuma alteração em `app/globals.css`.
- `vehicle_data.quilometragem` é obrigatório (`not null`, `check (quilometragem >= 0)`) e não tem default depois de aplicada a migration — todo caller de `create_inspection` precisa fornecê-lo.
- Página `/inspections/[id]/page.tsx` continua sem teste próprio — mesmo padrão já usado nesse arquivo e em `checklist/layout.tsx`: fetch-e-renderiza puro, a lógica de verdade (`computeInspectionValidity`) é testada isolada na Task 2.
- O item de checklist "Quilometragem atual" (uma classificação bom/regular/ruim/NF) não é tocado — continua independente do campo numérico novo.

---

### Task 1: DB layer — coluna `quilometragem` + RPC `create_inspection` atualizada

**Files:**
- Create: `supabase/migrations/00019_add_vehicle_quilometragem.sql`
- Modify: `supabase/tests/00017_fase1a_create_inspection.test.sql`
- Test: `supabase/tests/00019_add_vehicle_quilometragem.test.sql`

**Interfaces:**
- Consumes: `public.vehicle_data`, `public.create_inspection` (migration `00017`).
- Produces: `public.vehicle_data.quilometragem int not null`. `public.create_inspection(..., p_quilometragem int, ...)` — Task 4's `createInspectionAction` passa `p_quilometragem: v.quilometragem`.

**Prerequisito de ambiente:** este worktree precisa de `supabase/.env.local` com um `DATABASE_URL` funcional antes do Step 2. Se o arquivo não existir aqui:

```bash
cp "/Volumes/KINGSTON/Empresas/inspcta/bild app/supabase/.env.local" supabase/.env.local
chmod 600 supabase/.env.local
```

Use a porta 5432 (session pooler) — a 6543 (transaction pooler) falha autenticação neste projeto mesmo com credenciais corretas. Antes do `db push`, confirme que o ledger de migrations bate com os arquivos locais:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
set -a && source supabase/.env.local && set +a
psql "$DATABASE_URL" -c "select version from supabase_migrations.schema_migrations order by version;"
ls supabase/migrations/ | grep -v '^\._'
```

Se a última versão no ledger for `00018`, prossiga direto para o Step 2. Se houver divergência, rode `supabase migration repair <versoes> --status applied --db-url "$DATABASE_URL"` antes de continuar (ver memória do projeto sobre conexão ao banco).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00019_add_vehicle_quilometragem.sql`:

```sql
-- supabase/migrations/00019_add_vehicle_quilometragem.sql
-- Validade da inspeção (data + km) — docs/superpowers/specs/2026-07-19-validade-inspecao-design.md
-- Campo estruturado de quilometragem, usado para calcular o limite de km da validade.
-- default 0 só para o backfill de linhas existentes; removido em seguida — toda
-- inserção nova precisa fornecer o valor real via create_inspection.

alter table public.vehicle_data
  add column quilometragem int not null default 0,
  add constraint quilometragem_nao_negativa check (quilometragem >= 0);

alter table public.vehicle_data
  alter column quilometragem drop default;

drop function public.create_inspection(
  public.tipo_cliente, public.objetivo_inspecao, text, text, text, text,
  text, int, int, text, text, text, int, text, text, text, int, numeric,
  text, text, text
);

create function public.create_inspection(
  p_tipo_cliente public.tipo_cliente,
  p_objetivo public.objetivo_inspecao,
  p_matricula text,
  p_marca text,
  p_modelo text,
  p_nome_solicitante text,
  p_quilometragem int,
  p_versao_trim text default null,
  p_ano_fabrico int default null,
  p_ano_modelo int default null,
  p_cor text default null,
  p_vin text default null,
  p_numero_motor text default null,
  p_numero_portas int default null,
  p_combustivel text default null,
  p_caixa_velocidades text default null,
  p_tracao text default null,
  p_potencia_cv int default null,
  p_torque_nm numeric default null,
  p_contacto text default null,
  p_email text default null,
  p_responsavel_presente text default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_inspection_id uuid;
begin
  insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
  values ((select auth.uid()), p_tipo_cliente, p_objetivo)
  returning id into v_inspection_id;

  insert into public.vehicle_data (
    inspection_id, matricula, marca, modelo, versao_trim, ano_fabrico, ano_modelo,
    cor, vin, numero_motor, numero_portas, combustivel, caixa_velocidades, tracao,
    potencia_cv, torque_nm, quilometragem
  ) values (
    v_inspection_id, p_matricula, p_marca, p_modelo, p_versao_trim, p_ano_fabrico, p_ano_modelo,
    p_cor, p_vin, p_numero_motor, p_numero_portas, p_combustivel, p_caixa_velocidades, p_tracao,
    p_potencia_cv, p_torque_nm, p_quilometragem
  );

  insert into public.client_data (
    inspection_id, nome_solicitante, tipo, contacto, email, responsavel_presente
  ) values (
    v_inspection_id, p_nome_solicitante, p_tipo_cliente, p_contacto, p_email, p_responsavel_presente
  );

  return v_inspection_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push --db-url "$DATABASE_URL"`
Expected: applies with no errors (1 column + 1 constraint added, 1 function dropped, 1 function created).

- [ ] **Step 3: Update the existing RPC test to pass the new required parameter**

`supabase/tests/00017_fase1a_create_inspection.test.sql` has two `create_inspection(...)` calls. Both need `p_quilometragem => <valor>` added, or they now fail (the parameter has no default). Replace the file with:

```sql
-- supabase/tests/00017_fase1a_create_inspection.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'tecnicoA@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000021', 'Tecnico A', 'tecnicoA@test.com', 'tecnico');

-- simulate tecnico A
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000021';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000021"}';

do $$
declare
  v_id uuid;
  v_tecnico uuid;
  v_marca text;
  v_tipo public.tipo_cliente;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'stand',
    p_objetivo => 'venda',
    p_matricula => 'AA-11-BB',
    p_marca => 'Toyota',
    p_modelo => 'Corolla',
    p_nome_solicitante => 'Stand Central',
    p_quilometragem => 45000,
    p_contacto => '910000000',
    p_email => 'stand@central.pt'
  );

  select tecnico_id into v_tecnico from public.inspections where id = v_id;
  if v_tecnico <> '00000000-0000-0000-0000-000000000021' then
    raise exception 'FALHOU: tecnico_id deveria ser o tecnico autenticado (foi %)', v_tecnico;
  end if;

  select marca into v_marca from public.vehicle_data where inspection_id = v_id;
  if v_marca <> 'Toyota' then
    raise exception 'FALHOU: vehicle_data.marca deveria ser Toyota (foi %)', v_marca;
  end if;

  select tipo into v_tipo from public.client_data where inspection_id = v_id;
  if v_tipo <> 'stand' then
    raise exception 'FALHOU: client_data.tipo deveria ser stand (foi %)', v_tipo;
  end if;

  raise notice 'OK: create_inspection grava inspections/vehicle_data/client_data numa so transacao';
end $$;

do $$
begin
  begin
    perform public.create_inspection(
      p_tipo_cliente => 'stand',
      p_objetivo => 'compra',
      p_matricula => 'XX-00-XX',
      p_marca => 'Honda',
      p_modelo => 'Civic',
      p_nome_solicitante => 'Stand Invalido',
      p_quilometragem => 10000
    );
    raise exception 'FALHOU: objetivo=compra com tipo_cliente=stand deveria violar objetivo_stand_fixo';
  exception
    when check_violation then
      raise notice 'OK: create_inspection respeita a constraint objetivo_stand_fixo (RF-03)';
  end;
end $$;

do $$
declare v_count int;
begin
  -- RF-05 (autocomplete): confirma que o técnico só enxerga, via select direto em
  -- client_data, os stands das próprias inspeções — a RLS existente (client_data_select,
  -- migration 00008) já é a fonte de verdade para o que Task 7's searchStandContactsAction
  -- pode ler; nada de novo é concedido aqui.
  select count(*) into v_count from public.client_data where nome_solicitante = 'Stand Central';
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico A deveria ver o proprio client_data recem-criado (viu %)', v_count;
  end if;
  raise notice 'OK: create_inspection deixa o stand visivel para autocomplete do proprio tecnico (RF-05)';
end $$;

rollback;
```

- [ ] **Step 4: Run the updated test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00017_fase1a_create_inspection.test.sql`
Expected: 3 `NOTICE: OK: ...` lines, no `ERROR`, ends with `ROLLBACK`.

- [ ] **Step 5: Write the new test for quilometragem**

Create `supabase/tests/00019_add_vehicle_quilometragem.test.sql`:

```sql
-- supabase/tests/00019_add_vehicle_quilometragem.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000022', 'tecnicoB@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000022', 'Tecnico B', 'tecnicoB@test.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000022';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000022"}';

do $$
declare
  v_id uuid;
  v_km int;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular',
    p_objetivo => 'compra',
    p_matricula => 'QQ-11-QQ',
    p_marca => 'Renault',
    p_modelo => 'Clio',
    p_nome_solicitante => 'Cliente Km',
    p_quilometragem => 87500
  );

  select quilometragem into v_km from public.vehicle_data where inspection_id = v_id;
  if v_km <> 87500 then
    raise exception 'FALHOU: quilometragem deveria ser 87500 (foi %)', v_km;
  end if;

  raise notice 'OK: create_inspection persiste quilometragem corretamente';
end $$;

do $$
begin
  begin
    perform public.create_inspection(
      p_tipo_cliente => 'particular',
      p_objetivo => 'compra',
      p_matricula => 'RR-22-RR',
      p_marca => 'Peugeot',
      p_modelo => '208',
      p_nome_solicitante => 'Cliente Km Negativo',
      p_quilometragem => -1
    );
    raise exception 'FALHOU: quilometragem negativa deveria violar quilometragem_nao_negativa';
  exception
    when check_violation then
      raise notice 'OK: constraint quilometragem_nao_negativa rejeita valores negativos';
  end;
end $$;

do $$
begin
  begin
    perform public.create_inspection(
      p_tipo_cliente => 'particular',
      p_objetivo => 'compra',
      p_matricula => 'SS-33-SS',
      p_marca => 'Fiat',
      p_modelo => 'Punto',
      p_nome_solicitante => 'Cliente Sem Km'
    );
    raise exception 'FALHOU: omitir p_quilometragem deveria falhar (parametro obrigatorio, sem default)';
  exception
    when undefined_function then
      raise notice 'OK: p_quilometragem e obrigatorio na assinatura da RPC';
  end;
end $$;

rollback;
```

- [ ] **Step 6: Run the new test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00019_add_vehicle_quilometragem.test.sql`
Expected: 3 `NOTICE: OK: ...` lines, no `ERROR`, ends with `ROLLBACK`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00019_add_vehicle_quilometragem.sql supabase/tests/00019_add_vehicle_quilometragem.test.sql supabase/tests/00017_fase1a_create_inspection.test.sql
git commit -m "feat: add vehicle_data.quilometragem and require it in create_inspection"
```

---

### Task 2: Lógica pura de cálculo de validade

**Files:**
- Create: `lib/inspection/validity.ts`
- Test: `lib/inspection/validity.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependência externa).
- Produces (usado pela Task 5):
  - `type InspectionValidityStatus = "nao_emitida" | "valida" | "expirada"`
  - `type InspectionValidity = { status: InspectionValidityStatus; validoAte: Date | null; kmLimite: number | null }`
  - `function computeInspectionValidity(certificadoEmitidoEm: string | null, quilometragem: number, now?: Date): InspectionValidity`

- [ ] **Step 1: Write the failing tests**

Create `lib/inspection/validity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeInspectionValidity } from "./validity";

describe("computeInspectionValidity", () => {
  it("returns nao_emitida with null validoAte/kmLimite when certificadoEmitidoEm is null", () => {
    const result = computeInspectionValidity(null, 50000);
    expect(result).toEqual({ status: "nao_emitida", validoAte: null, kmLimite: null });
  });

  // `setMonth` operates on local time, so two independently hardcoded UTC
  // literals 6 months apart can straddle a DST offset change (WET/WEST in
  // Portugal, e.g.) and land on the wrong boundary depending on the machine's
  // timezone. Deriving `validoAte`/`now` from the same relative computation
  // the implementation uses keeps these tests timezone-agnostic.
  function sixMonthsLater(iso: string): Date {
    const d = new Date(iso);
    d.setMonth(d.getMonth() + 6);
    return d;
  }

  it("returns valida the day before the 6-month mark", () => {
    const emitido = "2026-01-15T10:00:00.000Z";
    const now = new Date(sixMonthsLater(emitido).getTime() - 24 * 60 * 60 * 1000);
    const result = computeInspectionValidity(emitido, 50000, now);
    expect(result.status).toBe("valida");
    expect(result.validoAte).toEqual(sixMonthsLater(emitido));
  });

  it("treats exactly 6 months later as still valid (boundary)", () => {
    const emitido = "2026-01-15T10:00:00.000Z";
    const now = sixMonthsLater(emitido);
    const result = computeInspectionValidity(emitido, 50000, now);
    expect(result.status).toBe("valida");
  });

  it("returns expirada one millisecond after the 6-month mark", () => {
    const emitido = "2026-01-15T10:00:00.000Z";
    const now = new Date(sixMonthsLater(emitido).getTime() + 1);
    const result = computeInspectionValidity(emitido, 50000, now);
    expect(result.status).toBe("expirada");
  });

  it("computes kmLimite as quilometragem + 100", () => {
    const emitido = "2026-01-15T10:00:00.000Z";
    const now = new Date("2026-02-01T00:00:00.000Z");
    expect(computeInspectionValidity(emitido, 0, now).kmLimite).toBe(100);
    expect(computeInspectionValidity(emitido, 87500, now).kmLimite).toBe(87600);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/inspection/validity.test.ts`
Expected: FAIL — `Cannot find module './validity'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/inspection/validity.ts`:

```ts
export type InspectionValidityStatus = "nao_emitida" | "valida" | "expirada";

export type InspectionValidity = {
  status: InspectionValidityStatus;
  validoAte: Date | null;
  kmLimite: number | null;
};

export function computeInspectionValidity(
  certificadoEmitidoEm: string | null,
  quilometragem: number,
  now: Date = new Date()
): InspectionValidity {
  if (certificadoEmitidoEm === null) {
    return { status: "nao_emitida", validoAte: null, kmLimite: null };
  }

  const validoAte = new Date(certificadoEmitidoEm);
  validoAte.setMonth(validoAte.getMonth() + 6);

  const kmLimite = quilometragem + 100;
  const status: InspectionValidityStatus = now.getTime() <= validoAte.getTime() ? "valida" : "expirada";

  return { status, validoAte, kmLimite };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/inspection/validity.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/inspection/validity.ts lib/inspection/validity.test.ts
git commit -m "feat: add pure inspection validity calculation (date + km limit)"
```

---

### Task 3: Campo `quilometragem` no schema de validação

**Files:**
- Modify: `lib/inspection/schema.ts`
- Modify: `lib/inspection/schema.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `inspectionFormSchema` agora inclui `quilometragem: number` (obrigatório) em `InspectionFormValues` — a Task 4's `createInspectionAction` lê `v.quilometragem`.

- [ ] **Step 1: Write the failing tests**

Modify `lib/inspection/schema.test.ts` — adiciona `quilometragem` ao `base` (senão os testes "accepts..." existentes quebram, já que o campo passa a ser obrigatório) e cobre os 3 casos novos. Arquivo completo esperado:

```ts
import { describe, it, expect } from "vitest";
import { resolveObjetivo, inspectionFormSchema } from "./schema";

describe("resolveObjetivo", () => {
  it("forces venda when tipoCliente is stand", () => {
    expect(resolveObjetivo("stand", "compra")).toBe("venda");
    expect(resolveObjetivo("stand", "venda")).toBe("venda");
  });

  it("passes objetivo through when tipoCliente is particular", () => {
    expect(resolveObjetivo("particular", "compra")).toBe("compra");
    expect(resolveObjetivo("particular", "venda")).toBe("venda");
  });
});

describe("inspectionFormSchema", () => {
  const base = {
    tipoCliente: "particular" as const,
    objetivo: "compra" as const,
    nomeSolicitante: "Cliente Teste",
    matricula: "AA-00-BB",
    marca: "Toyota",
    modelo: "Corolla",
    quilometragem: "45000",
  };

  it("accepts a minimal valid particular submission", () => {
    const result = inspectionFormSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects tipoCliente=stand with objetivo=compra (RF-03)", () => {
    const result = inspectionFormSchema.safeParse({ ...base, tipoCliente: "stand", objetivo: "compra" });
    expect(result.success).toBe(false);
  });

  it("accepts tipoCliente=stand with objetivo=venda", () => {
    const result = inspectionFormSchema.safeParse({ ...base, tipoCliente: "stand", objetivo: "venda" });
    expect(result.success).toBe(true);
  });

  it("rejects missing matricula", () => {
    const { matricula, ...rest } = base;
    const result = inspectionFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("treats a blank optional numeric field as undefined, not 0", () => {
    const result = inspectionFormSchema.safeParse({ ...base, anoFabrico: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.anoFabrico).toBeUndefined();
    }
  });

  it("still coerces a real numeric string on the happy path", () => {
    const result = inspectionFormSchema.safeParse({ ...base, anoFabrico: "2020" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.anoFabrico).toBe(2020);
    }
  });

  it("coerces quilometragem from a FormData string to a number", () => {
    const result = inspectionFormSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quilometragem).toBe(45000);
    }
  });

  it("rejects a missing quilometragem", () => {
    const { quilometragem, ...rest } = base;
    const result = inspectionFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a blank quilometragem string", () => {
    const result = inspectionFormSchema.safeParse({ ...base, quilometragem: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative quilometragem", () => {
    const result = inspectionFormSchema.safeParse({ ...base, quilometragem: "-1" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run lib/inspection/schema.test.ts`
Expected: FAIL — as tests que checam `quilometragem` falham porque o schema ainda não tem esse campo (`data.quilometragem` é `undefined`, e "rejects a missing/blank/negative quilometragem" passam de forma acidental hoje porque o campo simplesmente não existe — depois do Step 3 elas passam a testar a regra de verdade).

- [ ] **Step 3: Write the implementation**

Modify `lib/inspection/schema.ts` — adiciona o preprocessor de quilometragem (blank → undefined, para que o `required_error` dispare em vez de coagir `""` para `0`) e o campo no objeto do schema:

```ts
import { z } from "zod";

export const tipoClienteValues = ["particular", "stand"] as const;
export const objetivoValues = ["compra", "venda"] as const;

export type TipoCliente = (typeof tipoClienteValues)[number];
export type Objetivo = (typeof objetivoValues)[number];

export function resolveObjetivo(tipoCliente: TipoCliente, objetivo: Objetivo): Objetivo {
  return tipoCliente === "stand" ? "venda" : objetivo;
}

// ponytail: blank <input type="number"> submits FormData value "", which
// z.coerce.number() reads as Number("") === 0 — .optional() only skips
// undefined, not "". Preprocess "" -> undefined so blanks stay null downstream.
const optionalInt = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().optional());
const optionalNumber = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().optional());

// Same footgun as above, but for a required field: blank must fail with
// "obrigatória", not silently become 0. Preprocess "" -> undefined so the
// required_error fires; non-numeric strings pass through untouched so the
// default invalid_type_error fires instead.
const requiredNonNegativeInt = z.preprocess((v) => {
  if (v === "" || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}, z.number({ required_error: "Quilometragem é obrigatória" }).int().min(0, "Quilometragem não pode ser negativa"));

export const inspectionFormSchema = z
  .object({
    tipoCliente: z.enum(tipoClienteValues),
    objetivo: z.enum(objetivoValues),
    nomeSolicitante: z.string().min(1, "Nome do solicitante é obrigatório"),
    contacto: z.string().optional(),
    email: z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
    responsavelPresente: z.string().optional(),
    matricula: z.string().min(1, "Matrícula é obrigatória"),
    marca: z.string().min(1, "Marca é obrigatória"),
    modelo: z.string().min(1, "Modelo é obrigatório"),
    quilometragem: requiredNonNegativeInt,
    versaoTrim: z.string().optional(),
    anoFabrico: optionalInt,
    anoModelo: optionalInt,
    cor: z.string().optional(),
    vin: z.string().optional(),
    numeroMotor: z.string().optional(),
    numeroPortas: optionalInt,
    combustivel: z.string().optional(),
    caixaVelocidades: z.string().optional(),
    tracao: z.string().optional(),
    potenciaCv: optionalInt,
    torqueNm: optionalNumber,
  })
  .refine((data) => data.tipoCliente !== "stand" || data.objetivo === "venda", {
    message: "Objetivo deve ser 'venda' quando o tipo de cliente é stand",
    path: ["objetivo"],
  });

export type InspectionFormValues = z.infer<typeof inspectionFormSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/inspection/schema.test.ts`
Expected: PASS — 12 tests (8 originais + 4 novos: coerce, missing, blank, negative).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/inspection/schema.ts lib/inspection/schema.test.ts
git commit -m "feat: require quilometragem in the inspection form schema"
```

---

### Task 4: Campo no formulário + wiring da RPC

**Files:**
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx`
- Modify: `app/(app)/inspections/new/actions.ts`
- Modify: `app/(app)/inspections/new/actions.test.ts`

**Interfaces:**
- Consumes: `inspectionFormSchema` (Task 3, já inclui `quilometragem`).
- Produces: nada consumido por outras tasks — fecha o fluxo de captura do dado.

- [ ] **Step 1: Add the input to the form**

Em `app/(app)/inspections/new/new-inspection-form.tsx`, adiciona o campo logo depois de "Modelo" (mesmo grupo dos campos obrigatórios do veículo):

```tsx
        <label htmlFor="modelo">Modelo</label>
        <input id="modelo" name="modelo" required />

        <label htmlFor="quilometragem">Quilometragem</label>
        <input id="quilometragem" name="quilometragem" type="number" required min={0} />

        <label htmlFor="versaoTrim">Versão</label>
```

(substitui o trecho `<label htmlFor="modelo">...</label>\n\n        <label htmlFor="versaoTrim">` por essa versão com o novo campo no meio.)

- [ ] **Step 2: Update the failing tests in actions.test.ts**

`createInspectionAction` agora rejeita FormData sem `quilometragem` (Task 3 tornou o campo obrigatório no schema). Os dois testes que montam um FormData "válido" precisam do campo. Modify `app/(app)/inspections/new/actions.test.ts`:

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
  it("returns a validation error without calling the RPC when required fields are missing", async () => {
    const { createInspectionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    // matricula/marca/modelo/nomeSolicitante/quilometragem missing

    const result = await createInspectionAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a validation error when quilometragem is missing", async () => {
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

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/inspections/new/actions.test.ts"`
Expected: FAIL — o teste "calls create_inspection with mapped params..." falha porque `p_quilometragem` não está no objeto passado pra `rpc` ainda (actions.ts não muda até o Step 4).

- [ ] **Step 4: Wire quilometragem into the RPC call**

Modify `app/(app)/inspections/new/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inspectionFormSchema } from "@/lib/inspection/schema";
import type { StandContact } from "./stand-autocomplete";

export type CreateInspectionState = { status: "idle" } | { status: "error"; message: string };

export async function createInspectionAction(
  _prevState: CreateInspectionState,
  formData: FormData
): Promise<CreateInspectionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = inspectionFormSchema.safeParse(raw);

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/inspections/new/actions.test.ts" "app/(app)/inspections/new/new-inspection-form.test.tsx"`
Expected: PASS — 7 tests em `actions.test.ts` (6 originais + 1 nova, "returns a validation error when quilometragem is missing") + 3 em `new-inspection-form.test.tsx` (inalterados — nenhum usa `getByLabelText` em algo que colida com "Quilometragem").

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/inspections/new/new-inspection-form.tsx" "app/(app)/inspections/new/actions.ts" "app/(app)/inspections/new/actions.test.ts"
git commit -m "feat: capture quilometragem in the inspection form and pass it to create_inspection"
```

---

### Task 5: Selo de validade na página de detalhe

**Files:**
- Modify: `app/(app)/inspections/[id]/page.tsx`

**Interfaces:**
- Consumes: `computeInspectionValidity` from `@/lib/inspection/validity` (Task 2). `inspection.certificado_emitido_em` e `inspection.vehicle_data.quilometragem` já vêm no `select("*, vehicle_data(*), client_data(*)")` existente — sem mudança de query.
- Produces: nada consumido por outras tasks — fecha o fluxo.

- [ ] **Step 1: Add the validity badge**

Modify `app/(app)/inspections/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeInspectionValidity } from "@/lib/inspection/validity";

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
      {validity.status === "valida" && (
        <p>
          ✅ Válida até {validity.validoAte!.toLocaleDateString("pt-PT")} (até {validity.kmLimite} km)
        </p>
      )}
      {validity.status === "expirada" && (
        <p>
          ⚠️ Expirada em {validity.validoAte!.toLocaleDateString("pt-PT")} (válida para até 100km rodados desde a
          inspeção)
        </p>
      )}
      <p>
        <em>A checklist será implementada numa fase seguinte.</em>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Rodar a suíte inteira, typecheck e build**

Run: `npm test`
Expected: PASS — todos os testes existentes + os novos das Tasks 2–4.

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/inspections/[id]/page.tsx"
git commit -m "feat: show inspection validity badge on the summary page"
```

---

## Depois do plano

Esta fase **tem UI** (selo novo na página de detalhe) e **adiciona código/abstração nova** (módulo `lib/inspection/validity.ts`, coluna e RPC novos) — pela regra de transição em `docs/ROADMAP.md`, o gate de fechamento inclui:

- `requesting-code-review` — sempre.
- `ponytail-review` — fase adicionou código novo.
- `verify` — dirigir o fluxo real no navegador: criar uma inspeção com quilometragem preenchida, abrir a página de detalhe, confirmar que nenhum selo aparece (inspeção recém-criada não tem `certificado_emitido_em`). Como não há UI de emissão de certificado ainda (Fase 5, não construída), testar os estados `valida`/`expirada` do selo exige simular `certificado_emitido_em` diretamente no banco (`update inspections set certificado_emitido_em = now() - interval '7 months' where id = '<id>'`) e recarregar a página — documentar isso explicitamente na verificação manual.
- `security-review` — **não se aplica**: nenhuma policy de RLS nova, nenhuma mudança em auth/controle de acesso; a RPC continua `security invoker`.
