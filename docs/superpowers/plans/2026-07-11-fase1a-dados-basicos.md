# Fase 1a: Dados Básicos da Inspeção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the inspection-creation form (RF-02 a RF-06) — técnico enters vehicle + client data, `objetivo` is locked to "venda" for stand clients (RF-03), stand contacts autocomplete from prior inspections (RF-05), and the record is durably saved before anything downstream can proceed (RF-06).

**Architecture:** First frontend code in the repo — Next.js (App Router) talking to the existing Supabase schema (`supabase/migrations/00001`-`00010`) via `@supabase/ssr`. One new Postgres RPC (`create_inspection`, `security invoker` — no exception to house convention) wraps the three-table insert (`inspections`/`vehicle_data`/`client_data`) in a single transaction so RF-06 can't leave an orphaned draft. RF-05's stand autocomplete is a plain filtered `select` on `client_data` — the existing RLS policy (`client_data_select`, migration `00008`) already scopes it correctly per role: técnico sees stands from their own past inspections, admin sees all. No new permission surface, no `security definer`. No checklist, no group navigation — those are separate phases.

**Tech Stack:** Next.js 15 (App Router) + React 19, TypeScript, `@supabase/ssr` + `@supabase/supabase-js`, `zod` for validation, Vitest + Testing Library for tests. No ORM (matches house convention — plain SQL migrations via `supabase db push`). No new form-state library — native `<form action={...}>` + Server Actions cover it.

## Global Constraints

- RF-02: collect every field from PRD §5 — vehicle: matrícula, marca, modelo, versão(trim), ano_fabrico, ano_modelo, cor, VIN, número_motor, número_portas, combustível, caixa_velocidades, tração, potência_cv, torque_nm. Client: tipo_cliente, nome_solicitante, contacto, email, responsável_presente, objetivo.
- RF-03: `tipo_cliente = stand` ⇒ `objetivo` fixed to `"venda"`, not editable. Already enforced in the DB by the `objetivo_stand_fixo` check constraint (`supabase/migrations/00001_core_entities.sql:31-33`) — the UI must mirror it (disable the field), not replace it.
- RF-04: `tipo_cliente = particular` ⇒ `objetivo` accepts `"compra"` or `"venda"`.
- RF-05: for `tipo_cliente = stand`, autocomplete contacto/email by looking up stands already used in prior inspections **visible to the current user under existing RLS** — i.e. técnico only sees stands from their own past inspections, admin sees all. Confirmed against `docs/especificacao-tecnica-v1.md` §3 ("Ver apenas as próprias inspeções — Técnico"; "o Técnico só enxerga/edita as suas próprias inspeções") — the spec gives no basis for cross-técnico visibility, so this phase does not introduce any. If cross-técnico stand lookup is wanted later, that's a permission-model change to §3 requiring explicit approval, not something to infer from "autocomplete" wording.
- RF-06: vehicle/client data must be durably saved (all three tables) before the user can proceed past this screen — no partial saves.
- **No checklist, no group navigation, no scoring, no admin screens in this phase** — out of scope per explicit instruction.
- `aplica_stand` decision (2026-07-11): unblocked, not relevant to this phase — checklist items aren't touched here.
- House SQL convention: `language sql|plpgsql ... security invoker set search_path = ''`, fully-qualified table names, `(select auth.uid())` not bare `auth.uid()`. This phase introduces zero exceptions to that convention — `create_inspection` is `security invoker`, and RF-05 needs no new function at all.
- Every migration is plain SQL applied via `supabase db push`; SQL tests are hand-rolled `do $$ ... raise exception ... $$` blocks run via `psql "$DATABASE_URL" -f <file>` (same style as `supabase/tests/00001`-`00010`), not pgTAP.
- We are already inside the worktree `fase1a-dados-basicos` (branch `worktree-fase1a-dados-basicos`); do not create another worktree.

**Prerequisites (once, not a task):**
1. Confirm `DATABASE_URL` is set and points at the linked Supabase project — `echo "$DATABASE_URL"` should print `postgres://...`.
2. Create `.env.local` (git-ignored) from `.env.local.example` (Task 1) with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the same project (Supabase dashboard → Project Settings → API).
3. Create one test técnico for manual verification: Supabase Dashboard → Authentication → Users → Add user (email + password) — this is required because `auth.users` passwords are hashed by GoTrue, not insertable via raw SQL. Then: `insert into public.users (id, nome, email, role) values ('<uid-from-dashboard>', 'Técnico Teste', '<email>', 'tecnico');`

---

## File Structure

```
package.json, tsconfig.json, next.config.ts, next-env.d.ts    -- Next.js scaffold
vitest.config.ts, vitest.setup.ts                              -- test runner
.env.local.example
app/
  layout.tsx, globals.css, page.tsx                            -- root shell, redirects to /login
  login/
    page.tsx, page.test.tsx                                    -- RF-01 minimal auth (unblocks testing RLS-gated writes)
  (app)/
    inspections/
      new/
        page.tsx                                                -- server wrapper, renders the form
        new-inspection-form.tsx, new-inspection-form.test.tsx    -- RF-02/03/04 fields + objetivo lock
        stand-autocomplete.tsx                                   -- RF-05 lookup UI
        actions.ts, actions.test.ts                              -- RF-06 server action (create_inspection RPC) + RF-05 search action (plain client_data select)
      [id]/
        page.tsx                                                 -- read-only confirmation ("acesso liberado")
lib/
  supabase/
    client.ts, client.test.ts                                    -- browser client
    server.ts                                                     -- server/RSC client
  inspection/
    schema.ts, schema.test.ts                                     -- zod schema + resolveObjetivo (RF-03/04 pure logic)
middleware.ts                                                     -- session refresh, guards /inspections/*
supabase/
  migrations/00011_fase1a_create_inspection.sql                   -- create_inspection only
  tests/00011_fase1a_create_inspection.test.sql
```

---

### Task 1: Next.js scaffold + Supabase clients + auth middleware

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `.env.local.example`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `vitest.config.ts`, `vitest.setup.ts`
- Create: `lib/supabase/client.ts`, `lib/supabase/client.test.ts`, `lib/supabase/server.ts`, `middleware.ts`
- Modify: `.gitignore` (add `node_modules`, `.next`)

**Interfaces:**
- Produces: `createClient()` from `lib/supabase/client.ts` (browser, no args, returns a `SupabaseClient`). `createClient()` from `lib/supabase/server.ts` (async, no args, returns `Promise<SupabaseClient>`). Every later task that touches Supabase imports one of these two by this exact name/path — never instantiate `createBrowserClient`/`createServerClient` directly elsewhere.

- [ ] **Step 1: Write the scaffold and config files**

```json
// package.json
{
  "name": "inspecta-app",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.0.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/ssr": "^0.5.2",
    "@supabase/supabase-js": "^2.45.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "@types/node": "^22.9.0",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.1",
    "@vitejs/plugin-react": "^4.3.3",
    "vitest": "^2.1.5",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.6.3",
    "jsdom": "^25.0.1"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

```typescript
// next-env.d.ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

```
# .env.local.example
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

```typescript
// app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Inspecta" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
```

```css
/* app/globals.css */
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
```

```typescript
// app/page.tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}
```

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

```typescript
// vitest.setup.ts
import "@testing-library/jest-dom/vitest";
```

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component render — middleware refreshes the session instead
          }
        },
      },
    }
  );
}
```

```typescript
// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/inspections")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/inspections/:path*"],
};
```

- [ ] **Step 2: Add node_modules/.next to .gitignore**

Check `.gitignore` first (`cat .gitignore`) — `.env*` is already ignored from the RLS worktree commit. Append if missing:

```
node_modules
.next
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: exits 0, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 4: Verify the app builds**

Run: `NEXT_PUBLIC_SUPABASE_URL=http://localhost NEXT_PUBLIC_SUPABASE_ANON_KEY=test npm run build`
Expected: exits 0, no TypeScript errors, `.next/` produced.

- [ ] **Step 5: Write the smoke test**

```typescript
// lib/supabase/client.test.ts
import { describe, it, expect } from "vitest";
import { createClient } from "./client";

describe("createClient", () => {
  it("is a function", () => {
    expect(typeof createClient).toBe("function");
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts next-env.d.ts .env.local.example .gitignore vitest.config.ts vitest.setup.ts app/layout.tsx app/globals.css app/page.tsx lib/supabase/client.ts lib/supabase/client.test.ts lib/supabase/server.ts middleware.ts
git commit -m "feat: scaffold Next.js app with Supabase clients and auth middleware"
```

---

### Task 2: DB layer — `create_inspection` RPC (RF-06)

**Files:**
- Create: `supabase/migrations/00011_fase1a_create_inspection.sql`
- Test: `supabase/tests/00011_fase1a_create_inspection.test.sql`

**Interfaces:**
- Produces: `public.create_inspection(p_tipo_cliente, p_objetivo, p_matricula, p_marca, p_modelo, p_nome_solicitante, p_versao_trim default null, p_ano_fabrico default null, p_ano_modelo default null, p_cor default null, p_vin default null, p_numero_motor default null, p_numero_portas default null, p_combustivel default null, p_caixa_velocidades default null, p_tracao default null, p_potencia_cv default null, p_torque_nm default null, p_contacto default null, p_email default null, p_responsavel_presente default null) returns uuid`. Task 7's `createInspectionAction` calls this by this exact name via `supabase.rpc(...)`.
- Consumes: `public.inspections`, `public.vehicle_data`, `public.client_data`, `public.tipo_cliente`, `public.objetivo_inspecao` (migration 00001).

**Note on RF-05:** no RPC needed for the stand-contact lookup — Task 7's `searchStandContactsAction` reads `public.client_data` directly, and the existing `client_data_select` RLS policy (migration `00008`) already scopes results correctly per role (técnico: own inspections only; admin: all). See Global Constraints for why a cross-técnico lookup was rejected.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00011_fase1a_create_inspection.sql
-- Fase 1a (Dados básicos) — RPC de apoio ao formulário de criação de inspeção.
-- RF-02 a RF-06: docs/especificacao-tecnica-v1.md

create function public.create_inspection(
  p_tipo_cliente public.tipo_cliente,
  p_objetivo public.objetivo_inspecao,
  p_matricula text,
  p_marca text,
  p_modelo text,
  p_nome_solicitante text,
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
    potencia_cv, torque_nm
  ) values (
    v_inspection_id, p_matricula, p_marca, p_modelo, p_versao_trim, p_ano_fabrico, p_ano_modelo,
    p_cor, p_vin, p_numero_motor, p_numero_portas, p_combustivel, p_caixa_velocidades, p_tracao,
    p_potencia_cv, p_torque_nm
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

Run: `supabase db push`
Expected: applies with no errors (creates 1 function).

- [ ] **Step 3: Write the test**

```sql
-- supabase/tests/00011_fase1a_create_inspection.test.sql
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
      p_nome_solicitante => 'Stand Invalido'
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

- [ ] **Step 4: Run the test**

Run: `psql "$DATABASE_URL" -f supabase/tests/00011_fase1a_create_inspection.test.sql`
Expected: 3 `NOTICE: OK: ...` lines, no `ERROR`, ends with `ROLLBACK`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00011_fase1a_create_inspection.sql supabase/tests/00011_fase1a_create_inspection.test.sql
git commit -m "feat: add create_inspection RPC for atomic three-table save (RF-02–06)"
```

---

### Task 3: Minimal login page

**Files:**
- Create: `app/login/page.tsx`, `app/login/page.test.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/client.ts` (Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
// app/login/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "./page";

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword } }),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  signInWithPassword.mockReset();
  push.mockReset();
});

describe("LoginPage", () => {
  it("shows an error message on invalid credentials", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email ou palavra-passe inválidos.");
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects to /inspections/new on success", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/inspections/new"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- app/login/page.test.tsx`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 3: Write the page**

```typescript
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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      setError("Email ou palavra-passe inválidos.");
      return;
    }

    router.push("/inspections/new");
    router.refresh();
  }

  return (
    <main>
      <h1>Inspecta — Login</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="password">Palavra-passe</label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "A entrar..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/login/page.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx app/login/page.test.tsx
git commit -m "feat: add minimal login page"
```

---

### Task 4: Validation schema + `resolveObjetivo` (RF-03/04 pure logic)

**Files:**
- Create: `lib/inspection/schema.ts`, `lib/inspection/schema.test.ts`

**Interfaces:**
- Produces: `resolveObjetivo(tipoCliente, objetivo)`, `inspectionFormSchema` (zod), `type InspectionFormValues`. Task 5's form component and Task 7's server action both import these by these exact names from `@/lib/inspection/schema`.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/inspection/schema.test.ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/inspection/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Write the schema**

```typescript
// lib/inspection/schema.ts
import { z } from "zod";

export const tipoClienteValues = ["particular", "stand"] as const;
export const objetivoValues = ["compra", "venda"] as const;

export type TipoCliente = (typeof tipoClienteValues)[number];
export type Objetivo = (typeof objetivoValues)[number];

export function resolveObjetivo(tipoCliente: TipoCliente, objetivo: Objetivo): Objetivo {
  return tipoCliente === "stand" ? "venda" : objetivo;
}

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
    versaoTrim: z.string().optional(),
    anoFabrico: z.coerce.number().int().optional(),
    anoModelo: z.coerce.number().int().optional(),
    cor: z.string().optional(),
    vin: z.string().optional(),
    numeroMotor: z.string().optional(),
    numeroPortas: z.coerce.number().int().optional(),
    combustivel: z.string().optional(),
    caixaVelocidades: z.string().optional(),
    tracao: z.string().optional(),
    potenciaCv: z.coerce.number().int().optional(),
    torqueNm: z.coerce.number().optional(),
  })
  .refine((data) => data.tipoCliente !== "stand" || data.objetivo === "venda", {
    message: "Objetivo deve ser 'venda' quando o tipo de cliente é stand",
    path: ["objetivo"],
  });

export type InspectionFormValues = z.infer<typeof inspectionFormSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/inspection/schema.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/inspection/schema.ts lib/inspection/schema.test.ts
git commit -m "feat: add inspection form schema and objetivo-lock logic (RF-03/04)"
```

---

### Task 5: Inspection form component (RF-02/03/04 fields)

**Files:**
- Create: `app/(app)/inspections/new/new-inspection-form.tsx`, `app/(app)/inspections/new/new-inspection-form.test.tsx`

**Interfaces:**
- Consumes: `resolveObjetivo`, `tipoClienteValues`, `objetivoValues` (Task 4). `createInspectionAction` from `./actions` (Task 7 — stub it in this task's test via `vi.mock`, Task 7 implements the real one).
- Produces: `NewInspectionForm` (default export), a client component. Task 6 adds `<StandAutocomplete>` inside it; Task 7's `page.tsx` renders it.

- [ ] **Step 1: Write the failing test**

```typescript
// app/(app)/inspections/new/new-inspection-form.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewInspectionForm } from "./new-inspection-form";

vi.mock("./actions", () => ({
  createInspectionAction: vi.fn(async (_prevState: unknown) => ({ status: "idle" })),
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- new-inspection-form.test.tsx`
Expected: FAIL — `Cannot find module './new-inspection-form'`.

- [ ] **Step 3: Write the component**

```typescript
// app/(app)/inspections/new/new-inspection-form.tsx
"use client";

import { useActionState, useState } from "react";
import {
  resolveObjetivo,
  tipoClienteValues,
  objetivoValues,
  type TipoCliente,
  type Objetivo,
} from "@/lib/inspection/schema";
import { createInspectionAction, type CreateInspectionState } from "./actions";

const initialState: CreateInspectionState = { status: "idle" };

export function NewInspectionForm() {
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("particular");
  const [objetivo, setObjetivo] = useState<Objetivo>("compra");
  const [state, formAction] = useActionState(createInspectionAction, initialState);

  function handleTipoClienteChange(value: TipoCliente) {
    setTipoCliente(value);
    setObjetivo(resolveObjetivo(value, objetivo));
  }

  return (
    <form action={formAction}>
      <fieldset>
        <legend>Cliente</legend>

        <label htmlFor="tipoCliente">Tipo de cliente</label>
        <select
          id="tipoCliente"
          name="tipoCliente"
          value={tipoCliente}
          onChange={(e) => handleTipoClienteChange(e.target.value as TipoCliente)}
        >
          {tipoClienteValues.map((v) => (
            <option key={v} value={v}>
              {v === "particular" ? "Particular" : "Stand"}
            </option>
          ))}
        </select>

        <label htmlFor="objetivo">Objetivo</label>
        <select
          id="objetivo"
          name="objetivo"
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

        <label htmlFor="nomeSolicitante">Nome do solicitante</label>
        <input id="nomeSolicitante" name="nomeSolicitante" required />

        <label htmlFor="contacto">Contacto</label>
        <input id="contacto" name="contacto" />

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" />

        <label htmlFor="responsavelPresente">Responsável presente</label>
        <input id="responsavelPresente" name="responsavelPresente" />
      </fieldset>

      <fieldset>
        <legend>Veículo</legend>

        <label htmlFor="matricula">Matrícula</label>
        <input id="matricula" name="matricula" required />

        <label htmlFor="marca">Marca</label>
        <input id="marca" name="marca" required />

        <label htmlFor="modelo">Modelo</label>
        <input id="modelo" name="modelo" required />

        <label htmlFor="versaoTrim">Versão</label>
        <input id="versaoTrim" name="versaoTrim" />

        <label htmlFor="anoFabrico">Ano de fabrico</label>
        <input id="anoFabrico" name="anoFabrico" type="number" />

        <label htmlFor="anoModelo">Ano do modelo</label>
        <input id="anoModelo" name="anoModelo" type="number" />

        <label htmlFor="cor">Cor</label>
        <input id="cor" name="cor" />

        <label htmlFor="vin">VIN</label>
        <input id="vin" name="vin" />

        <label htmlFor="numeroMotor">Número do motor</label>
        <input id="numeroMotor" name="numeroMotor" />

        <label htmlFor="numeroPortas">Número de portas</label>
        <input id="numeroPortas" name="numeroPortas" type="number" />

        <label htmlFor="combustivel">Combustível</label>
        <input id="combustivel" name="combustivel" />

        <label htmlFor="caixaVelocidades">Caixa de velocidades</label>
        <input id="caixaVelocidades" name="caixaVelocidades" />

        <label htmlFor="tracao">Tração</label>
        <input id="tracao" name="tracao" />

        <label htmlFor="potenciaCv">Potência (cv)</label>
        <input id="potenciaCv" name="potenciaCv" type="number" />

        <label htmlFor="torqueNm">Torque (Nm)</label>
        <input id="torqueNm" name="torqueNm" type="number" step="0.01" />
      </fieldset>

      {state.status === "error" && <p role="alert">{state.message}</p>}
      <button type="submit">Guardar</button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- new-inspection-form.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/inspections/new/new-inspection-form.tsx" "app/(app)/inspections/new/new-inspection-form.test.tsx"
git commit -m "feat: add inspection form with objetivo lock (RF-02/03/04)"
```

---

### Task 6: RF-05 stand autocomplete

**Files:**
- Create: `app/(app)/inspections/new/stand-autocomplete.tsx`
- Modify: `app/(app)/inspections/new/new-inspection-form.tsx` — wire in the autocomplete for stand clients

**Interfaces:**
- Consumes: `searchStandContactsAction(query)` from `./actions` (Task 7 defines it; stub it here via `vi.mock`, same pattern as Task 5).
- Produces: `StandAutocomplete` component, `onSelect: (contact: { nome_solicitante: string; contacto: string | null; email: string | null }) => void` prop.

- [ ] **Step 1: Write the failing test**

```typescript
// app/(app)/inspections/new/stand-autocomplete.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StandAutocomplete } from "./stand-autocomplete";

vi.mock("./actions", () => ({
  searchStandContactsAction: vi.fn(async (query: string) =>
    query === "Stand"
      ? [{ nome_solicitante: "Stand Central", contacto: "910000000", email: "s@c.pt" }]
      : []
  ),
}));

describe("StandAutocomplete", () => {
  it("shows matching stands and calls onSelect with the chosen contact", async () => {
    const onSelect = vi.fn();
    render(<StandAutocomplete onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText("Procurar stand existente"), {
      target: { value: "Stand" },
    });

    const option = await screen.findByText(/Stand Central/);
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith({
      nome_solicitante: "Stand Central",
      contacto: "910000000",
      email: "s@c.pt",
    });
  });

  it("shows nothing for queries under 2 characters", async () => {
    render(<StandAutocomplete onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Procurar stand existente"), { target: { value: "S" } });
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- stand-autocomplete.test.tsx`
Expected: FAIL — `Cannot find module './stand-autocomplete'`.

- [ ] **Step 3: Write the component**

```typescript
// app/(app)/inspections/new/stand-autocomplete.tsx
"use client";

import { useState, useTransition } from "react";
import { searchStandContactsAction } from "./actions";

export type StandContact = { nome_solicitante: string; contacto: string | null; email: string | null };

export function StandAutocomplete({ onSelect }: { onSelect: (contact: StandContact) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StandContact[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const found = await searchStandContactsAction(value);
      setResults(found);
    });
  }

  return (
    <div>
      <label htmlFor="standSearch">Procurar stand existente</label>
      <input id="standSearch" value={query} onChange={(e) => handleChange(e.target.value)} />
      {isPending && <span>A procurar...</span>}
      {results.length > 0 && (
        <ul>
          {results.map((c) => (
            <li key={c.nome_solicitante}>
              <button type="button" onClick={() => onSelect(c)}>
                {c.nome_solicitante} — {c.contacto ?? "sem contacto"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- stand-autocomplete.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into the form**

In `app/(app)/inspections/new/new-inspection-form.tsx`:

1. Add imports:

```typescript
import { StandAutocomplete, type StandContact } from "./stand-autocomplete";
```

2. Add controlled state for the fields the autocomplete fills, replacing the plain `nomeSolicitante`/`contacto`/`email` inputs with controlled ones:

```typescript
const [nomeSolicitante, setNomeSolicitante] = useState("");
const [contacto, setContacto] = useState("");
const [email, setEmail] = useState("");

function handleStandSelect(contact: StandContact) {
  setNomeSolicitante(contact.nome_solicitante);
  setContacto(contact.contacto ?? "");
  setEmail(contact.email ?? "");
}
```

3. Replace the three inputs and add the autocomplete, conditional on `tipoCliente === "stand"`:

```tsx
<label htmlFor="nomeSolicitante">Nome do solicitante</label>
<input
  id="nomeSolicitante"
  name="nomeSolicitante"
  required
  value={nomeSolicitante}
  onChange={(e) => setNomeSolicitante(e.target.value)}
/>

{tipoCliente === "stand" && <StandAutocomplete onSelect={handleStandSelect} />}

<label htmlFor="contacto">Contacto</label>
<input id="contacto" name="contacto" value={contacto} onChange={(e) => setContacto(e.target.value)} />

<label htmlFor="email">Email</label>
<input
  id="email"
  name="email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
```

- [ ] **Step 6: Re-run the form test suite to confirm no regression**

Run: `npm test -- new-inspection-form.test.tsx stand-autocomplete.test.tsx`
Expected: PASS, 4 tests total.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/inspections/new/stand-autocomplete.tsx" "app/(app)/inspections/new/stand-autocomplete.test.tsx" "app/(app)/inspections/new/new-inspection-form.tsx"
git commit -m "feat: add stand contact autocomplete (RF-05)"
```

---

### Task 7: Server actions (RF-06 save) + confirmation page + route wiring

**Files:**
- Create: `app/(app)/inspections/new/actions.ts`, `app/(app)/inspections/new/actions.test.ts`
- Create: `app/(app)/inspections/new/page.tsx`
- Create: `app/(app)/inspections/[id]/page.tsx`

**Interfaces:**
- Produces: `createInspectionAction(prevState, formData)`, `type CreateInspectionState = { status: "idle" } | { status: "error"; message: string }`, `searchStandContactsAction(query: string)` — the two names Tasks 5 and 6 already import.
- Consumes: `createClient()` from `lib/supabase/server.ts` (Task 1), `inspectionFormSchema` (Task 4), `create_inspection` RPC (Task 2), `NewInspectionForm` (Task 5/6). `searchStandContactsAction` does **not** call an RPC — it's a plain `.from("client_data").select(...)`, relying entirely on the existing `client_data_select` RLS policy (migration `00008`) to scope results per role.

- [ ] **Step 1: Write the failing test**

```typescript
// app/(app)/inspections/new/actions.test.ts
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
    // matricula/marca/modelo/nomeSolicitante missing

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

Note: relying on the plain `select` means results aren't deduped by `nome_solicitante` — a técnico with multiple past inspections for the same stand will see repeated entries. Acceptable (small, per-técnico dataset); add `distinct`-style dedup only if it becomes a real UX complaint.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- actions.test.ts`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Write the server actions**

```typescript
// app/(app)/inspections/new/actions.ts
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

  if (error) return [];

  return data ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- actions.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the route pages**

```typescript
// app/(app)/inspections/new/page.tsx
import { NewInspectionForm } from "./new-inspection-form";

export default function NewInspectionPage() {
  return (
    <main>
      <h1>Nova inspeção — dados básicos</h1>
      <NewInspectionForm />
    </main>
  );
}
```

```typescript
// app/(app)/inspections/[id]/page.tsx
import { notFound } from "next/navigation";
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
        <em>A checklist será implementada numa fase seguinte.</em>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Full verification**

Run: `npm test`
Expected: PASS, all tests across every task (18 tests: 1 smoke + 2 login + 5 schema + 2 form + 2 autocomplete + 6 actions — note some suites share `describe` blocks, actual count may differ slightly; the requirement is zero failures).

Run: `NEXT_PUBLIC_SUPABASE_URL=http://localhost NEXT_PUBLIC_SUPABASE_ANON_KEY=test npm run build`
Expected: exits 0.

- [ ] **Step 7: Manual smoke test**

With `.env.local` pointing at the real project and the test técnico created (Prerequisites #3):

```bash
npm run dev
```

Open `http://localhost:3000` → redirects to `/login` → sign in → redirects to `/inspections/new` → fill the form with `tipoCliente=stand` and confirm `objetivo` locks to "Venda" → type 2+ characters in "Procurar stand existente" (after at least one stand inspection exists) and confirm results appear → submit → redirected to `/inspections/<id>` showing the saved data.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/inspections/new/actions.ts" "app/(app)/inspections/new/actions.test.ts" "app/(app)/inspections/new/page.tsx" "app/(app)/inspections/[id]/page.tsx"
git commit -m "feat: wire inspection creation server action and confirmation page (RF-06)"
```

---

## Self-Review

**Spec coverage:** RF-02 (Task 5/1's fields) ✓, RF-03 (Task 4 `resolveObjetivo` + Task 5 disabled select + DB constraint) ✓, RF-04 (Task 4 schema allows both values for particular) ✓, RF-05 (Task 6 UI + Task 7 `searchStandContactsAction`, scoped by existing RLS, no new permission surface) ✓, RF-06 (Task 2 single-transaction RPC + Task 7 action/redirect) ✓. Checklist/group navigation explicitly excluded per instruction — no task touches `checklist_*` tables.

**Placeholder scan:** none — every step has runnable code or an exact command with a stated expected result.

**Type consistency:** form field `name` attributes (Task 5/6) match `inspectionFormSchema` keys (Task 4) match the destructured `v.*` used in `actions.ts` (Task 7) match `create_inspection`'s `p_*` parameter names (Task 2). `StandContact` type is defined once in `stand-autocomplete.tsx` (Task 6) and imported by `actions.ts` (Task 7), not redefined.

**Permission scope check (added after review):** confirmed against `docs/especificacao-tecnica-v1.md` §3 that no task in this plan grants any user visibility beyond what the existing RLS policies (migration `00008`) already allow. `create_inspection` is `security invoker`; RF-05's lookup is a plain `select` subject to `client_data_select`. Zero `security definer` functions, zero new grants, zero deviation from house SQL convention.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-fase1a-dados-basicos.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
