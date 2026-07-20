# Roadmap — Inspecta v1.0

Atualizado: 2026-07-20. Baseado em `docs/especificacao-tecnica-v1.md` §5 (9 fases) e no estado real do código (branches, migrations) nesta data.

Cada passo abaixo é uma unidade fechada: você cola o prompt sugerido, o processo documentado em `docs/PROCESSO.md` (`brainstorming` → `writing-plans` → `subagent-driven-development`) roda até o fim, e o passo só é considerado pronto quando passar pelas 3 skills de fechamento (seção final deste doc). Só então vá para o próximo prompt da lista.

**Regra deste documento:** ao final de cada fase concluída, este roadmap é atualizado com um resumo simples do que foi feito (seção "Progresso" abaixo) e, se algo descoberto durante a task justificar, uma nova fase é sugerida/inserida na lista.

## Progresso

- **Passo 0.1 — concluído (2026-07-19).** `worktree-fase1a-dados-basicos` (RF-01 login, RF-02–06 dados básicos) revisado via `requesting-code-review` (sem issues Critical; 1 Important — erros de RPC/query descartados sem log — corrigido antes do merge), mesclado em `main` via `finishing-a-development-branch`, worktree removido, branch local apagado. `main` agora tem código de app pela primeira vez. **Descoberta durante a task:** arquivos `._*` (AppleDouble, gerados pelo Finder/macOS neste volume externo KINGSTON) são pegos pelo glob de teste do Vitest e quebram a suíte com erros de parse falsos — não é regressão do merge, é um problema de ambiente que vai se repetir em toda fase futura que rodar `npm test`. Ver Passo 0.4 (novo, sugerido) abaixo.
- **Passo 0.2 — concluído (2026-07-19).** `worktree-fase2-preenchimento-item` **não era redundante como o roadmap supunha** — suas migrations (00011–00014) já estavam em `main`, mas os 4 arquivos de teste SQL e o doc do plano (`docs/superpowers/plans/2026-07-11-fase2-preenchimento-item.md`) nunca tinham sido trazidos. Copiados para `main`. **Descoberta durante a task:** os 4 testes falhavam contra a DB real (`duplicate key value violates unique constraint checklist_group_templates_ordem_key`) — os fixtures usavam `ordem = 1` pra um grupo sintético, e esse valor colidiu com o grupo real "Identificação" semeado pela migration `00016`. Corrigido bumpando `ordem` pra 901–904, seguindo a convenção que o teste da migration `00015` já usa (`ordem >= 900` pra fixtures). Todos os 23 asserts passam contra a DB real após a correção. Branch e worktree encerrados.
- **Passo 0.3 — concluído (2026-07-19).** `README.md` e `docs/database-schema-v1.md` sincronizados com o estado real: código de app existe (Fase 1a), RLS está implementada nas 12 tabelas (não 11), colunas `ativo`/`observacoes` e as invariantes de `paint_measurements`/`checklist_item_responses` das migrations 00011–00016 documentadas, planos que existiam mas não estavam listados (RLS, fase1a, fase2, checklist-seed) adicionados à tabela de docs do README.
- **Passo 0.4 — concluído (2026-07-19).** `**/._*` adicionado ao `exclude` do `vitest.config.ts`. `npm test` volta a rodar limpo: 6 arquivos, 22 testes, zero suítes fantasma.
- **Fase 1 (restante) — concluída e mesclada (2026-07-20).** RF-09 a RF-12 (navegação do checklist: painel de grupo, indicadores de progresso, redirect pro primeiro grupo ativo, link do resumo da inspeção). Verificado ponta a ponta no navegador com conta de teste (`teste@checkauto.pt`). Revisada via `requesting-code-review` (0 Critical, 0 Important) e `ponytail-review` (nenhum achado — "Lean already"). 37/37 testes passando. Mesclada via PR #3.
- **Validade da inspeção — concluída e mesclada (2026-07-20).** Feature ad-hoc (não é uma das 9 fases originais; é trabalho preparatório pra Fase 5 — RF-57–61, lista de inspeções do admin) desenhada via `brainstorming` → `writing-plans` → `subagent-driven-development`: coluna `vehicle_data.quilometragem`, função pura `computeInspectionValidity` (validade de 6 meses + limite de 100km), campo obrigatório no formulário, selo de validade na página de detalhe. Revisada via `requesting-code-review` — achou e corrigiu 1 bug Important (overflow de `setMonth` em fim de mês, ex. 31/ago virava 03/mar em vez de 28/fev) e 1 Minor (doc de schema desatualizada). 33/33 testes passando. Mesclada via PR #2. Doc: `docs/superpowers/specs/2026-07-19-validade-inspecao-design.md`.
- **Ambiente — projeto movido pro Desktop (2026-07-20).** Disco externo KINGSTON caiu/remontou repetidamente durante a sessão (uma vez no meio de um `git worktree remove`, corrompendo um worktree). Cópia de trabalho movida pra `~/Desktop/bild app` (SSD interno); KINGSTON mantido como backup, não é mais o diretório ativo.
- **Fase 2 (UI) — design aprovado (2026-07-20).** RF-13 a RF-22, design em `docs/superpowers/specs/2026-07-20-preenchimento-item-design.md`. Gap descoberto e resolvido no design: não existia bucket de Storage pra fotos em nenhuma migration. "Aplicar aos demais" em itens repetidos foi deliberadamente separado como Fase 2.5, pra não bloquear o preenchimento básico. Próximo passo: `writing-plans`.

## Estado atual

Todo o bloco 0 (housekeeping) está concluído — ver seção Progresso acima. `main` tem: 19 migrations (inclui `quilometragem`), RLS nas 12 tabelas, checklist seedado (320 itens/12 grupos), código de app da Fase 1a (login + dados básicos) e Fase 1 (navegação do checklist, PR #3 mesclada), validade da inspeção (PR #2 mesclada), `npm test` limpo (inclui exclusão de `.claude/worktrees/**` da descoberta de testes), docs sincronizados. Nenhum worktree aberto. Diretório de trabalho agora é `~/Desktop/bild app` (KINGSTON mantido só como backup). **Próxima unidade de trabalho real: Fase 2 (UI de preenchimento de item)** — design aprovado em `docs/superpowers/specs/2026-07-20-preenchimento-item-design.md`, falta `writing-plans`.

---

## Passo 0.1 — Integrar o único branch com app code ✅ concluído

**Prompt:**
> Pronto pra integrar o branch `worktree-fase1a-dados-basicos` (RF-01 login, RF-02–06 dados básicos) no main. Se ainda não foi revisado, use `superpowers:requesting-code-review` primeiro; depois `superpowers:finishing-a-development-branch` pra decidir o caminho de merge.

**Pronto quando:** branch integrado (merge ou PR mesclado) e `main` passa a ter código de app.

## Passo 0.2 — Encerrar branch obsoleto ✅ concluído

**Prompt:**
> As migrations 00011–00014 do branch `worktree-fase2-preenchimento-item` já estão em `main`. Verifique se esse branch tem algo além disso (testes, doc do plano) que ainda não foi trazido; se não tiver, feche/apague o branch.

**Pronto quando:** branch fechado ou confirmado como redundante.

## Passo 0.3 — Sincronizar docs desatualizados (rápido, opcional mas recomendado) ✅ concluído

**Prompt:**
> `docs/README.md` e `docs/database-schema-v1.md` estão desatualizados — dizem que não há código de app nem RLS, e ambos já existem. Atualize os dois pra refletir o estado real.

**Pronto quando:** os dois arquivos batem com a realidade do código.

## Passo 0.4 — Excluir arquivos `._*` da descoberta de testes do Vitest ✅ concluído

Descoberto ao rodar os testes pós-merge do Passo 0.1: este volume (KINGSTON, externo) gera sidecar files `._*` (AppleDouble) pra todo arquivo, inclusive `.test.ts`/`.test.tsx`. O Vitest tenta parsear `._algumacoisa.test.tsx` como teste e falha com erro de parse — 6 suítes fantasma na última rodada, nenhuma delas real. Vai continuar acontecendo em toda fase futura até isso ser excluído no `vitest.config.ts`.

**Prompt:**
> Os arquivos `._*` (AppleDouble, macOS) estão sendo pegos pela descoberta de testes do Vitest e gerando suítes fantasma com erro de parse. Adicione `**/._*` ao `exclude` de `vitest.config.ts` e confirme que `npm test` fica limpo.

**Pronto quando:** `npm test` roda sem nenhuma suíte `._*` aparecendo.

---

## Fase 1 (restante) — Navegação do checklist ✅ concluída (2026-07-20)

RF-09 a RF-12: lista de grupos, indicadores de progresso.

Implementado, verificado no navegador, revisado (code review + ponytail-review), mesclado em `main` via PR #3.

## Fase 2 (UI) — Preenchimento de item ⏳ design aprovado, plano de implementação a seguir

RF-13 a RF-22. DB layer já pronta em `main`: contagem de pontos, `resultado_calculado` gerado, trigger que exige foto quando resultado é "ruim", policy de DELETE de foto. Design: `docs/superpowers/specs/2026-07-20-preenchimento-item-design.md`. Inclui gap novo descoberto e resolvido no design: bucket de Storage pra fotos não existia em nenhuma migration.

**Prompt:**
> Segue `superpowers:writing-plans` a partir de `docs/superpowers/specs/2026-07-20-preenchimento-item-design.md`.

## Fase 2.5 — "Aplicar aos demais" em itens repetidos

Resolve a pendência de `docs/especificacao-tecnica-v1.md` §6 ("comportamento exato de 'aplicar aos demais' — a definir na Fase 1/2"), deliberadamente adiada da Fase 2 pra não bloquear o preenchimento básico de item. Mecanismo já definido no design da Fase 2 (§6): copia classificação + observação, não copia foto, técnico edita individualmente depois. Falta: coluna `grupo_replicacao` (ou nome similar) em `checklist_item_templates`, curadoria manual dos ~285 itens (amostra de clusters já levantada: pneus, jantes, vidros, faróis, espelhos, portas, para-choques, bancos, cintos — ver sessão de 2026-07-20), e a UI de aplicar-a-todos-com-override.

**Prompt:**
> Vamos desenhar o "aplicar aos demais" em itens repetidos (pneus, vidros, bancos, etc.), sobre o preenchimento de item que já está em `main`. Use `superpowers:brainstorming` — o mecanismo já foi definido no design da Fase 2 (§6), falta só a curadoria da coluna de agrupamento e a UI.

## Fase 3 — Autosave online

RF-25 a RF-27, RNF-22.

**Prompt:**
> Vamos desenhar o autosave online (RF-25 a RF-27, RNF-22). Use `superpowers:brainstorming`.

## Fase 4 — Pontuação

RF-38 a RF-42, RNF-18–19. **Bloqueio:** valores exatos de pontuação e cortes A/B/C ainda não estão definidos na especificação (§6).

**Prompt:**
> Vamos desenhar a pontuação (RF-38 a RF-42). Antes de entrar em detalhe técnico, me pergunte especificamente os valores de corte A/B/C e a fórmula de pontuação — ainda não estão fechados. Use `superpowers:brainstorming`.

## Fase 5 — Revisão do admin

RF-31 a RF-37, RF-57 a RF-62. Tabelas `review_events`, `audit_log_entries` e índices de listagem já existem em `main`; falta a camada de app.

**Prompt:**
> Vamos construir a revisão do admin (RF-31 a RF-37, RF-57 a RF-62) sobre as tabelas que já existem em `main`. Use `superpowers:brainstorming`.

## Fase 6 — Relatório final

RF-43 a RF-53, RNF-13.

**Prompt:**
> Vamos desenhar o relatório final (RF-43 a RF-53). Use `superpowers:brainstorming`.

## Fase 7 — Acesso do cliente

RF-54 a RF-56. Tabela `client_access_logs` existe mas **sem nenhuma RLS policy** ainda.

**Prompt:**
> Vamos desenhar o acesso do cliente (RF-54 a RF-56), incluindo as RLS policies de `client_access_logs` que ainda não existem. Use `superpowers:brainstorming` e considere `docs/superpowers/plans/2026-07-10-inspecta-rls-policies.md` como referência de como desenhamos RLS antes.

## Fase 8 — Hardening & QA

RNFs restantes (performance, segurança, edge cases).

**Prompt:**
> Vamos levantar o escopo de hardening final (RNFs restantes). Use `superpowers:brainstorming` pra mapear o escopo; qualquer bug que aparecer no meio do processo usa `superpowers:systematic-debugging` antes de qualquer fix.

## Fase 9 — Motorização especial (futura)

Backlog, condicionada à compra de hardware (BEV/HEV/GPL). Conteúdo já está semeado no banco (grupo 12, `ativo=false`). **Não iniciar** sem sinal explícito do negócio — fora do roadmap de v1.0.

---

## Regra de transição entre passos (o que mantém o processo seguro)

Ao final de cada fase, depois que `subagent-driven-development` terminar todas as tasks:

1. `superpowers:requesting-code-review` no branch inteiro — sempre.
2. `ponytail:ponytail-review` — só se a fase adicionou código/abstração nova (pula em passos de housekeeping/docs).
3. `security-review` — só se a fase tocar auth, RLS ou controle de acesso (ex.: Fase 5 admin, Fase 7 acesso do cliente).
4. `verify` — só se a fase tiver UI (dirige a feature de ponta a ponta no navegador, não só testes/typecheck).
5. `superpowers:verification-before-completion` antes de qualquer alegação de "pronto" — sempre.
6. `superpowers:finishing-a-development-branch` pra decidir merge/PR — sempre.

Só depois disso cole o prompt da próxima fase da lista.

**Decisão registrada (2026-07-19):** avaliamos incluir `graphify` e `claude-mem` no gate e descartamos — `claude-mem` já observa passivamente via hooks, não precisa virar passo explícito; `graphify-out/` está parado desde 11/07 e revivê-lo como manutenção obrigatória seria YAGNI. `ponytail-audit`/`ponytail-debt` também ficaram de fora do gate por fase — cadência certa pra eles é periódica (ex.: uma vez antes da Fase 8/hardening), não repetida a cada fase.
