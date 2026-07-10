# Inspecta

App de vistoria técnica veicular em tablet. Técnico preenche uma checklist estruturada (285 itens, 11 grupos) em campo; admin revisa, aprova e gera um relatório verificável para o cliente.

## Status atual (2026-07-10)

PRD e arquitetura de banco de dados fechados. Projeto Supabase real criado ("inspecar Novo") e as 7 migrations aplicadas e testadas nele — schema completo está live. Nenhum código de aplicação existe ainda.

## Documentos

| Doc | O que tem |
|---|---|
| [`docs/superpowers/specs/2026-07-09-inspecta-prd-design.md`](docs/superpowers/specs/2026-07-09-inspecta-prd-design.md) | PRD: problema, persona, jornada do usuário, escopo v1.0 (o que entra/fica de fora e por quê) |
| [`docs/especificacao-tecnica-v1.md`](docs/especificacao-tecnica-v1.md) | Especificação técnica: RF-01–63, RNF-01–23, mapa de permissões, modelo de dados (ER), roadmap de 9 fases |
| [`docs/database-schema-v1.md`](docs/database-schema-v1.md) | Referência do schema Postgres: 11 tabelas em 5 domínios, diagrama ER, coluna por coluna |
| [`docs/superpowers/plans/2026-07-09-inspecta-database-schema.md`](docs/superpowers/plans/2026-07-09-inspecta-database-schema.md) | Plano de implementação: migrations SQL completas + testes, task por task |
| [`docs/data/checklist-inspecta-v5.csv`](docs/data/checklist-inspecta-v5.csv) | Conteúdo real do checklist: 285 itens v1.0 (11 grupos) + 35 itens Fase 2 (Motorização Especial) |

## Decisões-chave

- **Stack:** PostgreSQL via Supabase (Auth + Storage + Postgres num pacote só) — não Firebase, porque o modelo é relacional e a vantagem central do Firebase (sync offline) não é usada.
- **Sem offline-first:** v1.0 assume internet sempre disponível (operação pequena, 1-2 técnicos no lançamento). Autosave é direto ao servidor, com retry manual em caso de erro.
- **Sem tela de configuração:** pontuação, faixas de medição de pintura e checklist são fixos no código/seed — sem UI de admin para editá-los no v1.0.
- **Um admin só:** sem desenho de suporte a múltiplos admins.
- **Particular vs. Stand é por item, não por grupo:** cada item do checklist tem um flag `aplica_stand`. Particular sempre vê os 285 itens; Stand só vê o subconjunto marcado pelos sócios. O grupo "Teste de Condução" (15 itens) foi removido do escopo inteiramente — não será aplicado a nenhum tipo de cliente.
- **Ponytail aplicado duas vezes:** uma vez no desenho do PRD (cortou offline-first, config UI, etc. do escopo de produto), outra vez ao modelar o banco (fundiu `CERTIFICATE` em `inspections`, unificou `PHOTO`+`REPORT_COVER_PHOTO`, tornou `status` uma coluna gerada em vez de campo duplicado).

## Pendências conhecidas

- **Row Level Security não escrita.** As tabelas existem, mas sem RLS qualquer técnico autenticado pode ler inspeções de outro técnico. Precisa entrar antes de qualquer app cliente consultar essas tabelas diretamente.
- **Decisão dos sócios pendente:** quais dos 285 itens têm `aplica_stand = true` (RF-63) — bloqueia o seed final de `checklist_item_templates`. Coluna `aplica_stand` no CSV está `PENDENTE` em toda linha.
- Design de tela do dashboard/checklist do técnico e do admin ainda não existe (só o relatório final tem design pronto).
- **Fase 2 confirmada (não especulativa):** Motorização Especial (BEV/HEV/GPL, 35 itens) — aguarda aquisição de equipamento (scanner de bateria, detetor de fugas de gás).
- Regra: nunca editar uma migration já aplicada no projeto hospedado — sempre uma nova (ex: `00007_...`), nunca reescrever `0000N_...` já commitado. O ledger do Supabase rastreia por número de versão, não checksum, então edições in-place não quebram nada hoje, mas quebram a confiança do histórico.

## Grafo de conhecimento

O projeto está indexado via `graphify` em `graphify-out/` (não versionado), cruzando PRD, spec técnica e schema de banco. Desatualizado após os ajustes de 2026-07-10 (Teste de Condução removido, `aplica_stand`) — rodar `/graphify --update` antes de consultar. Rode `/graphify query "<pergunta>"` pra consultar.
