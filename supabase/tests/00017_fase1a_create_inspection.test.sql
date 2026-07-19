-- supabase/tests/00017_fase1a_create_inspection.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'tecnicoA@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000021', 'Tecnico A', 'tecnicoA@test.com', 'tecnico');

-- simulate tecnico A
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000021';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000021"}';

do $$
declare
  v_id uuid;
  v_tecnico uuid;
  v_marca text;
  v_tipo public.tipo_cliente;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'stand',
    p_objetivo => 'venda',
    p_matricula => 'AA-11-BB',
    p_marca => 'Toyota',
    p_modelo => 'Corolla',
    p_nome_solicitante => 'Stand Central',
    p_quilometragem => 45000,
    p_contacto => '910000000',
    p_email => 'stand@central.pt'
  );

  select tecnico_id into v_tecnico from public.inspections where id = v_id;
  if v_tecnico <> '00000000-0000-0000-0000-000000000021' then
    raise exception 'FALHOU: tecnico_id deveria ser o tecnico autenticado (foi %)', v_tecnico;
  end if;

  select marca into v_marca from public.vehicle_data where inspection_id = v_id;
  if v_marca <> 'Toyota' then
    raise exception 'FALHOU: vehicle_data.marca deveria ser Toyota (foi %)', v_marca;
  end if;

  select tipo into v_tipo from public.client_data where inspection_id = v_id;
  if v_tipo <> 'stand' then
    raise exception 'FALHOU: client_data.tipo deveria ser stand (foi %)', v_tipo;
  end if;

  raise notice 'OK: create_inspection grava inspections/vehicle_data/client_data numa so transacao';
end $$;

do $$
begin
  begin
    perform public.create_inspection(
      p_tipo_cliente => 'stand',
      p_objetivo => 'compra',
      p_matricula => 'XX-00-XX',
      p_marca => 'Honda',
      p_modelo => 'Civic',
      p_nome_solicitante => 'Stand Invalido',
      p_quilometragem => 10000
    );
    raise exception 'FALHOU: objetivo=compra com tipo_cliente=stand deveria violar objetivo_stand_fixo';
  exception
    when check_violation then
      raise notice 'OK: create_inspection respeita a constraint objetivo_stand_fixo (RF-03)';
  end;
end $$;

do $$
declare v_count int;
begin
  -- RF-05 (autocomplete): confirma que o técnico só enxerga, via select direto em
  -- client_data, os stands das próprias inspeções — a RLS existente (client_data_select,
  -- migration 00008) já é a fonte de verdade para o que Task 7's searchStandContactsAction
  -- pode ler; nada de novo é concedido aqui.
  select count(*) into v_count from public.client_data where nome_solicitante = 'Stand Central';
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico A deveria ver o proprio client_data recem-criado (viu %)', v_count;
  end if;
  raise notice 'OK: create_inspection deixa o stand visivel para autocomplete do proprio tecnico (RF-05)';
end $$;

rollback;
