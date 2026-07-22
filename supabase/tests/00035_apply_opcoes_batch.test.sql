-- supabase/tests/00035_apply_opcoes_batch.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 905, 'Grupo Teste Batch');
insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id, grupo_replicacao) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item A', 'escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'), 'cluster-teste'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item B', 'escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'), 'cluster-teste');

do $$
declare
  v_medio_id uuid;
  v_count int;
begin
  select o.id into v_medio_id from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome = 'estado_4' and o.label = 'Médio';

  perform public.apply_opcoes_batch(
    '00000000-0000-0000-0000-000000000010',
    jsonb_build_array(
      jsonb_build_object('item_template_id', '00000000-0000-0000-0000-000000000021', 'opcao_id', v_medio_id, 'observacao', 'obs A'),
      jsonb_build_object('item_template_id', '00000000-0000-0000-0000-000000000022', 'opcao_id', v_medio_id, 'observacao', 'obs B')
    )
  );

  select count(*) into v_count from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010' and opcao_id = v_medio_id;
  if v_count <> 2 then
    raise exception 'FALHOU: lote deveria ter gravado 2 respostas com opcao_id (achou %)', v_count;
  end if;
  raise notice 'OK: lote grava multiplas respostas com opcao_id numa chamada so';
end $$;

do $$
declare
  v_ruim_id uuid;
begin
  select o.id into v_ruim_id from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome = 'estado_4' and o.label = 'Ruim';

  begin
    perform public.apply_opcoes_batch(
      '00000000-0000-0000-0000-000000000010',
      jsonb_build_array(
        jsonb_build_object('item_template_id', '00000000-0000-0000-0000-000000000021', 'opcao_id', v_ruim_id, 'observacao', null)
      )
    );
    execute 'set constraints all immediate';
    raise exception 'FALHOU: lote com opcao Ruim sem foto deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: lote com opcao que exige foto sem foto e bloqueado pelo RF-16 (check_exige_foto)';
  end;
end $$;

rollback;
