-- supabase/tests/00048_update_inspection.test.sql
-- Cobre a migration 00048: update_inspection corrige vehicle_data e
-- reconcilia equipamento_inspecao (update por id existente + insert de novo
-- item numa mesma chamada). security invoker + auth.uid() exige simular a
-- sessão do técnico dono da inspeção, mesmo padrão de
-- supabase/tests/00046_users_insert_policy.test.sql.

begin;

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'tecnico-00048@example.com');
insert into public.users (id, nome, email, role) values
  ('11111111-1111-1111-1111-111111111111', 'Técnico 00048', 'tecnico-00048@example.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare
  v_inspection_id uuid;
  v_marca text;
  v_km int;
  v_condicao text;
  v_count int;
begin
  v_inspection_id := public.create_inspection(
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-048',
    p_marca => 'Marca Original',
    p_modelo => 'Modelo Original',
    p_nome_solicitante => 'Cliente Original',
    p_quilometragem => 10000
  );

  perform public.update_inspection(
    p_inspection_id => v_inspection_id,
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-048',
    p_marca => 'Marca Corrigida',
    p_modelo => 'Modelo Original',
    p_nome_solicitante => 'Cliente Original',
    p_quilometragem => 12000
  );

  select marca, quilometragem into v_marca, v_km from public.vehicle_data where inspection_id = v_inspection_id;
  if v_marca <> 'Marca Corrigida' or v_km <> 12000 then
    raise exception 'FALHOU: vehicle_data nao foi corrigido (marca=%, km=%)', v_marca, v_km;
  end if;
  raise notice 'OK: update_inspection corrige vehicle_data';

  -- Equipamento reconciliation: um item já existe (simula create anterior);
  -- update_inspection recebe uma edição por id + um item novo sem id.
  insert into public.equipamento_inspecao (id, inspection_id, categoria, nome_equipamento, condicao, ordem)
  values ('22222222-2222-2222-2222-222222222222', v_inspection_id, 'interior', 'Ar condicionado', 'bom', 0);

  perform public.update_inspection(
    p_inspection_id => v_inspection_id,
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-048',
    p_marca => 'Marca Corrigida',
    p_modelo => 'Modelo Original',
    p_nome_solicitante => 'Cliente Original',
    p_quilometragem => 12000,
    p_equipamentos => jsonb_build_array(
      jsonb_build_object('id', '22222222-2222-2222-2222-222222222222', 'categoria', 'interior', 'nome_equipamento', 'Ar condicionado', 'condicao', 'atencao', 'comentario', 'Fraco', 'ordem', 0),
      jsonb_build_object('categoria', 'exterior', 'nome_equipamento', 'Jantes', 'condicao', 'bom', 'comentario', null, 'ordem', 1)
    )
  );

  select condicao into v_condicao from public.equipamento_inspecao where id = '22222222-2222-2222-2222-222222222222';
  if v_condicao <> 'atencao' then
    raise exception 'FALHOU: equipamento existente deveria ter sido atualizado (condicao=%)', v_condicao;
  end if;
  raise notice 'OK: update_inspection atualiza equipamento existente por id';

  select count(*) into v_count from public.equipamento_inspecao where inspection_id = v_inspection_id;
  if v_count <> 2 then
    raise exception 'FALHOU: esperava 2 equipamentos (1 atualizado + 1 novo), achou %', v_count;
  end if;
  raise notice 'OK: update_inspection insere equipamento novo junto com a atualizacao';

  -- Test DELETE branch (p_equipamentos_removidos): insert a third item, then delete it.
  insert into public.equipamento_inspecao (id, inspection_id, categoria, nome_equipamento, condicao, ordem)
  values ('33333333-3333-3333-3333-333333333333', v_inspection_id, 'interior', 'Tapetes', 'bom', 2);

  perform public.update_inspection(
    p_inspection_id => v_inspection_id,
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-048',
    p_marca => 'Marca Corrigida',
    p_modelo => 'Modelo Original',
    p_nome_solicitante => 'Cliente Original',
    p_quilometragem => 12000,
    p_equipamentos => jsonb_build_array(
      jsonb_build_object('id', '22222222-2222-2222-2222-222222222222', 'categoria', 'interior', 'nome_equipamento', 'Ar condicionado', 'condicao', 'atencao', 'comentario', 'Fraco', 'ordem', 0)
    ),
    p_equipamentos_removidos => jsonb_build_array('33333333-3333-3333-3333-333333333333')
  );

  select count(*) into v_count from public.equipamento_inspecao where inspection_id = v_inspection_id;
  if v_count <> 2 then
    raise exception 'FALHOU: esperava 2 equipamentos apos delecao (3 - 1 removido), achou %', v_count;
  end if;

  select count(*) into v_count from public.equipamento_inspecao where id = '33333333-3333-3333-3333-333333333333';
  if v_count <> 0 then
    raise exception 'FALHOU: equipamento removido ainda existe na DB';
  end if;
  raise notice 'OK: update_inspection deleta equipamento por id em p_equipamentos_removidos';
end $$;

reset role;
rollback;
