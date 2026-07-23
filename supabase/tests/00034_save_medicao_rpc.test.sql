-- supabase/tests/00034_save_medicao_rpc.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 904, 'Grupo Teste Save Medicao');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao, faixa_min_ok, faixa_max_ok, limiar_critico_superior)
  values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item Tinta', 'medicao', 3, 70, 160, 300);

do $$
declare v_response_id uuid; v_resultado public.medicao_resultado;
begin
  select item_response_id, resultado into v_response_id, v_resultado
  from public.save_medicao('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021', array[100.0, 110.0, 120.0], 'observação inicial');

  if v_resultado <> 'ok' then
    raise exception 'FALHOU: valores dentro da faixa deveriam dar ok (deu %)', v_resultado;
  end if;

  if not exists (select 1 from public.checklist_item_responses where id = v_response_id and observacao = 'observação inicial') then
    raise exception 'FALHOU: observacao deveria ter sido gravada';
  end if;

  raise notice 'OK: save_medicao cria response + medicao e retorna resultado ok';
end $$;

do $$
declare v_response_id uuid; v_resultado public.medicao_resultado; v_count int;
begin
  select item_response_id, resultado into v_response_id, v_resultado
  from public.save_medicao('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021', array[300.0, 110.0, 120.0], 'observação atualizada');

  select count(*) into v_count from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010' and item_template_id = '00000000-0000-0000-0000-000000000021';
  if v_count <> 1 then
    raise exception 'FALHOU: chamar save_medicao de novo deveria fazer upsert (achou % linhas)', v_count;
  end if;

  if v_resultado <> 'critico' then
    raise exception 'FALHOU: valor >=300 deveria dar critico (deu %)', v_resultado;
  end if;

  raise notice 'OK: save_medicao faz upsert idempotente e recalcula o resultado';
end $$;

rollback;
