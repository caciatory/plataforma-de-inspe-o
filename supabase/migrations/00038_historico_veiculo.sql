-- supabase/migrations/00038_historico_veiculo.sql
-- Peça 3, recorte 3 — campos da aba Histórico. `quilometragem` já existe
-- (migração 00019); só muda de aba na UI, não de coluna.
-- Design: docs/superpowers/specs/2026-07-28-peca3-recorte3-historico-equipamentos-design.md §3

alter table public.vehicle_data
  add column indicios_adulteracao_km text,
  add column numero_proprietarios_anteriores int,
  add column registo_acidentes_anteriores text,
  add column historico_manutencao text,
  add column inspecoes_periodicas_ipo_notas text,
  add column inspecoes_periodicas_ipo_data date,
  add column situacao_fiscal_regular boolean not null default false,
  add column situacao_fiscal_observacoes text,
  add constraint numero_proprietarios_nao_negativo
    check (numero_proprietarios_anteriores is null or numero_proprietarios_anteriores >= 0);

drop function public.create_inspection(
  public.tipo_cliente, public.objetivo_inspecao, text, text, text, text,
  int, text, int, int, text, text, text, int, text, text, text, int, numeric,
  text, text, text
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
  p_situacao_fiscal_regular boolean default false,
  p_situacao_fiscal_observacoes text default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_inspection_id uuid;
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
    situacao_fiscal_regular, situacao_fiscal_observacoes
  ) values (
    v_inspection_id, p_matricula, p_marca, p_modelo, p_versao_trim, p_ano_fabrico, p_ano_modelo,
    p_cor, p_vin, p_numero_motor, p_numero_portas, p_combustivel, p_caixa_velocidades, p_tracao,
    p_potencia_cv, p_torque_nm, p_quilometragem,
    p_indicios_adulteracao_km, p_numero_proprietarios_anteriores, p_registo_acidentes_anteriores,
    p_historico_manutencao, p_inspecoes_periodicas_ipo_notas, p_inspecoes_periodicas_ipo_data,
    p_situacao_fiscal_regular, p_situacao_fiscal_observacoes
  );

  insert into public.client_data (
    inspection_id, nome_solicitante, tipo, contacto, email, responsavel_presente
  ) values (
    v_inspection_id, p_nome_solicitante, p_tipo_cliente, p_contacto, p_email, p_responsavel_presente
  );

  return v_inspection_id;
end;
$$;
