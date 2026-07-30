-- supabase/tests/00038_historico_veiculo.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'tecnicoB@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000031', 'Tecnico B', 'tecnicoB@test.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000031';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000031"}';

do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular',
    p_objetivo => 'compra',
    p_matricula => 'BB-22-CC',
    p_marca => 'Honda',
    p_modelo => 'Civic',
    p_nome_solicitante => 'Cliente B',
    p_quilometragem => 80000,
    p_indicios_adulteracao_km => 'Contador com dígitos desalinhados',
    p_numero_proprietarios_anteriores => 2,
    p_registo_acidentes_anteriores => 'Colisão traseira em 2022, reparada',
    p_historico_manutencao => 'Revisão dos 60.000km em concessionário',
    p_inspecoes_periodicas_ipo_notas => 'IPO válida',
    p_inspecoes_periodicas_ipo_data => '2027-01-15',
    p_situacao_fiscal_regular => true,
    p_situacao_fiscal_observacoes => 'IUC pago'
  );

  select * into v_row from public.vehicle_data where inspection_id = v_id;

  if v_row.quilometragem <> 80000 then
    raise exception 'FALHOU: quilometragem deveria ser 80000, foi %', v_row.quilometragem;
  end if;
  if v_row.numero_proprietarios_anteriores <> 2 then
    raise exception 'FALHOU: numero_proprietarios_anteriores deveria ser 2, foi %', v_row.numero_proprietarios_anteriores;
  end if;
  if v_row.situacao_fiscal_regular is not true then
    raise exception 'FALHOU: situacao_fiscal_regular deveria ser true';
  end if;
  if v_row.indicios_adulteracao_km <> 'Contador com dígitos desalinhados' then
    raise exception 'FALHOU: indicios_adulteracao_km incorreto';
  end if;

  raise notice 'OK: create_inspection grava os campos de historico';
end $$;

-- default: situacao_fiscal_regular fica false quando omitido, resto null
do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'CC-33-DD',
    p_marca => 'Fiat', p_modelo => 'Punto', p_nome_solicitante => 'Cliente C', p_quilometragem => 1000
  );
  select * into v_row from public.vehicle_data where inspection_id = v_id;
  if v_row.situacao_fiscal_regular is not false then
    raise exception 'FALHOU: default de situacao_fiscal_regular deveria ser false';
  end if;
  if v_row.numero_proprietarios_anteriores is not null then
    raise exception 'FALHOU: numero_proprietarios_anteriores deveria ficar null quando omitido';
  end if;
  raise notice 'OK: defaults de historico aplicados quando campos omitidos';
end $$;

-- constraint: numero_proprietarios_anteriores negativo falha
do $$
begin
  begin
    perform public.create_inspection(
      p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'DD-44-EE',
      p_marca => 'Seat', p_modelo => 'Ibiza', p_nome_solicitante => 'Cliente D', p_quilometragem => 1000,
      p_numero_proprietarios_anteriores => -1
    );
    raise exception 'FALHOU: deveria ter rejeitado numero_proprietarios_anteriores negativo';
  exception
    when check_violation then
      raise notice 'OK: numero_proprietarios_anteriores negativo rejeitado pela constraint';
  end;
end $$;

rollback;
