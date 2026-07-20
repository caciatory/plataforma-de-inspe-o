-- supabase/migrations/00023_save_paint_measurement_observacao.sql
-- Fix pos-review: design (docs/superpowers/specs/2026-07-20-preenchimento-item-design.md
-- linha 30) exige que item de medicao tenha os mesmos controles de
-- foto/observacao que item padrao, mas a RPC save_paint_measurement (migration
-- 00021) nunca recebeu p_observacao. Recria a funcao com o parametro extra --
-- nao da pra so `alter function` pra acrescentar parametro a assinatura
-- existente, entao drop + create com o mesmo corpo de antes.

drop function public.save_paint_measurement(uuid, uuid, numeric[]);

create function public.save_paint_measurement(
  p_inspection_id uuid,
  p_item_template_id uuid,
  p_valores_um numeric[],
  p_observacao text default null
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
  insert into public.checklist_item_responses (inspection_id, item_template_id, observacao)
  values (p_inspection_id, p_item_template_id, p_observacao)
  on conflict (inspection_id, item_template_id) do update set observacao = p_observacao, atualizado_em = now()
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
