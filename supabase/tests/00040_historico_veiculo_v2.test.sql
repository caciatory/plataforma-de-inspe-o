begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'tecnicoE@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000041', 'Tecnico E', 'tecnicoE@test.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000041';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000041"}';

-- situacao_fiscal_regular agora é texto livre; bloco de importação completo
do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular',
    p_objetivo => 'compra',
    p_matricula => 'EE-55-FF',
    p_marca => 'Renault',
    p_modelo => 'Clio',
    p_nome_solicitante => 'Cliente E',
    p_quilometragem => 30000,
    p_situacao_fiscal_regular => 'IUC pago até 2026',
    p_indicios_adulteracao_presentes => true,
    p_indicios_adulteracao_km => 'Contador com dígitos desalinhados',
    p_veiculo_importado => true,
    p_pais_origem => 'Alemanha',
    p_matricula_origem => 'M-AB 1234',
    p_data_importacao => '2024-03-10',
    p_possui_coc => true,
    p_isencao_isv_aplicada => false,
    p_numero_dav => 'DAV-2024-000123',
    p_data_primeira_matricula => '2019-06-01',
    p_valor_base_iuc_anual => 145.50
  );

  select * into v_row from public.vehicle_data where inspection_id = v_id;

  if v_row.situacao_fiscal_regular <> 'IUC pago até 2026' then
    raise exception 'FALHOU: situacao_fiscal_regular deveria ser texto livre, foi %', v_row.situacao_fiscal_regular;
  end if;
  if v_row.indicios_adulteracao_presentes is not true then
    raise exception 'FALHOU: indicios_adulteracao_presentes deveria ser true';
  end if;
  if v_row.veiculo_importado is not true then
    raise exception 'FALHOU: veiculo_importado deveria ser true';
  end if;
  if v_row.pais_origem <> 'Alemanha' then
    raise exception 'FALHOU: pais_origem incorreto';
  end if;
  if v_row.matricula_origem <> 'M-AB 1234' then
    raise exception 'FALHOU: matricula_origem incorreto, foi %', v_row.matricula_origem;
  end if;
  if v_row.data_importacao <> '2024-03-10' then
    raise exception 'FALHOU: data_importacao incorreta, foi %', v_row.data_importacao;
  end if;
  if v_row.possui_coc is not true then
    raise exception 'FALHOU: possui_coc deveria ser true';
  end if;
  if v_row.isencao_isv_aplicada is not false then
    raise exception 'FALHOU: isencao_isv_aplicada deveria ser false';
  end if;
  if v_row.numero_dav <> 'DAV-2024-000123' then
    raise exception 'FALHOU: numero_dav incorreto, foi %', v_row.numero_dav;
  end if;
  if v_row.data_primeira_matricula <> '2019-06-01' then
    raise exception 'FALHOU: data_primeira_matricula incorreta';
  end if;
  if v_row.valor_base_iuc_anual <> 145.50 then
    raise exception 'FALHOU: valor_base_iuc_anual incorreto, foi %', v_row.valor_base_iuc_anual;
  end if;

  raise notice 'OK: create_inspection grava situacao_fiscal_regular como texto e o bloco de importação';
end $$;

-- defaults: campos novos ficam false/null quando omitidos
do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'FF-66-GG',
    p_marca => 'Peugeot', p_modelo => '208', p_nome_solicitante => 'Cliente F', p_quilometragem => 5000
  );
  select * into v_row from public.vehicle_data where inspection_id = v_id;

  if v_row.indicios_adulteracao_presentes is not false then
    raise exception 'FALHOU: default de indicios_adulteracao_presentes deveria ser false';
  end if;
  if v_row.veiculo_importado is not false then
    raise exception 'FALHOU: default de veiculo_importado deveria ser false';
  end if;
  if v_row.pais_origem is not null then
    raise exception 'FALHOU: pais_origem deveria ficar null quando omitido';
  end if;
  if v_row.matricula_origem is not null then
    raise exception 'FALHOU: matricula_origem deveria ficar null quando omitido';
  end if;
  if v_row.data_importacao is not null then
    raise exception 'FALHOU: data_importacao deveria ficar null quando omitido';
  end if;
  if v_row.possui_coc is not null then
    raise exception 'FALHOU: possui_coc deveria ficar null quando omitido';
  end if;
  if v_row.isencao_isv_aplicada is not null then
    raise exception 'FALHOU: isencao_isv_aplicada deveria ficar null quando omitido';
  end if;
  if v_row.numero_dav is not null then
    raise exception 'FALHOU: numero_dav deveria ficar null quando omitido';
  end if;
  if v_row.situacao_fiscal_regular is not null then
    raise exception 'FALHOU: situacao_fiscal_regular deveria ficar null quando omitido';
  end if;

  raise notice 'OK: defaults dos novos campos aplicados quando omitidos';
end $$;

-- regressão: parâmetros dos recortes anteriores (Histórico v1 + Equipamentos) continuam funcionando juntos
do $$
declare
  v_id uuid;
  v_row public.vehicle_data%rowtype;
  v_equip_count int;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'GG-77-HH',
    p_marca => 'Opel', p_modelo => 'Corsa', p_nome_solicitante => 'Cliente G', p_quilometragem => 12000,
    p_numero_proprietarios_anteriores => 1,
    p_historico_manutencao => 'Revisões em dia',
    p_equipamentos => '[{"ordem":0,"categoria":"seguranca","nome_equipamento":"Airbags","condicao":"bom","comentario":null,"personalizado":false}]'::jsonb
  );

  select * into v_row from public.vehicle_data where inspection_id = v_id;
  select count(*) into v_equip_count from public.equipamento_inspecao where inspection_id = v_id;

  if v_row.numero_proprietarios_anteriores <> 1 then
    raise exception 'FALHOU: numero_proprietarios_anteriores (recorte 3 v1) deveria continuar funcionando';
  end if;
  if v_equip_count <> 1 then
    raise exception 'FALHOU: p_equipamentos (recorte 3) deveria continuar inserindo em equipamento_inspecao';
  end if;

  raise notice 'OK: parâmetros de recortes anteriores continuam funcionando após 00040';
end $$;

-- situacao_fiscal_observacoes não existe mais
do $$
begin
  perform column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicle_data' and column_name = 'situacao_fiscal_observacoes';
  if found then
    raise exception 'FALHOU: situacao_fiscal_observacoes deveria ter sido removida';
  end if;
  raise notice 'OK: situacao_fiscal_observacoes removida de vehicle_data';
end $$;

rollback;
