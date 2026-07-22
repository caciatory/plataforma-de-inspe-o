# Check Auto

App de vistoria técnica veicular em tablet. Técnico preenche uma checklist estruturada (285 itens, 11 grupos) em campo; admin revisa, aprova e gera um relatório verificável para o cliente.

## Status atual (2026-07-19)

18 migrations aplicadas e testadas no Supabase real — schema completo, RLS ativa nas 12 tabelas, checklist semeado (320 itens, 12 grupos, grupo 12 inativo até a Fase 9). Fase 1a do app (login + formulário de dados básicos, RF-01–06) mesclada em `main` — primeiro código de aplicação do projeto. Checklist nav, preenchimento de item e todas as fases seguintes ainda não têm UI. Roadmap detalhado com prompts prontos em [`docs/ROADMAP.md`](docs/ROADMAP.md); processo de desenvolvimento em [`docs/PROCESSO.md`](docs/PROCESSO.md).

## Documentos

| Doc | O que tem |
|---|---|
| [`docs/superpowers/specs/2026-07-09-inspecta-prd-design.md`](docs/superpowers/specs/2026-07-09-inspecta-prd-design.md) | PRD: problema, persona, jornada do usuário, escopo v1.0 (o que entra/fica de fora e por quê) |
| [`docs/especificacao-tecnica-v1.md`](docs/especificacao-tecnica-v1.md) | Especificação técnica: RF-01–63, RNF-01–23, mapa de permissões, modelo de dados (ER), roadmap de 9 fases |
| [`docs/database-schema-v1.md`](docs/database-schema-v1.md) | Referência do schema Postgres: 12 tabelas em 5 domínios, diagrama ER, coluna por coluna |
| [`docs/superpowers/plans/2026-07-09-inspecta-database-schema.md`](docs/superpowers/plans/2026-07-09-inspecta-database-schema.md) | Plano de implementação: migrations SQL completas + testes, task por task |
| [`docs/superpowers/plans/2026-07-10-inspecta-rls-policies.md`](docs/superpowers/plans/2026-07-10-inspecta-rls-policies.md) | Plano de RLS: modelo de dois papéis, funções helper, policy por tabela |
| [`docs/superpowers/plans/2026-07-11-fase1a-dados-basicos.md`](docs/superpowers/plans/2026-07-11-fase1a-dados-basicos.md) | Plano da Fase 1a: login + formulário de dados básicos (RF-01–06), já mesclado |
| [`docs/superpowers/plans/2026-07-11-fase2-preenchimento-item.md`](docs/superpowers/plans/2026-07-11-fase2-preenchimento-item.md) | Plano da camada de banco da Fase 2 (RF-13–22) — UI ainda não construída |
| [`docs/superpowers/plans/2026-07-11-checklist-seed-300-itens.md`](docs/superpowers/plans/2026-07-11-checklist-seed-300-itens.md) | Plano do seed de 320 itens/12 grupos do checklist a partir do CSV |
| [`docs/data/checklist-inspecta-v5.csv`](docs/data/checklist-inspecta-v5.csv) | Conteúdo real do checklist: 285 itens v1.0 (11 grupos) + 35 itens Fase 2 (Motorização Especial) |
| [`docs/PROCESSO.md`](docs/PROCESSO.md) | Processo de desenvolvimento (brainstorming → writing-plans → subagent-driven-development) e por que spec-kit não é usado |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Sequência de fases restantes até v1.0, com prompt pronto e progresso de cada uma |

## Decisões-chave

- **Stack:** PostgreSQL via Supabase (Auth + Storage + Postgres num pacote só) — não Firebase, porque o modelo é relacional e a vantagem central do Firebase (sync offline) não é usada.
- **Sem offline-first:** v1.0 assume internet sempre disponível (operação pequena, 1-2 técnicos no lançamento). Autosave é direto ao servidor, com retry manual em caso de erro.
- **Sem tela de configuração:** pontuação, faixas de medição de pintura e checklist são fixos no código/seed — sem UI de admin para editá-los no v1.0.
- **Um admin só:** sem desenho de suporte a múltiplos admins.
- **Particular vs. Stand é por item, não por grupo:** cada item do checklist tem um flag `aplica_stand`. Particular sempre vê os 285 itens; Stand só vê o subconjunto marcado pelos sócios. O grupo "Teste de Condução" (15 itens) foi removido do escopo inteiramente — não será aplicado a nenhum tipo de cliente.
- **Ponytail aplicado duas vezes:** uma vez no desenho do PRD (cortou offline-first, config UI, etc. do escopo de produto), outra vez ao modelar o banco (fundiu `CERTIFICATE` em `inspections`, unificou `PHOTO`+`REPORT_COVER_PHOTO`, tornou `status` uma coluna gerada em vez de campo duplicado).

## Pendências conhecidas

- **Decisão dos sócios pendente:** quais dos 285 itens do v1.0 têm `aplica_stand = true` (RF-63) — hoje `false` em todas as 320 linhas seedadas (285 v1.0 + 35 da Fase 9). Bloqueia RF-63 entrar em vigor de fato.
- Design de tela do checklist (navegação e preenchimento de item) e do admin ainda não existe — só dados básicos (Fase 1a) e o relatório final têm design pronto.
- **Fase 9 confirmada (não especulativa):** Motorização Especial (BEV/HEV/GPL, 35 itens) — aguarda aquisição de equipamento (scanner de bateria, detetor de fugas de gás). Conteúdo já seedado no banco com `ativo=false`.
- Regra: nunca editar uma migration já aplicada no projeto hospedado — sempre uma nova (ex: `00019_...`), nunca reescrever `0000N_...` já commitado. O ledger do Supabase rastreia por número de versão, não checksum, então edições in-place não quebram nada hoje, mas quebram a confiança do histórico.
- Ver [`docs/ROADMAP.md`](docs/ROADMAP.md) — Passo 0.4 registra um problema de ambiente conhecido (arquivos `._*` do macOS quebrando a descoberta de testes do Vitest) ainda não corrigido.

## Grafo de conhecimento

O projeto foi indexado via `graphify` em `graphify-out/` (não versionado) em 2026-07-11 — anterior a RLS, ao seed do checklist e a todo o código de aplicação. Desatualizado; rodar `/graphify --update` antes de consultar. Rode `/graphify query "<pergunta>"` pra consultar.
