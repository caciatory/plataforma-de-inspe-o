-- supabase/migrations/00050_remove_documentacao_checklist.sql
-- Extensão de 00047: usuário confirmou que "Documentação" (grupo ordem=1,
-- os 4 itens: DUA, IPO, Seguro, Livro de revisões) também não deve contar
-- nota nem ficar no checklist — mesma regra do resto do grupo (só
-- Equipamentos conta nota). Mesmo padrão de delete em duas etapas de 00047
-- (checklist_item_responses.item_template_id não tem on delete cascade).

delete from public.checklist_item_responses
where item_template_id in (
  select t.id
  from public.checklist_item_templates t
  join public.checklist_group_templates g on g.id = t.group_id
  where g.ordem = 1 and t.subcategoria = 'Documentação'
);

delete from public.checklist_item_templates t
using public.checklist_group_templates g
where g.id = t.group_id
  and g.ordem = 1
  and t.subcategoria = 'Documentação';
