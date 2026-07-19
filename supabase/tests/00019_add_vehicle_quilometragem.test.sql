-- supabase/tests/00019_add_vehicle_quilometragem.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000022', 'tecnicoB@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000022', 'Tecnico B', 'tecnicoB@test.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000022';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000022"}';

do $$
declare
  v_id uuid;
  v_km int;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular',
    p_objetivo => 'compra',
    p_matricula => 'QQ-11-QQ',
    p_marca => 'Renault',
    p_modelo => 'Clio',
    p_nome_solicitante => 'Cliente Km',
    p_quilometragem => 87500
  );

  select quilometragem into v_km from public.vehicle_data where inspection_id = v_id;
  if v_km <> 87500 then
    raise exception 'FALHOU: quilometragem deveria ser 87500 (foi %)', v_km;
  end if;

  raise notice 'OK: create_inspection persiste quilometragem corretamente';
end $$;

do $$
begin
  begin
    perform public.create_inspection(
      p_tipo_cliente => 'particular',
      p_objetivo => 'compra',
      p_matricula => 'RR-22-RR',
      p_marca => 'Peugeot',
      p_modelo => '208',
      p_nome_solicitante => 'Cliente Km Negativo',
      p_quilometragem => -1
    );
    raise exception 'FALHOU: quilometragem negativa deveria violar quilometragem_nao_negativa';
  exception
    when check_violation then
      raise notice 'OK: constraint quilometragem_nao_negativa rejeita valores negativos';
  end;
end $$;

do $$
begin
  begin
    perform public.create_inspection(
      p_tipo_cliente => 'particular',
      p_objetivo => 'compra',
      p_matricula => 'SS-33-SS',
      p_marca => 'Fiat',
      p_modelo => 'Punto',
      p_nome_solicitante => 'Cliente Sem Km'
    );
    raise exception 'FALHOU: omitir p_quilometragem deveria falhar (parametro obrigatorio, sem default)';
  exception
    when undefined_function then
      raise notice 'OK: p_quilometragem e obrigatorio na assinatura da RPC';
  end;
end $$;

rollback;
