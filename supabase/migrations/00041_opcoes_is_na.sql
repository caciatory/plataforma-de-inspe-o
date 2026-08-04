-- supabase/migrations/00041_opcoes_is_na.sql
-- Fase 4 (pontuação): docs/superpowers/specs/2026-08-04-pontuacao-design.md secao 3.
-- "Esta opcao e N.A." hoje so existe como inferencia por regex no cliente
-- (NA_LABEL_RE em lib/checklist/siblings.ts, usado por
-- resolveEscolhaColorModifier pra nao colorir N.A. como ruim). A
-- pontuacao (Task 2) precisa saber isso no banco pra excluir a opcao da
-- formula por posicao -- em vez de duplicar o mesmo regex em SQL, este
-- campo estruturado vira a fonte unica de verdade. O backfill abaixo usa
-- o MESMO padrao do regex do cliente, pra classificar exatamente as
-- mesmas opcoes que o cliente ja trata como N.A. hoje.

alter table public.opcoes add column is_na boolean not null default false;

update public.opcoes set is_na = true
where label ~* '^n\.?a\.?(\s|\(|$)';
