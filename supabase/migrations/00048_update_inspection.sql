-- supabase/migrations/00048_update_inspection.sql
-- Ver docs/superpowers/specs/2026-08-10-remocao-duplicacao-identificacao-historico-design.md §3.3
-- Mirrors create_inspection (00040_historico_veiculo_v2.sql) but UPDATEs
-- vehicle_data/client_data instead of inserting, and reconciles equipamento_inspecao:
-- an element with `id` in p_equipamentos is an UPDATE to an existing row, an element
-- without `id` is a new INSERT, and every id in p_equipamentos_removidos is DELETEd
-- (equipamento_fotos cascades automatically — see Global Constraints).

create function public.update_inspection(
  p_inspection_id uuid,
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
  p_indicios_adulteracao_presentes boolean default false,
  p_veiculo_importado boolean default false,
  p_pais_origem text default null,
  p_matricula_origem text default null,
  p_data_importacao date default null,
  p_possui_coc boolean default null,
  p_isencao_isv_aplicada boolean default null,
  p_numero_dav text default null,
  p_data_primeira_matricula date default null,
  p_valor_base_iuc_anual numeric default null,
  p_equipamentos jsonb default '[]'::jsonb,
  p_equipamentos_removidos jsonb default '[]'::jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_equip jsonb;
  v_id uuid;
begin
  update public.inspections
  set tipo_cliente = p_tipo_cliente, objetivo = p_objetivo
  where id = p_inspection_id;

  update public.vehicle_data set
    matricula = p_matricula, marca = p_marca, modelo = p_modelo, versao_trim = p_versao_trim,
    ano_fabrico = p_ano_fabrico, ano_modelo = p_ano_modelo, cor = p_cor, vin = p_vin,
    numero_motor = p_numero_motor, numero_portas = p_numero_portas, combustivel = p_combustivel,
    caixa_velocidades = p_caixa_velocidades, tracao = p_tracao, potencia_cv = p_potencia_cv,
    torque_nm = p_torque_nm, quilometragem = p_quilometragem,
    indicios_adulteracao_km = p_indicios_adulteracao_km,
    numero_proprietarios_anteriores = p_numero_proprietarios_anteriores,
    registo_acidentes_anteriores = p_registo_acidentes_anteriores,
    historico_manutencao = p_historico_manutencao,
    inspecoes_periodicas_ipo_notas = p_inspecoes_periodicas_ipo_notas,
    inspecoes_periodicas_ipo_data = p_inspecoes_periodicas_ipo_data,
    situacao_fiscal_regular = p_situacao_fiscal_regular,
    indicios_adulteracao_presentes = p_indicios_adulteracao_presentes,
    veiculo_importado = p_veiculo_importado, pais_origem = p_pais_origem,
    matricula_origem = p_matricula_origem, data_importacao = p_data_importacao,
    possui_coc = p_possui_coc, isencao_isv_aplicada = p_isencao_isv_aplicada,
    numero_dav = p_numero_dav, data_primeira_matricula = p_data_primeira_matricula,
    valor_base_iuc_anual = p_valor_base_iuc_anual
  where inspection_id = p_inspection_id;

  update public.client_data set
    nome_solicitante = p_nome_solicitante, tipo = p_tipo_cliente, contacto = p_contacto,
    email = p_email, responsavel_presente = p_responsavel_presente
  where inspection_id = p_inspection_id;

  for v_equip in select * from jsonb_array_elements(p_equipamentos)
  loop
    if v_equip ? 'id' then
      update public.equipamento_inspecao set
        categoria = v_equip->>'categoria',
        nome_equipamento = v_equip->>'nome_equipamento',
        condicao = v_equip->>'condicao',
        comentario = v_equip->>'comentario',
        ordem = (v_equip->>'ordem')::int
      where id = (v_equip->>'id')::uuid and inspection_id = p_inspection_id;
    else
      insert into public.equipamento_inspecao (
        inspection_id, categoria, nome_equipamento, condicao, comentario, ordem
      ) values (
        p_inspection_id, v_equip->>'categoria', v_equip->>'nome_equipamento',
        v_equip->>'condicao', v_equip->>'comentario', (v_equip->>'ordem')::int
      );
    end if;

    if (v_equip->>'personalizado')::boolean then
      insert into public.equipamento_sugestoes (categoria, nome)
      values (v_equip->>'categoria', v_equip->>'nome_equipamento')
      on conflict (lower(categoria), lower(nome)) do nothing;
    end if;
  end loop;

  for v_id in select (jsonb_array_elements_text(p_equipamentos_removidos))::uuid
  loop
    delete from public.equipamento_inspecao
    where id = v_id and inspection_id = p_inspection_id;
  end loop;
end;
$$;

-- RLS policies for equipamento_inspecao UPDATE and DELETE (required by update_inspection RPC).
-- These policies were missing from 00039_equipamentos_inspecao.sql, causing silent no-op on
-- equipamento reconciliation for non-admin users (RLS default-deny without matching policy).
create policy equipamento_inspecao_update on public.equipamento_inspecao
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id))
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

create policy equipamento_inspecao_delete on public.equipamento_inspecao
  for delete to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id));
