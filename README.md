# Inspecta

App de vistoria técnica veicular em tablet. Técnico preenche uma checklist estruturada (300+ itens, 12 grupos) em campo; admin revisa, aprova e gera um relatório verificável para o cliente.

## Status atual (2026-07-09)

PRD e arquitetura de banco de dados fechados. Stack técnica escolhida (Supabase/Postgres). Migrations com testes SQL escritas, mas **ainda não executadas** — nenhum projeto Supabase foi criado/inicializado ainda. Nenhum código de aplicação existe.

## Documentos

| Doc | O que tem |
|---|---|
| [`docs/superpowers/specs/2026-07-09-inspecta-prd-design.md`](docs/superpowers/specs/2026-07-09-inspecta-prd-design.md) | PRD: problema, persona, jornada do usuário, escopo v1.0 (o que entra/fica de fora e por quê) |
| [`docs/especificacao-tecnica-v1.md`](docs/especificacao-tecnica-v1.md) | Especificação técnica: RF-01–62, RNF-01–23, mapa de permissões, modelo de dados (ER), roadmap de 9 fases |
| [`docs/database-schema-v1.md`](docs/database-schema-v1.md) | Referência do schema Postgres: 11 tabelas em 5 domínios, diagrama ER, coluna por coluna |
| [`docs/superpowers/plans/2026-07-09-inspecta-database-schema.md`](docs/superpowers/plans/2026-07-09-inspecta-database-schema.md) | Plano de implementação: migrations SQL completas + testes, task por task |

## Decisões-chave

- **Stack:** PostgreSQL via Supabase (Auth + Storage + Postgres num pacote só) — não Firebase, porque o modelo é relacional e a vantagem central do Firebase (sync offline) não é usada.
- **Sem offline-first:** v1.0 assume internet sempre disponível (operação pequena, 1-2 técnicos no lançamento). Autosave é direto ao servidor, com retry manual em caso de erro.
- **Sem tela de configuração:** pontuação, faixas de medição de pintura e checklist são fixos no código/seed — sem UI de admin para editá-los no v1.0.
- **Um admin só:** sem desenho de suporte a múltiplos admins.
- **Ponytail aplicado duas vezes:** uma vez no desenho do PRD (cortou offline-first, config UI, etc. do escopo de produto), outra vez ao modelar o banco (fundiu `CERTIFICATE` em `inspections`, unificou `PHOTO`+`REPORT_COVER_PHOTO`, tornou `status` uma coluna gerada em vez de campo duplicado).

## Pendências conhecidas

- **Row Level Security não escrita.** As tabelas existem, mas sem RLS qualquer técnico autenticado pode ler inspeções de outro técnico. Precisa entrar antes de qualquer app cliente consultar essas tabelas diretamente.
- Conteúdo exato dos 300+ itens do checklist (planilha/JSON) ainda não existe.
- Design de tela do dashboard/checklist do técnico e do admin ainda não existe (só o relatório final tem design pronto).
- Projeto Supabase real ainda não foi criado — as migrations em `docs/superpowers/plans/2026-07-09-inspecta-database-schema.md` estão prontas mas não rodaram em lugar nenhum ainda.

## Grafo de conhecimento

O projeto está indexado via `graphify` em `graphify-out/` (não versionado) — 145 nós, 316 arestas, 12 comunidades, cruzando PRD, spec técnica e schema de banco. Rode `/graphify query "<pergunta>"` pra consultar.
