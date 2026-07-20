-- supabase/migrations/00021_save_paint_measurement.sql
-- RF-19 a RF-22: escrita atomica do item de medicao. Upsert da resposta, upsert
-- da medicao (dispara resultado_calculado, coluna gerada da migration 00012),
-- deriva classificacao do resultado e atualiza a resposta -- assim status
-- (gerado a partir de classificacao, migration 00003) fica 'respondido' sem
-- nenhuma mudanca na Fase 1 (lib/checklist/progress.ts). reparacao_colisao ->
-- 'ruim' passa a exigir foto automaticamente via trigger RF-16 ja existente
-- (migration 00013) -- leitura razoavel do requisito, que nao restringe
-- "ruim" a item padrao. Ver design: docs/superpowers/specs/
-- 2026-07-20-preenchimento-item-design.md secao 4.

create function public.save_paint_measurement(
  p_inspection_id uuid,
  p_item_template_id uuid,
  p_valores_um numeric[]
) returns table (
  item_response_id uuid,
  resultado_calculado public.paint_resultado,
  classificacao public.item_classificacao
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_response_id uuid;
  v_resultado public.paint_resultado;
  v_classificacao public.item_classificacao;
begin
  insert into public.checklist_item_responses (inspection_id, item_template_id)
  values (p_inspection_id, p_item_template_id)
  on conflict (inspection_id, item_template_id) do update set atualizado_em = now()
  returning id into v_response_id;

  insert into public.paint_measurements (item_response_id, valores_um)
  values (v_response_id, p_valores_um::numeric(6,2)[])
  on conflict on constraint paint_measurements_pkey do update set valores_um = excluded.valores_um
  returning paint_measurements.resultado_calculado into v_resultado;

  v_classificacao := case v_resultado
    when 'OK' then 'otimo'::public.item_classificacao
    when 'anomalia' then 'medio'::public.item_classificacao
    when 'reparacao_colisao' then 'ruim'::public.item_classificacao
  end;

  update public.checklist_item_responses
  set classificacao = v_classificacao
  where id = v_response_id;

  return query select v_response_id, v_resultado, v_classificacao;
end;
$$;
