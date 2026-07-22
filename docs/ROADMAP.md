# Roadmap — Check Auto v1.0

Atualizado: 2026-07-21. Baseado em `docs/especificacao-tecnica-v1.md` §5 (9 fases) e no estado real do código (branches, migrations) nesta data.

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
- **Fase 2 (UI) — implementada via subagent-driven-development, PR aberta (2026-07-20).** RF-13 a RF-22: bucket de Storage pra fotos (`fotos-inspecao`, público) + policy de RLS, RPC `save_paint_measurement` (upsert atômico + classificação derivada de `resultado_calculado`), formulário de classificação (ótimo/médio/ruim/NF + confirmação de NF + observação + fotos), formulário de medição (3-5 pontos numéricos), navegação "salvar e próximo" via `findNextItemId`. 8 tasks, cada uma com review própria; 1 fix durante a execução (policy de Storage sem bypass de admin, RF-35, aprovado antes de corrigir) e 1 fix pós-review-final (item de medição sem campo de observação, contradição com o design §3, corrigido e re-revisado limpo). 65/65 testes passando, `tsc`/build limpos, verificado ponta a ponta no navegador (login → classificar → foto → RF-16 bloqueio/liberação → confirmação NF → medição → conferido direto no banco). PR #4 mesclada em 2026-07-20. Design: `docs/superpowers/specs/2026-07-20-preenchimento-item-design.md`, plano: `docs/superpowers/plans/2026-07-20-preenchimento-item.md`.
- **Fase 2.5 — "Aplicar aos demais" implementada via subagent-driven-development, revisada (2026-07-21).** Resolve a pendência do §6 da especificação técnica. 9 tasks: coluna `grupo_replicacao` + CHECK constraint (só itens `tipo='padrao'`), curadoria de 101 itens em 37 clusters via script Python gerador de migration + CSV (`scripts/generate_grupo_replicacao_seed.py`), RPC `apply_classificacao_batch` (upsert atômico multi-linha, respeita o trigger RF-16 — um item "ruim" sem foto no lote reverte o lote inteiro), função pura `deriveSiblingRows` (itens-irmãos + default de checkbox: marcado só se `pendente`), `PhotoManager` adaptado pra múltiplas instâncias na mesma página, `applyClassificacaoBatchAction` (Server Action com validação client-side antes do RPC), `BatchApplyPanel` (painel de revisão em lote, bloqueio client-side de "ruim" sem foto nomeando o item), wiring na página de item existente (sem rota nova). Cada task revisada individualmente; revisão final de toda a branch encontrou 2 achados Importantes (nota de item-irmão já respondido mostrava status genérico em vez da classificação real; ausência de teste cobrindo o invariante "irmãos nunca herdam foto do item de origem") — ambos corrigidos e re-revisados limpo. 85/85 testes passando, `tsc`/build limpos, verificado ponta a ponta no navegador com conta técnico de teste (agora `teste1@checkauto.pt` — a conta original `teste@checkauto.pt` perdeu a senha). Migrations 00024–00026. Design: `docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md`, plano: `docs/superpowers/plans/2026-07-21-aplicar-aos-demais.md`. Mesclada em `main` via `finishing-a-development-branch` (merge local, fast-forward) e enviada pro GitHub em 2026-07-22.
- **Sistema de design definido (2026-07-22).** O app não tinha nenhum estilo visual (`app/globals.css` era um reset de 2 linhas, HTML semântico puro em todas as telas). Usando a skill `impeccable`, definidos `PRODUCT.md` (registro "product", personas técnico/admin/cliente, princípios de design) e `DESIGN.md` (paleta OKLCH completa ancorada na marca **Check Auto** — verde `#11C685` estendido numa rampa de 10 tons, cores semânticas novas pra classificação ótimo/médio/ruim/NF, tipografia Space Grotesk + Inter, decisão de preto só nos pontos de identidade — header/nav/CTAs — não a interface inteira). **Descoberta durante a task:** a fonte de marca oficial (Codec Pro) só está disponível pro projeto via um link de uso pessoal (1001fonts, licença CC BY-NC) — não pode ir pra produção; Space Grotesk usada como substituta até haver licença comercial da Zetafonts (fundição original). **Descoberta 2:** o produto perdeu o domínio `inspecta.*` e o nome real da marca agora é **Check Auto** — o código/docs ainda dizem "Inspecta" em todo lugar (ver Fase 2.6 abaixo).

## Estado atual

Todo o bloco 0 (housekeeping) está concluído — ver seção Progresso acima. `main` tem: 26 migrations (inclui `quilometragem`, o bucket de fotos, `save_paint_measurement`, `grupo_replicacao` e `apply_classificacao_batch`), RLS nas 12 tabelas + policy de Storage, checklist seedado (320 itens/12 grupos, 101 deles com `grupo_replicacao` curado), código de app da Fase 1a (login + dados básicos), Fase 1 (navegação do checklist, PR #3 mesclada), validade da inspeção (PR #2 mesclada), Fase 2 (preenchimento de item, PR #4 mesclada) e Fase 2.5 (aplicar aos demais, mesclada e enviada). `PRODUCT.md`/`DESIGN.md` definidos (ver Progresso acima) — nenhuma tela ainda usa esses tokens, todas continuam em HTML puro sem estilo. `npm test` limpo, docs sincronizados. Diretório de trabalho é `~/Desktop/bild app` (KINGSTON mantido só como backup). **Próxima unidade de trabalho real: Fase 2.6** (rename Inspecta → Check Auto) **seguida da Fase 2.7** (aplicar o design system nas telas existentes) — ambas antes de continuar com features novas (Fase 3 em diante).

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

## Fase 2.5 — "Aplicar aos demais" em itens repetidos ✅ implementada e revisada, aguardando merge (2026-07-21)

Resolve a pendência de `docs/especificacao-tecnica-v1.md` §6. Ver detalhes na seção Progresso acima. Design: `docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md`, plano: `docs/superpowers/plans/2026-07-21-aplicar-aos-demais.md`.

## Fase 2.6 — Rename Inspecta → Check Auto

O produto perdeu o domínio `inspecta.*`; o nome real da marca agora é **Check Auto** (`checkauto.pt` já é o domínio usado pela conta técnico de teste). "Inspecta" foi só o codinome interno usado durante o desenvolvimento — ainda aparece em `README.md`, neste `ROADMAP.md`, no nome do repositório Git, em `package.json`, nos docs de especificação/design/plano, e na memória do agente entre sessões. Escopo: trocar todas as referências de nome de produto pra "Check Auto" (mantendo "Inspecta" só onde for histórico/changelog, se fizer sentido), decidir se o nome do repositório GitHub muda junto. Não inclui o design visual (isso é a Fase 2.7).

**Prompt:**
> Vamos renomear o produto de "Inspecta" pra "Check Auto" em todo o código e documentação — README, ROADMAP, package.json, docs de spec/design/plano, e qualquer texto visível pro usuário. Use `superpowers:brainstorming` pra mapear o escopo completo (inclusive se o nome do repo Git muda) antes de tocar em arquivos.

**Pronto quando:** nenhuma referência a "Inspecta" como nome de produto sobra no código/docs ativos (histórico em nomes de arquivo de plano antigo, ex. `2026-07-09-inspecta-prd-design.md`, pode ficar — é registro histórico, não branding atual).

## Fase 2.7 — Aplicar o sistema de design nas telas existentes

`PRODUCT.md` e `DESIGN.md` já definem a direção (paleta OKLCH ancorada na marca Check Auto, tipografia Space Grotesk + Inter, preto só em pontos de identidade). Nenhuma tela usa isso ainda — login, dados básicos, navegação do checklist, formulários de item (classificação/medição), painel de "aplicar aos demais" — tudo em HTML semântico puro. Escopo: aplicar os tokens do `DESIGN.md` em cada tela existente, sem mudar comportamento/lógica (só camada visual).

**Prompt:**
> Vamos aplicar o `DESIGN.md` nas telas que já existem (login, dados básicos, checklist, preenchimento de item, aplicar aos demais). Use a skill `impeccable` (`/impeccable polish` por tela, ou `/impeccable critique` primeiro pra priorizar) — sem alterar comportamento, só a camada visual.

**Pronto quando:** todas as telas existentes usam os tokens do `DESIGN.md` (nenhum HTML sem estilo restante) e passam por `superpowers:verification-before-completion` (screenshots + navegação manual confirmando que nada quebrou funcionalmente).

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
