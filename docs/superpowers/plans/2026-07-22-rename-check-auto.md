# Rename: Inspecta → Check Auto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every current-brand mention of "Inspecta" with "Check Auto" in the 7 living docs/code files identified in the design spec, leaving all historical/dated artifacts untouched.

**Architecture:** Pure text substitution across 7 files — no logic, no schema, no new tests (existing suite already passes with zero "Inspecta" assertions, confirmed during brainstorming). One task, one commit.

**Tech Stack:** Same as rest of the app — Next.js 15, Vitest. No new dependencies.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-22-rename-check-auto-design.md` — read for the "why".
- Only the 7 files listed below change. Do not touch: `docs/superpowers/specs/*`, `docs/superpowers/plans/*` (other than this one), `journey-into-inspecta.md`, any `supabase/migrations/*.sql` file, or `docs/data/checklist-inspecta-v5.csv` (filename or its path references anywhere).
- `package-lock.json` is not hand-edited — it regenerates on the next `npm install`, out of scope for this task.
- Exact substitutions only — do not add taglines, subtitles, or any text beyond the literal "Inspecta" → "Check Auto" swap specified per file.

---

### Task 1: Rename Inspecta → Check Auto across living docs and UI

**Files:**
- Modify: `README.md:1`
- Modify: `CLAUDE.md:1`
- Modify: `docs/ROADMAP.md:1`
- Modify: `docs/database-schema-v1.md:1`
- Modify: `package.json:2`
- Modify: `app/layout.tsx:4`
- Modify: `app/login/page.tsx:34`

**Interfaces:** None — no other task depends on this one; it's the only task in the plan.

- [ ] **Step 1: Confirm no test depends on the current strings**

```bash
grep -rli "inspecta" --include="*.test.*" .
```

Expected: no output (empty). This was already verified during brainstorming — re-confirm before editing in case anything changed since.

- [ ] **Step 2: Edit `README.md`**

Change line 1 from:
```markdown
# Inspecta
```
to:
```markdown
# Check Auto
```

- [ ] **Step 3: Edit `CLAUDE.md`**

Change line 1 from:
```markdown
# bild app (Inspecta)
```
to:
```markdown
# bild app (Check Auto)
```

- [ ] **Step 4: Edit `docs/ROADMAP.md`**

Change line 1 from:
```markdown
# Roadmap — Inspecta v1.0
```
to:
```markdown
# Roadmap — Check Auto v1.0
```

- [ ] **Step 5: Edit `docs/database-schema-v1.md`**

Change line 1 from:
```markdown
# Inspecta — Esquema de Banco de Dados v1.0
```
to:
```markdown
# Check Auto — Esquema de Banco de Dados v1.0
```

- [ ] **Step 6: Edit `package.json`**

Change line 2 from:
```json
  "name": "inspecta-app",
```
to:
```json
  "name": "check-auto-app",
```

- [ ] **Step 7: Edit `app/layout.tsx`**

Change line 4 from:
```tsx
export const metadata = { title: "Inspecta" };
```
to:
```tsx
export const metadata = { title: "Check Auto" };
```

- [ ] **Step 8: Edit `app/login/page.tsx`**

Change line 34 from:
```tsx
      <h1>Inspecta — Login</h1>
```
to:
```tsx
      <h1>Check Auto — Login</h1>
```

- [ ] **Step 9: Verify no residual "Inspecta" in the 7 scoped files**

```bash
grep -rli "inspecta" README.md CLAUDE.md docs/ROADMAP.md docs/database-schema-v1.md package.json app/layout.tsx "app/login/page.tsx"
```

Expected: no output (empty). If anything prints, one of the 7 edits above was missed or incomplete — fix it before continuing.

- [ ] **Step 10: Run the full test suite**

```bash
npm test
```

Expected: same pass count as before this change (no new failures — this is a pure string/config change with no logic touched).

- [ ] **Step 11: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 12: Manual browser check**

Start the dev server (`npm run dev`), open `/login`, confirm the browser tab title reads "Check Auto" and the page heading reads "Check Auto — Login".

- [ ] **Step 13: Commit**

```bash
git add README.md CLAUDE.md docs/ROADMAP.md docs/database-schema-v1.md package.json app/layout.tsx "app/login/page.tsx"
git commit -m "rename: Inspecta -> Check Auto across living docs and UI"
```
