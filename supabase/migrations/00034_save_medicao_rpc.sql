-- supabase/migrations/00034_save_medicao_rpc.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 7. Generaliza save_paint_measurement (derrubada na Task 4). Remove
-- o "truque" que escrevia uma classificacao derivada so pra reaproveitar
-- status/RF-16 -- nao e mais necessario, porque status
-- (checklist_item_status, Task 5) e RF-16 (check_exige_foto, Task 6) agora
-- leem medicoes_resultado diretamente.

create function public.save_medicao(
  p_inspection_id uuid,
  p_item_template_id uuid,
  p_valores numeric[],
  p_observacao text default null
) returns table (item_response_id uuid, resultado public.medicao_resultado)
language plpgsql security invoker set search_path = ''
as $$
#variable_conflict use_column
declare
  v_response_id uuid;
begin
  insert into public.checklist_item_responses (inspection_id, item_template_id, observacao)
  values (p_inspection_id, p_item_template_id, p_observacao)
  on conflict (inspection_id, item_template_id) do update set observacao = p_observacao, atualizado_em = now()
  returning id into v_response_id;

  insert into public.medicoes (item_response_id, valores)
  values (v_response_id, p_valores::numeric(8,2)[])
  on conflict (item_response_id) do update set valores = excluded.valores;

  return query
    select v_response_id, mr.resultado from public.medicoes_resultado mr where mr.item_response_id = v_response_id;
end;
$$;
