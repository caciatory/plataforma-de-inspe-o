# Processo de desenvolvimento de features

**Decisão:** 2026-07-19

## Processo vigente

Toda feature nova segue, sem exceção:

1. **`superpowers:brainstorming`** — perguntas de esclarecimento uma a uma, 2-3 alternativas com trade-offs, design aprovado pelo usuário. Spec salva em `docs/superpowers/specs/YYYY-MM-DD-<topico>-design.md`.
2. **`superpowers:writing-plans`** — plano faseado a partir da spec aprovada. Salvo em `docs/superpowers/plans/YYYY-MM-DD-<topico>.md`.
3. **`superpowers:subagent-driven-development`** — execução task a task, com revisão após cada task e revisão final do branch antes de integrar.

`docs/superpowers/specs/` e `docs/superpowers/plans/` são o único lugar canônico para specs e planos deste projeto.

## spec-kit (`.specify/`, skills `speckit-*`)

**Não faz parte do processo.** Fica instalado no repo mas inerte — nenhuma feature deve passar por `speckit-specify`, `/plan`, `/tasks` ou `speckit-implement`.

### Por que

- **Duplica o que já existe**: `speckit-specify`/`speckit-clarify` resolvem ambiguidade de requisitos via perguntas — é exatamente o que os steps 3-4 do `brainstorming` já fazem, e já fizeram com sucesso em 3 features reais (schema, RLS, checklist-seed).
- **Estrutura paralela forçada**: os scripts em `.specify/scripts/bash/` (usados por todos os comandos `speckit-*`) resolvem a feature ativa via branch numerada + diretório `specs/NNN-feature-name/`, criado por `create-new-feature.sh`. Não dá para apontar esses comandos para `docs/superpowers/specs/` — usá-los cria um segundo diretório canônico concorrente.
- **`speckit-implement` bypassaria a revisão por task** do `subagent-driven-development`, que é hoje o método estabelecido e validado de execução.
- **Instalação foi exploratória**: sem lacuna concreta identificada no processo atual que justificasse adotar um segundo sistema.

### Alternativas consideradas e rejeitadas

- **Processo paralelo, escolha consciente por feature** — overhead de decisão a cada feature nova, specs espalhadas em dois lugares, risco de `speckit-implement` substituir `subagent-driven-development` em alguma feature.
- **Migração completa para spec-kit**, incluindo reescrever `docs/superpowers/plans/` existentes — trabalho sem ganho: essas 3 features já foram entregues e revisadas no formato atual.

### Quando reconsiderar

Só revisitar esta decisão se surgir uma lacuna concreta que o processo atual não cobre — por exemplo, exportar tasks em massa para issues do GitHub (`speckit-taskstoissues` faz isso; `subagent-driven-development` não). Até lá, `.specify/` e os skills `speckit-*` podem ser removidos do repo sem perda; foram mantidos apenas por não atrapalharem em standby.
