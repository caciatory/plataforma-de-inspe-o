-- supabase/migrations/00040_historico_veiculo_v2.sql
-- Ajustes pós recorte 3 — ver docs/superpowers/specs/2026-07-30-historico-equipamentos-ajustes-design.md §2

alter table public.vehicle_data
  alter column situacao_fiscal_regular type text
    using (case when situacao_fiscal_regular then 'Sim' else '' end),
  alter column situacao_fiscal_regular drop not null,
  alter column situacao_fiscal_regular drop default,
  drop column situacao_fiscal_observacoes,
  add column indicios_adulteracao_presentes boolean not null default false,
  add column veiculo_importado boolean not null default false,
  add column pais_origem text,
  add column matricula_origem text,
  add column data_importacao date,
  add column possui_coc boolean,
  add column isencao_isv_aplicada boolean,
  add column numero_dav text,
  add column data_primeira_matricula date,
  add column valor_base_iuc_anual numeric;

drop function public.create_inspection(
  public.tipo_cliente, public.objetivo_inspecao, text, text, text, text,
  int, text, int, int, text, text, text, int, text, text, text, int, numeric,
  text, text, text, text, int, text, text, text, date, boolean, text, jsonb
);

create function public.create_inspection(
  p_tipo_cliente public.tipo_cliente,
  p_objetivo public.objetivo_inspecao,
  p_matricula text,
  p_marca text,
  p_modelo text,
  p_nome_solicitante text,
  p_quilometragem int,
  p_versao_trim text default null,
  p_ano_fabrico int default null,
  p_ano_modelo int default null,
  p_cor text default null,
  p_vin text default null,
  p_numero_motor text default null,
  p_numero_portas int default null,
  p_combustivel text default null,
  p_caixa_velocidades text default null,
  p_tracao text default null,
  p_potencia_cv int default null,
  p_torque_nm numeric default null,
  p_contacto text default null,
  p_email text default null,
  p_responsavel_presente text default null,
  p_indicios_adulteracao_km text default null,
  p_numero_proprietarios_anteriores int default null,
  p_registo_acidentes_anteriores text default null,
  p_historico_manutencao text default null,
  p_inspecoes_periodicas_ipo_notas text default null,
  p_inspecoes_periodicas_ipo_data date default null,
  p_situacao_fiscal_regular text default null,
  p_equipamentos jsonb default '[]'::jsonb,
  p_indicios_adulteracao_presentes boolean default false,
  p_veiculo_importado boolean default false,
  p_pais_origem text default null,
  p_matricula_origem text default null,
  p_data_importacao date default null,
  p_possui_coc boolean default null,
  p_isencao_isv_aplicada boolean default null,
  p_numero_dav text default null,
  p_data_primeira_matricula date default null,
  p_valor_base_iuc_anual numeric default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_inspection_id uuid;
  v_equip jsonb;
begin
  insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
  values ((select auth.uid()), p_tipo_cliente, p_objetivo)
  returning id into v_inspection_id;

  insert into public.vehicle_data (
    inspection_id, matricula, marca, modelo, versao_trim, ano_fabrico, ano_modelo,
    cor, vin, numero_motor, numero_portas, combustivel, caixa_velocidades, tracao,
    potencia_cv, torque_nm, quilometragem,
    indicios_adulteracao_km, numero_proprietarios_anteriores, registo_acidentes_anteriores,
    historico_manutencao, inspecoes_periodicas_ipo_notas, inspecoes_periodicas_ipo_data,
    situacao_fiscal_regular,
    indicios_adulteracao_presentes, veiculo_importado, pais_origem, matricula_origem,
    data_importacao, possui_coc, isencao_isv_aplicada, numero_dav,
    data_primeira_matricula, valor_base_iuc_anual
  ) values (
    v_inspection_id, p_matricula, p_marca, p_modelo, p_versao_trim, p_ano_fabrico, p_ano_modelo,
    p_cor, p_vin, p_numero_motor, p_numero_portas, p_combustivel, p_caixa_velocidades, p_tracao,
    p_potencia_cv, p_torque_nm, p_quilometragem,
    p_indicios_adulteracao_km, p_numero_proprietarios_anteriores, p_registo_acidentes_anteriores,
    p_historico_manutencao, p_inspecoes_periodicas_ipo_notas, p_inspecoes_periodicas_ipo_data,
    p_situacao_fiscal_regular,
    p_indicios_adulteracao_presentes, p_veiculo_importado, p_pais_origem, p_matricula_origem,
    p_data_importacao, p_possui_coc, p_isencao_isv_aplicada, p_numero_dav,
    p_data_primeira_matricula, p_valor_base_iuc_anual
  );

  insert into public.client_data (
    inspection_id, nome_solicitante, tipo, contacto, email, responsavel_presente
  ) values (
    v_inspection_id, p_nome_solicitante, p_tipo_cliente, p_contacto, p_email, p_responsavel_presente
  );

  for v_equip in select * from jsonb_array_elements(p_equipamentos)
  loop
    insert into public.equipamento_inspecao (
      inspection_id, categoria, nome_equipamento, condicao, comentario, ordem
    ) values (
      v_inspection_id,
      v_equip->>'categoria',
      v_equip->>'nome_equipamento',
      v_equip->>'condicao',
      v_equip->>'comentario',
      (v_equip->>'ordem')::int
    );

    if (v_equip->>'personalizado')::boolean then
      insert into public.equipamento_sugestoes (categoria, nome)
      values (v_equip->>'categoria', v_equip->>'nome_equipamento')
      on conflict (lower(categoria), lower(nome)) do nothing;
    end if;
  end loop;

  return v_inspection_id;
end;
$$;
