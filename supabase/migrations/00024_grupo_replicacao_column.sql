-- Fase 2.5: docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md
-- secao 2. Itens com o mesmo grupo_replicacao nao-nulo sao "irmaos" pra UI
-- de aplicar-aos-demais. So item_template tipo='padrao' pode ter valor --
-- medicao nao tem classificacao manual pra copiar.

alter table public.checklist_item_templates
  add column grupo_replicacao text;

alter table public.checklist_item_templates
  add constraint grupo_replicacao_so_padrao
  check (grupo_replicacao is null or tipo = 'padrao');
