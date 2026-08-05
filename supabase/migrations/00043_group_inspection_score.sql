-- supabase/migrations/00043_group_inspection_score.sql
-- Fase 4 (pontuacao): docs/superpowers/specs/2026-08-04-pontuacao-design.md secoes 4/5.
-- checklist_group_score agrega checklist_item_score por (inspection_id,
-- group_id) -- so entra quem tem pelo menos uma resposta na tabela (RF-39:
-- media dos itens avaliados). inspection_score agrega checklist_group_score
-- por inspection_id, filtrando grupos com itens_avaliados > 0 antes de
-- tirar a media geral (RF-40/41), e classifica A/B/C pelos cortes fixos
-- (RF-42): >=8 'A', >=5 'B', senao 'C'.
-- NOTE: design doc describes "always one row (nullable fields)" shape, but
-- this implementation omits rows for groups/inspections with zero responses.
-- Deliberate simplification: behaviorally identical for .maybeSingle()/LEFT JOIN.
create view public.checklist_group_score as
select
  r.inspection_id,
  t.group_id,
  avg(s.pontos) as nota,
  count(s.pontos) as itens_avaliados
from public.checklist_item_responses r
join public.checklist_item_templates t on t.id = r.item_template_id
join public.checklist_item_score s on s.item_response_id = r.id
group by r.inspection_id, t.group_id;

alter view public.checklist_group_score set (security_invoker = true);

create view public.inspection_score as
select
  inspection_id,
  avg(nota) as nota_geral,
  case
    when avg(nota) >= 8 then 'A'
    when avg(nota) >= 5 then 'B'
    else 'C'
  end as classificacao
from public.checklist_group_score
where itens_avaliados > 0
group by inspection_id;

alter view public.inspection_score set (security_invoker = true);
