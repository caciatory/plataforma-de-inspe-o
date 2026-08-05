-- supabase/migrations/00042_checklist_item_score.sql
-- Fase 4 (pontuacao): docs/superpowers/specs/2026-08-04-pontuacao-design.md secao 4.
-- Pontos por resposta individual. Formula por posicao dentro do conjunto
-- (CTE opcoes_pontos, ignora opcoes is_na=true na contagem e no ranking):
-- opcao na posicao i entre N opcoes validas recebe 10 - (i-1) * 8/(N-1);
-- N=1 recebe 10. Reproduz exatamente o RF-38 original (10/6/2) pra
-- conjuntos de 3 opcoes. Medicao reusa medicoes_resultado (ja calculado,
-- Peca 1a) na mesma escala. Texto/data ficam null (nunca pontuam) --
-- naturalmente, ja que opcao_id e sempre null pra esses tipos, entao o
-- left join em opcoes_pontos nunca casa.
create view public.checklist_item_score as
with opcoes_ranked as (
  select o.id as opcao_id, o.conjunto_id,
    row_number() over (partition by o.conjunto_id order by o.ordem) as pos,
    count(*) over (partition by o.conjunto_id) as total
  from public.opcoes o
  where o.is_na = false
),
opcoes_pontos as (
  select opcao_id,
    case when total = 1 then 10::numeric else 10 - (pos - 1) * 8.0 / (total - 1) end as pontos
  from opcoes_ranked
)
select
  r.id as item_response_id,
  r.item_template_id,
  r.inspection_id,
  case
    when t.tipo = 'escolha' then op.pontos
    when t.tipo = 'medicao' then
      case mr.resultado
        when 'ok' then 10
        when 'atencao' then 6
        when 'critico' then 2
        else null
      end
    else null
  end::numeric as pontos
from public.checklist_item_responses r
join public.checklist_item_templates t on t.id = r.item_template_id
left join opcoes_pontos op on op.opcao_id = r.opcao_id
left join public.medicoes_resultado mr on mr.item_response_id = r.id;

alter view public.checklist_item_score set (security_invoker = true);
