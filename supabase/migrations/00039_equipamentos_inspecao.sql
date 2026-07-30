-- supabase/migrations/00039_equipamentos_inspecao.sql
-- Peça 3, recorte 3 — aba Equipamentos.
-- Design: docs/superpowers/specs/2026-07-28-peca3-recorte3-historico-equipamentos-design.md §4

create table public.equipamento_sugestoes (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  nome text not null,
  criado_em timestamptz not null default now()
);

create unique index equipamento_sugestoes_categoria_nome_uidx
  on public.equipamento_sugestoes (lower(categoria), lower(nome));

create table public.equipamento_inspecao (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  categoria text not null,
  nome_equipamento text not null,
  condicao text not null check (condicao in ('bom', 'atencao')),
  comentario text,
  ordem int not null,
  criado_em timestamptz not null default now()
);

create index on public.equipamento_inspecao (inspection_id);

-- inspection_id duplicado aqui (em vez de só via join a equipamento_inspecao)
-- pelo mesmo motivo de public.photos: mantém a policy de insert simples,
-- sem subquery.
create table public.equipamento_fotos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  equipamento_inspecao_id uuid not null references public.equipamento_inspecao(id) on delete cascade,
  url text not null,
  ordem int,
  criado_em timestamptz not null default now()
);

create index on public.equipamento_fotos (equipamento_inspecao_id);

alter table public.equipamento_sugestoes enable row level security;

create policy equipamento_sugestoes_select on public.equipamento_sugestoes
  for select to authenticated
  using (true);

create policy equipamento_sugestoes_insert on public.equipamento_sugestoes
  for insert to authenticated
  with check (true);

alter table public.equipamento_inspecao enable row level security;

create policy equipamento_inspecao_select on public.equipamento_inspecao
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy equipamento_inspecao_insert on public.equipamento_inspecao
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

alter table public.equipamento_fotos enable row level security;

create policy equipamento_fotos_select on public.equipamento_fotos
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy equipamento_fotos_insert on public.equipamento_fotos
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

drop function public.create_inspection(
  public.tipo_cliente, public.objetivo_inspecao, text, text, text, text,
  int, text, int, int, text, text, text, int, text, text, text, int, numeric,
  text, text, text, text, int, text, text, text, date, boolean, text
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
  p_situacao_fiscal_observacoes text default null,
  p_equipamentos jsonb default '[]'::jsonb
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
