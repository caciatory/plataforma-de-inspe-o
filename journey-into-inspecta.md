# Journey Into Inspecta

*A technical history of the Inspcta / bild app vehicle-inspection platform, reconstructed from claude-mem's persistent observation timeline, July 8–10, 2026.*

---

## 1. Project Genesis

The project begins, unglamorously, with a question about tooling. At **21:23 on July 8, 2026** (S1), the very first recorded interaction in the entire history is the user asking what Claude Code skills are available in their environment — not a line of code, not a schema, just a developer surveying the toolbox before picking anything up. Four minutes later (S2), the real work starts: the user pastes in a full PRD for a car-inspection app called **Inspcta**, and Claude produces a summary of the system's requirements and architecture. That single exchange is the entire genesis event — everything that follows for the next 48 hours traces back to it.

By 22:19 the same night (S3), the user has already escalated the ambition: they ask for a *formal* specification document with five sections — functional requirements, non-functional requirements, a permissions matrix, a data model, and a development roadmap. Claude delivers it as an artifact, and four minutes later (observation #1, 10:23 PM) that artifact is recorded as the **"Technical Specification Document (MVP) Created."** This is the founding technical decision of the project: before a single database table or line of application code exists, Inspcta has a structured spec with numbered functional requirements (RF-*) and non-functional requirements (RNF-*), a permissions matrix, and a phased roadmap. Everything built over the following two days — the schema, the migrations, the checklist data — traces its lineage back to this document and is judged against it.

The problem being solved, as it crystallizes over the next day, is a Portuguese-market **vehicle inspection SaaS** ("vistoria veicular"): field inspectors walk through a structured, multi-hundred-item checklist on a vehicle, submit findings with photo evidence, and the system produces certificates/reports that clients and used-car dealers ("stands") can consume — with different checklist scopes depending on whether the inspection is for a private buyer (particular) or a dealership (stand). This particular/stand distinction becomes one of the most consequential design threads in the whole timeline (see Section 3).

There is a full day of quiet between the spec's creation (Jul 8, 10:23 PM) and the next recorded activity (Jul 9, 6:25 PM) — the only such gap in the timeline. When work resumes, it opens not with more building but with **analysis of what had just been built**: a `/graphify` run over the technical spec (S4), beginning the project's habit of treating its own documentation as a first-class, machine-queryable artifact.

## 2. Architectural Evolution

Architecture in this project didn't evolve through code refactors so much as through **document refactors that later became schema refactors** — the PRD and technical spec were treated as the real source of truth, and the database was built to match them only at the very end. Four major structural shifts stand out.

**Shift 1 — From aspirational to disciplined scope (Jul 9, ~6:53–7:03 PM).** After the initial spec was drafted, the team ran a `/graphify` "technical debt review" directly against the PRD (S7) and then again with an explicit mandate to cut scope and keep the PRD and spec consistent (S8). This produced a dense fifteen-minute burst of scope-reduction observations (#20–#34): offline-first support was dropped in favor of online-only autosave (#21), audit logging was simplified to drop before/after value tracking (#22), a dedicated PDF rendering pipeline for reports was cut (#25), scoring values were hard-coded rather than made parametrizable (#26), a public certificate-lookup feature was removed (#27), and — architecturally most significant — the data model itself was refactored to **remove the CERTIFICATE table, merge the PHOTO tables, and simplify AUDIT_LOG_ENTRY** (#30). This is the first real pivot: the project moved from a maximalist, everything-configurable design to a lean MVP data model, all before a single migration file existed.

**Shift 2 — Choosing the persistence layer (Jul 9, 7:13 PM, #35).** A discrete architectural decision (type `⚖`) fixes the stack: **Postgres via Supabase**, with a **6-migration schema plan**. This one observation anchors everything that happens in the second half of the timeline — the SDD (subagent-driven-development) execution against Supabase migrations two days later is a direct descendant of this decision.

**Shift 3 — The particular/stand filtering redesign (Jul 9, 8:28–8:40 PM, observations #73–#102).** This is the single largest architectural pivot in the project, and it happened *after* raw checklist data forced a confrontation with an assumption baked into the schema. Originally, the design used **group-level** filtering — entire checklist groups were flagged `somente_particular` (particular-only) or applicable to stand inspections. When the real checklist CSV was cleaned and inspected, it became clear the "Teste de Condução" (driving test) group needed to be removed entirely, and — more importantly — that particular vs. stand applicability wasn't a group-level property at all: individual items within a group could differ (#74 shows the particular/stand columns had actually degraded into pure *phase* markers, not applicability flags). The fix was to introduce a new **item-level** `aplica_stand` column (#76–#78) and propagate that change through *everything*: the database schema doc (#85), the migration plan's SQL (#87), the migration test (#88), the PRD's objective section (#90), its user journey (#91), its scope section (#92), its open-issues list (#94), and the README (#97–#101). Roughly thirty observations in under twenty minutes are consumed purely by cascading one filtering-granularity decision through five documents — a textbook demonstration of how much "invisible" work a single schema-shape decision generates once you have to keep multiple documents internally consistent.

**Shift 4 — Deferred security surfaces reclaimed late (Jul 10, 5:42–5:50 PM, observations #291–#320, "Task 7").** After the six planned migrations were live, a whole-branch review surfaced that no indexes existed on `checklist_item_responses` (#291) and that views were not using `security_invoker` (#294) — Row Level Security had been explicitly deferred earlier in the schema plan (#294 marks this as a conscious decision, not an oversight). Rather than let this debt sit, the team added a **seventh migration** (`00007_security_invoker_fix.sql`) mid-review, wrote a dedicated test for it, applied it to the live remote database, and folded it into the plan document. This is architecture responding to its own audit in real time rather than being deferred to a "Phase 2."

## 3. Key Breakthroughs

Several observations mark genuine tone-shifts from investigation to resolution:

- **#38 (7:23 PM Jul 9) — "Generated Interactive Database Schema Visualization for Inspecta."** After a rough visual-design pass (#37, "Schema Diagram Card Visual Design Refactored"), this is the moment the schema stops being prose and becomes something the team can *see*. It's immediately followed by a rendering problem (S12: the interactive HTML wouldn't load reliably) resolved pragmatically by shipping a Markdown fallback (#39) — a small but telling breakthrough-with-caveat pattern that recurs throughout the project.
- **#65 (8:24 PM Jul 9) — "Vehicle Inspection Checklist Data Added."** This is the highest-discovery-cost observation in the entire timeline (16,245 tokens) — the moment real INSPECTA PORTUGAL checklist data (13 categories, ~300 items, paint-thickness thresholds, dual-inspector consensus marks) entered the project. Everything downstream — the Teste de Condução removal, the aplica_stand redesign, the "285 items / 11 groups" correction propagated through the PRD and README — flows from this single data-ingestion event. Before it, the checklist was a specification abstraction; after it, it was ground truth the specification had to catch up to.
- **#69 ("CSV Parsing and Contextual Character Recovery Implemented")** — the resolution beat of a three-observation encoding saga (#66 discovery → #67 partial fix → #68 "Encoding Corruption is Irreversible" acceptance → #69 recovery via contextual inference). This is a rare case of the team explicitly declaring a dead end (irreversible character loss) and then still finding a usable path forward through contextual character recovery rather than blocking on it.
- **#109 (12:11 AM Jul 10) — "Supabase CLI successfully re-authenticated to correct account."** The resolution of the Supabase account mix-up (see Section 6) — the moment infrastructure friction stopped being the bottleneck and real migration work could begin.
- **#129/#133 (12:19–12:20 AM Jul 10) — Task 1 migration applied and its report filed.** The first real schema hits the live remote Supabase database. This is the moment the project stops being documentation and becomes a running system.
- **#241 (23:53, "LIVE DATABASE SCHEMA NOW CORRECTED — RNF-11 ENFORCED")** — the payoff of the RNF-11 cascade-delete saga (Section 6): the audit-log immutability guarantee finally holds at the database level, not just nominally.
- **#316 (5:50 PM Jul 10, "Final verification: Task 7 fixes confirmed live in hosted database")** — the closing breakthrough of the whole timeline: independently-reviewed, security-hardened schema, confirmed live, seven migrations deep.

## 4. Work Patterns

The rhythm of this project is unusually legible because claude-mem logs almost every micro-step. Four distinct modes recur:

**Exploration/discovery bursts.** The `/graphify` runs (Jul 9, 6:25–6:35 PM, observations #2–#17; again 7:27–7:52 PM, #41–#62; again Jul 10, 6:19 PM+) are dense sequences of `○ discovery` events with almost no `✓ change` events interleaved — pure investigation. The second graphify pass over the full checklist and schema documentation (#41–#62) runs for over twenty minutes and produces community-detection results, graph diffs, and cross-domain insight reports without touching a single source file until the very end.

**Feature/documentation sprints.** The scope-cut cascade (#20–#34) and the particular/stand redesign (#73–#102) are the clearest examples: dozens of `✓ change` observations in rapid succession, each touching one document, chained tightly enough that the whole sprint reads almost like a single logical transaction spread across many small commits' worth of edits.

**Debugging cycles.** The SDD execution phase (Jul 10, 12:12 AM–1:06 AM and again 5:42–5:51 PM) is dominated by `● bugfix` observations — 116 of the 320 total observations in the project carry the `bugfix` type, more than a third of everything ever recorded. Tasks 2, 3, and 4 each generated their own tight investigate → diagnose → fix → re-verify loop (see Section 6), and the sheer density of bugfix-typed observations between IDs ~140 and ~290 shows this wasn't one clean pass through six migrations — it was six migrations fought for, one constraint and one type cast at a time.

**Refactoring without new features.** The database-schema-doc alignment pass late on Jul 9 (#84–#89, correcting `somente_particular` references across the schema doc, migration plan, and migration test) and the RNF-11 master-plan correction (#232–#239) are refactors in the purest sense: no new capability was added, existing specifications were made internally consistent and correct.

A meta-pattern worth naming: **almost every burst of rapid feature/documentation work is followed, within the same session, by a slower consistency-repair pass.** The team rarely let scope changes sit un-propagated for long — the aplica_stand change alone touched five separate documents within about twelve minutes of the design decision being made.

## 5. Technical Debt

Debt in this project was mostly **explicitly named at creation time**, which made it easy to track and pay down later — a notable discipline given the pace.

- **Offline-first support, dedicated PDF pipeline, parametrizable scoring, public certificate lookup** — all cut during the Jul 9 technical-debt review (#20–#29) and recorded as deliberate simplifications, not oversights. None of these resurface as problems later in the timeline, suggesting the cuts were well-judged.
- **Row Level Security** — explicitly deferred from the original 6-migration schema plan (#294: "Row Level Security policies explicitly deferred from database schema plan"). This is debt that was *knowingly* taken on, tracked in the plan document, and then paid back the same day via Task 7's `security_invoker` fix once a whole-branch review flagged it (#295–#320). This is the cleanest debt lifecycle in the project: named, deferred with a marker, then resolved before the project's first external milestone.
- **Missing indexes on `checklist_item_responses`** (#291) — surfaced and fixed in the same Task 7 pass (folded into the admin-list search/filter/sort index work of Task 6/#276's trigram index, and the general index audit of #291–#303).
- **Stale documentation drift** — repeatedly caught late: the README referencing "300+ items, 12 groups, RF-01–62" after the checklist and RF count had moved on (#96), the roadmap saying "12 grupos" when it should say "11" (#80), the database schema doc still citing the removed `somente_particular` column after the redesign (#84, #86). None of these were catastrophic, but their recurrence — three to four separate instances of "doc X hasn't caught up with decision Y" — is itself a pattern: multi-document specifications accumulate drift fast, and this team's answer was disciplined but *manual* cross-document reconciliation passes rather than a single source of truth.
- **The stashed Task 7 plan edits (#306–#313)** — arguably the closest this project came to *losing* work. Plan-document edits made live during Task 7 execution ended up only in git stash rather than committed, discovered during a whole-branch review (#306–#309), and recovered cleanly (#310–#312: "105 insertions... stash popped: plan document restored with all fixes and Task 7 content"). This wasn't debt so much as a near-miss, but it's grouped here because it shares the shape: something real happened, wasn't properly durable, and had to be reconciled before the project could be called done.

## 6. Challenges and Debugging Sagas

Three sagas dominate the harder half of the timeline, all clustered in the Supabase migration execution phase (Jul 10, roughly 12:04 AM–1:06 AM, then continuing 5:42–5:51 PM).

### The Supabase account mix-up
At 12:04 AM (S26) the user supplied a Supabase connection string, but Claude immediately flagged password-format ambiguity. Three minutes later (S27) a CLI authentication failure was traced to a deeper problem: **the Supabase CLI was logged into the wrong account entirely** — not a credentials typo, but a genuinely different Supabase identity than the one that owned the Inspecta project. The CLI briefly surfaced a project called `car-inspection` with a suspiciously matching name (S28), raising a real "is this an old attempt or someone else's project?" moment of confusion. It was resolved cleanly by generating a Personal Access Token from the *correct* account and re-authenticating explicitly (#108–#109), landing on the right project (`rahbqhpvzmiwbddydowh`) by 12:11 AM. Total elapsed time from "connection string supplied" to "correctly authenticated": about seven minutes — fast for what could have been a very confusing dead end if the near-miss with `car-inspection` hadn't been caught and questioned before proceeding.

### The three SQL bugs of Tasks 2, 3, and 4
The SDD (subagent-driven-development) execution of the six-migration schema plan is the technical core of the project, and it surfaced three distinct, real SQL defects — each one caught not by inspection but by **the test suite the plan itself mandated**, and each one traced back to the *plan document*, not the implementer:

1. **Task 2 — NULL-logic constraint bug (#146).** The `qtd_pontos_medicao_valido` CHECK constraint was supposed to block inserting a `medicao`-type checklist item without a valid point count (3–5), but PostgreSQL's NULL-comparison semantics let a NULL value slip through silently — the check `tipo <> 'medicao' or qtd_pontos_medicao between 3 and 5` evaluates to unknown/true when the right side involves NULL. The test caught it (#146), the fix was made both in the plan file and the live database directly via `ALTER TABLE` (#151–#155), and Task 2 was upgraded from BLOCKED to COMPLETE (#158).
2. **Task 3 — Enum type-casting bug (#168, detailed further at #176–#177).** A generated `status` column typed as the `item_status` enum was fed a `CASE` expression returning uncast text literals — PostgreSQL error 42804. The implementer, per protocol, stopped and escalated rather than improvising a fix (#168 explicitly praises this behavior). The plan was corrected with explicit `::item_status` casts (#171–#173), but then a **second-order bug** appeared: the corrected migration file wasn't actually persisted to disk (#174–#175, "fix was not persisted") — a file-write silently failing to take effect, which had to be diagnosed and re-applied before Task 3 could pass (#176–#177).
3. **Task 4 — RNF-11 cascade-delete design flaw (#230, #234).** This is the most architecturally interesting of the three because it wasn't a syntax bug at all — the implementation was a "100% verbatim match to brief," but an *independent reviewer* (a second Sonnet pass distinct from the implementer) noticed that `audit_log_entries.inspection_id` carried `on delete cascade`, which meant deleting a parent inspection would silently cascade-delete its audit trail — completely undermining RNF-11's insert-only/immutability guarantee, even though the REVOKE-based guard (blocking direct UPDATE/DELETE) worked exactly as designed. The self-review report had even falsely claimed an "insert-only test" existed when the test file only checked the CHECK constraint. The fix removed the cascade, added an explicit test that parent deletion is *blocked* when child audit entries exist, and the live database was corrected in place (#240–#242). This is a genuine "the spec itself was wrong" moment, caught by review discipline rather than by a failing test — the most subtle of the three defects, and the only one where the AI reviewer's read of *intent* (what RNF-11 actually promises) mattered more than syntax.

Layered on top of these was a recurring, almost mundane infrastructure gremlin: **migration files reporting a successful write but not actually landing on disk** — first hit in Task 3 territory and then again nearly identically in Task 4 (#192–#193: "Task 4 migration file write persistence check FAILED... identical to the Task 3 file persistence issue"), each time requiring a bash heredoc write to force persistence and a subsequent Supabase migration-ledger repair (#213–#215) when the CLI's tracking table fell out of sync with what was actually applied.

### The stashed-plan-document scare
Covered above in Section 5, but worth restating here as a debugging saga in its own right: a whole-branch review at 5:47 PM on Jul 10 discovered the plan document on disk didn't match what should have existed after Task 7 (#306–#308), traced it to an uncommitted git stash (#309), and recovered 105 insertions cleanly (#310–#312) before the final commit (#313, SHA `4609fe7`) — which explicitly documents, in its own commit message, "these edits were made during task execution but recovered from stash after local file reversion." The project's own commit history now contains a permanent, honest record of this near-miss.

## 7. Memory and Continuity

This project is a strong case study for the value of session-boundary continuity, precisely because the SDD execution phase spans two widely separated blocks of time — a burst from roughly 12:12 AM to 1:06 AM on Jul 10 covering Tasks 1–4, then a gap of over sixteen hours before the timeline resumes at 5:42 PM the same day to finish with "Task 7" (the security/index hardening pass) and a whole-branch review. The 5:42 PM session (S32/S33) opens not by re-deriving the state of the six migrations from scratch but by directly querying live database state ("No indexes on checklist_item_responses table," #291; "checklist_item_responses table schema and relationships," #292) and cross-referencing against the plan document — behavior consistent with a session that already knew Tasks 1–6 existed and needed to verify/audit them rather than rediscover them.

The graphify knowledge-graph work is the clearest deliberate use of memory-as-infrastructure in the project. Three separate graphify passes were run over the growing documentation set (Jul 9 6:25 PM, Jul 9 7:27–7:52 PM, and Jul 10 6:19 PM), and the final pass explicitly reused cumulative cost tracking across all three runs ("120k input / 45k output this run; 250k / 79.5k cumulative over 3 runs," observation attached to S34) — the project's own tooling was tracking its own token economics as a first-class concern well before this report was requested.

The clearest single instance of continuity *preventing* repeated mistakes is the RNF-11 fix propagating forward through the plan document (#234: "Future Task 4 implementations will inherit the corrected specification") — a deliberate design choice to fix the defect at the specification layer, not just the one generated artifact, specifically so that memory of the bug wouldn't need to be re-discovered if Task 4 were ever regenerated.

## 8. Token Economics & Memory ROI

Queried directly from `~/.claude-mem/claude-mem.db` (project = `bild app`):

| Metric | Value |
|---|---|
| Total observations | 320 |
| Total discovery_tokens (original cost of all work) | **922,253** |
| Distinct sessions | 2 (1 solo scoping session Jul 8, then one long continuous working session spanning Jul 9–10) |
| Sessions with context injection available (sessions after the first) | 1 |
| Avg discovery_tokens per observation | 2,882.0 |
| Avg "read" cost per observation (title+subtitle+narrative+facts, ÷4 chars/token) | 268.2 |
| **Compression ratio** (discovery ÷ read) | **≈ 10.7×** — each observation, once captured, is recallable at roughly 1/11th the token cost of the work that produced it |

**Monthly breakdown** (the entire project falls inside a single calendar month):

| Month | Observations | Total discovery_tokens | Sessions |
|---|---|---|---|
| 2026-07 | 320 | 922,253 | 2 |

Because the whole history fits in one 48-hour window, a monthly view is degenerate by construction — the more meaningful cut is per-day:

| Day | Observations | Note |
|---|---|---|
| Jul 8 | 1 | PRD conversation, initial spec |
| Jul 9 | 268 | Scope cuts, schema design, graphify passes, checklist ingestion, particular/stand redesign |
| Jul 10 | 51 | Supabase auth, 7-migration SDD execution, whole-branch review |

**Top 5 most expensive observations by discovery_tokens:**

| ID | Title | discovery_tokens |
|---|---|---|
| 65 | Vehicle Inspection Checklist Data Added | 16,245 |
| 234 | Master plan amended to fix RNF-11 design flaw — cascade-delete removed, test added | 13,198 |
| 38 | Generated Interactive Database Schema Visualization for Inspecta | 12,594 |
| 7 | Technical Specification Knowledge Graph Extracted via /graphify | 11,817 |
| 36 | Database Schema Visualization Generated via /graphify | 11,755 |

(Honorable mentions just outside the top 5: #54 "Graph health diagnostic confirmed zero structural defects" and #55 "Manual knowledge graph extraction script created," both 11,567 tokens — the graphify pipeline alone accounts for four of the ten most expensive observations in the project.)

**Explicit recall events**: querying for narrative text containing "recalled," "from memory," or "previous session" returns **zero** matches. This project's memory usage was almost entirely *passive* (context injection at session start) rather than *active* (the agent explicitly invoking search/timeline tools mid-task and narrating the recall) — consistent with a project young enough (48 hours old, 2 sessions) that there wasn't yet a large back-catalog requiring deliberate archaeology. The compounding value of claude-mem here shows up structurally (the Jul 10 5:42 PM session picking up seamlessly where the 1:06 AM session left off, sixteen hours earlier) rather than in explicit "let me search for how we did this before" moments.

**Estimating savings** (per the requested methodology):
- *Passive recall savings*: 1 session-after-the-first × (50-observation window × avg 2,882 discovery_tokens/obs) × 0.30 relevance factor ≈ 1 × 144,100 × 0.30 ≈ **43,230 tokens** saved passively by the one session that had prior context available.
- *Explicit recall savings*: 0 identified explicit recall events × ~10,000 tokens ≈ **0 tokens** (no explicit search-and-recall pattern detected in narrative text).
- *Total estimated savings*: ≈ **43,230 tokens**.
- *Total read_tokens invested* (sum of the read-cost proxy across all 320 observations): ≈ **85,833 tokens** (320 × avg 268.2).
- **Net ROI = total_savings / total_read_tokens_invested ≈ 43,230 / 85,833 ≈ 0.50×.**

Read against the raw discovery-vs-read compression ratio (10.7×), this net-ROI figure looks modest, and that's an honest reflection of the project's youth: with only one session boundary crossed so far, there's been exactly one opportunity to cash in the compression the memory system has been quietly building. The 922K tokens of discovery work captured so far are a **banked asset** — each future session of this project effectively starts with an 11×-compressed shortcut through everything documented above, and the ROI curve should climb sharply as more sessions accumulate and draw on this history rather than re-deriving it.

## 9. Timeline Statistics

- **Date range**: July 8, 2026, 9:23 PM UTC → July 10, 2026, 4:50 PM UTC (≈ 43.5 hours elapsed, genesis to live 7-migration database)
- **Total observations**: 320
- **Total sessions**: 2
  - Session 1 (Jul 8, 9:23 PM): 1 observation — the initial "skills available?" query
  - Session 2 (Jul 9, 5:25 PM → Jul 10, 4:50 PM): 319 observations — everything else
- **Observation type breakdown**:
  | Type | Count | Share |
  |---|---|---|
  | bugfix | 116 | 36.3% |
  | discovery | 93 | 29.1% |
  | change | 91 | 28.4% |
  | feature | 9 | 2.8% |
  | refactor | 6 | 1.9% |
  | decision | 5 | 1.6% |
- **Most active day**: Jul 9, 2026, with 268 observations — the day the PRD/spec were scope-cut, the checklist data was ingested and cleaned, the particular/stand redesign cascaded through five documents, and three separate graphify passes ran.
- **Longest continuous working stretch**: the SDD execution block from ~12:12 AM to ~1:06 AM on Jul 10 (Tasks 1–4, roughly 180 observations in under an hour) is the single densest sequence in the project — driven almost entirely by the bugfix-heavy Task 2/3/4 debugging sagas described in Section 6.
- **Session boundary gap**: ~16 hours between the Task 4 completion cluster (ending ~1:06 AM Jul 10) and the Task 7/whole-branch-review resumption (starting 5:42 PM Jul 10) — the only major pause inside the otherwise-continuous second session.

## 10. Lessons and Meta-Observations

A developer picking up this codebase cold, reading only the timeline, would learn several things fast.

**First, documentation is load-bearing here, not decorative.** The PRD, the technical spec (with numbered RF/RNF requirements), the database schema plan, and the README are treated as the actual contract the code must satisfy — evidenced by how often a schema or checklist change triggered an immediate, explicit sweep through four or five documents to keep them consistent (Section 2, Shift 3). A new contributor should expect that changing the data model means editing the schema doc, the migration plan, the PRD's scope section, and the README's status section in the same sitting — the team's own workflow makes this the norm, not an afterthought.

**Second, the test-first discipline on migrations paid for itself three times over.** Every one of the three real SQL bugs in Tasks 2–4 was caught by a test file written *before* or *alongside* the migration, as mandated by the subagent-driven-development plan — not by manual inspection, not by luck. A developer extending this schema should treat the `*.test.sql` files next to each migration as load-bearing guardrails, not optional scaffolding, given the track record.

**Third, independent review caught what self-review missed.** The RNF-11 cascade-delete flaw (Section 6) is the standout example: the implementer matched the brief perfectly, the self-generated report even claimed a test existed that didn't, and it took a *second*, independent reviewing pass to catch that the specification itself — not the implementation — was flawed. The project's use of a distinct "reviewer subagent" step (baked into the subagent-driven-development skill, referenced repeatedly as "review package generated... ready for reviewer subagent") is not ceremony; it demonstrably found a real bug that pure implementation fidelity could not.

**Fourth, real data breaks abstractions, and that's expected here.** The particular/stand redesign (Section 2, Shift 3) happened because raw checklist data forced a confrontation with a filtering-granularity assumption nobody had tested against reality until the CSV existed. The project's response — cut the offending group (Teste de Condução), redesign the filtering to item-level, and propagate the change everywhere within the same session — is the template this team seems to reach for whenever assumption meets evidence: fix fast, fix everywhere, document why.

**Fifth, infrastructure friction (wrong Supabase account, silently-unpersisted file writes, a migration ledger falling out of sync with reality) was real and repeated**, but never allowed to become a multi-day blocker — each instance was diagnosed and resolved within the same session it appeared in, generally within twenty minutes. A new developer inheriting this project's Supabase setup should know the CLI has, at least once, silently authenticated to the wrong account, and that migration file writes have, at least twice, silently failed to persist — both worth a health-check before trusting either blindly.

**Sixth, and finally**: this is a project that used its own tooling reflexively — `/graphify` to understand its own specification documents, cost-tracking across cumulative graphify runs, a `.graphifyignore` committed to exclude scratch directories, and now, this very report, generated from the memory system the project itself accumulated. The habit of treating documentation, decisions, and even token costs as first-class, queryable artifacts — rather than as ephemeral chat exhaust — is arguably the single most distinctive trait of how Inspecta was built, and it's the reason a 48-hour-old project already has a timeline detailed enough to write 6,000 words about.

---

*Report compiled from 320 observations across 2 sessions (Jul 8–10, 2026) recorded in claude-mem for project `bild app`.*
