-- supabase/migrations/00047_remove_duplicate_identificacao_historico.sql
-- Ver docs/superpowers/specs/2026-08-10-remocao-duplicacao-identificacao-historico-design.md §3.1
-- Os 21 itens de "Identificação"/"Histórico" (grupo ordem=1) duplicam dados já
-- coletados no formulário "Nova Inspeção" (vehicle_data/client_data). "Documentação"
-- (mesmo grupo) não é tocada — não é duplicada em lugar nenhum.

delete from public.checklist_item_responses
where item_template_id in (
  select t.id
  from public.checklist_item_templates t
  join public.checklist_group_templates g on g.id = t.group_id
  where g.ordem = 1 and t.subcategoria in ('Identificação', 'Histórico')
);

delete from public.checklist_item_templates t
using public.checklist_group_templates g
where g.id = t.group_id
  and g.ordem = 1
  and t.subcategoria in ('Identificação', 'Histórico');
