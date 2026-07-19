# Roadmap — Inspecta v1.0

Atualizado: 2026-07-19. Baseado em `docs/especificacao-tecnica-v1.md` §5 (9 fases) e no estado real do código (branches, migrations) nesta data.

Cada passo abaixo é uma unidade fechada: você cola o prompt sugerido, o processo documentado em `docs/PROCESSO.md` (`brainstorming` → `writing-plans` → `subagent-driven-development`) roda até o fim, e o passo só é considerado pronto quando passar pelas 3 skills de fechamento (seção final deste doc). Só então vá para o próximo prompt da lista.

**Regra deste documento:** ao final de cada fase concluída, este roadmap é atualizado com um resumo simples do que foi feito (seção "Progresso" abaixo) e, se algo descoberto durante a task justificar, uma nova fase é sugerida/inserida na lista.

## Progresso

- **Passo 0.1 — concluído (2026-07-19).** `worktree-fase1a-dados-basicos` (RF-01 login, RF-02–06 dados básicos) revisado via `requesting-code-review` (sem issues Critical; 1 Important — erros de RPC/query descartados sem log — corrigido antes do merge), mesclado em `main` via `finishing-a-development-branch`, worktree removido, branch local apagado. `main` agora tem código de app pela primeira vez. **Descoberta durante a task:** arquivos `._*` (AppleDouble, gerados pelo Finder/macOS neste volume externo KINGSTON) são pegos pelo glob de teste do Vitest e quebram a suíte com erros de parse falsos — não é regressão do merge, é um problema de ambiente que vai se repetir em toda fase futura que rodar `npm test`. Ver Passo 0.4 (novo, sugerido) abaixo.
- **Passo 0.2 — concluído (2026-07-19).** `worktree-fase2-preenchimento-item` **não era redundante como o roadmap supunha** — suas migrations (00011–00014) já estavam em `main`, mas os 4 arquivos de teste SQL e o doc do plano (`docs/superpowers/plans/2026-07-11-fase2-preenchimento-item.md`) nunca tinham sido trazidos. Copiados para `main`. **Descoberta durante a task:** os 4 testes falhavam contra a DB real (`duplicate key value violates unique constraint checklist_group_templates_ordem_key`) — os fixtures usavam `ordem = 1` pra um grupo sintético, e esse valor colidiu com o grupo real "Identificação" semeado pela migration `00016`. Corrigido bumpando `ordem` pra 901–904, seguindo a convenção que o teste da migration `00015` já usa (`ordem >= 900` pra fixtures). Todos os 23 asserts passam contra a DB real após a correção. Branch e worktree encerrados.

## Estado atual (por que os passos 0.x vêm primeiro)

- `main` não tem código de app nenhum — só migrations (`00001`–`00018`) e docs. As RLS e a DB layer de RF-13–22 (migrations `00011`–`00014`) já estão em `main`.
- `worktree-fase1a-dados-basicos` é o **único** branch com app Next.js real (RF-01 login, RF-02–06 dados básicos) — não mesclado.
- `worktree-fase2-preenchimento-item` só tem DB (já duplicada em `main`) — branch está obsoleto.
- `docs/README.md` e `docs/database-schema-v1.md` estão desatualizados (dizem "sem código de app" / "sem RLS", ambos falsos hoje).

Sem mesclar o passo 0.1, nenhuma fase de UI seguinte tem onde pendurar código — por isso ele vem antes de tudo.

---

## Passo 0.1 — Integrar o único branch com app code ✅ concluído

**Prompt:**
> Pronto pra integrar o branch `worktree-fase1a-dados-basicos` (RF-01 login, RF-02–06 dados básicos) no main. Se ainda não foi revisado, use `superpowers:requesting-code-review` primeiro; depois `superpowers:finishing-a-development-branch` pra decidir o caminho de merge.

**Pronto quando:** branch integrado (merge ou PR mesclado) e `main` passa a ter código de app.

## Passo 0.2 — Encerrar branch obsoleto ✅ concluído

**Prompt:**
> As migrations 00011–00014 do branch `worktree-fase2-preenchimento-item` já estão em `main`. Verifique se esse branch tem algo além disso (testes, doc do plano) que ainda não foi trazido; se não tiver, feche/apague o branch.

**Pronto quando:** branch fechado ou confirmado como redundante.

## Passo 0.3 — Sincronizar docs desatualizados (rápido, opcional mas recomendado)

**Prompt:**
> `docs/README.md` e `docs/database-schema-v1.md` estão desatualizados — dizem que não há código de app nem RLS, e ambos já existem. Atualize os dois pra refletir o estado real.

**Pronto quando:** os dois arquivos batem com a realidade do código.

## Passo 0.4 (novo, sugerido) — Excluir arquivos `._*` da descoberta de testes do Vitest

Descoberto ao rodar os testes pós-merge do Passo 0.1: este volume (KINGSTON, externo) gera sidecar files `._*` (AppleDouble) pra todo arquivo, inclusive `.test.ts`/`.test.tsx`. O Vitest tenta parsear `._algumacoisa.test.tsx` como teste e falha com erro de parse — 6 suítes fantasma na última rodada, nenhuma delas real. Vai continuar acontecendo em toda fase futura até isso ser excluído no `vitest.config.ts`.

**Prompt:**
> Os arquivos `._*` (AppleDouble, macOS) estão sendo pegos pela descoberta de testes do Vitest e gerando suítes fantasma com erro de parse. Adicione `**/._*` ao `exclude` de `vitest.config.ts` e confirme que `npm test` fica limpo.

**Pronto quando:** `npm test` roda sem nenhuma suíte `._*` aparecendo.

---

## Fase 1 (restante) — Navegação do checklist

RF-09 a RF-12: lista de grupos, indicadores de progresso.

**Prompt:**
> Vamos desenhar a navegação do checklist (RF-09 a RF-12 — lista de grupos, indicadores de progresso), sobre o app já integrado no passo 0.1. Use `superpowers:brainstorming`.

## Fase 2 (UI) — Preenchimento de item

RF-13 a RF-22. DB layer já pronta em `main`: contagem de pontos, `resultado_calculado` gerado, trigger que exige foto quando resultado é "ruim", policy de DELETE de foto.

**Prompt:**
> Vamos construir a UI de preenchimento de item (RF-13 a RF-22) sobre a DB layer que já está em `main` (migrations 00011–00014). Use `superpowers:brainstorming`.

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

1. `superpowers:requesting-code-review` no branch inteiro.
2. `superpowers:verification-before-completion` antes de qualquer alegação de "pronto".
3. `superpowers:finishing-a-development-branch` pra decidir merge/PR.

Só depois disso cole o prompt da próxima fase da lista.
