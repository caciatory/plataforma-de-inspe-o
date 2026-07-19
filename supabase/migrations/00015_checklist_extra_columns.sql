-- supabase/migrations/00015_checklist_extra_columns.sql
-- Prep para o seed dos 320 itens reais do checklist (RF-07, RF-63).
-- ativo: permite importar o grupo 12 (Motoriz. Especial, Fase 9) sem expô-lo no v1.0.
-- observacoes: preserva as dicas do CSV-fonte que não tinham coluna (thresholds, o que verificar).

alter table public.checklist_group_templates
  add column ativo boolean not null default true;

alter table public.checklist_item_templates
  add column observacoes text;
