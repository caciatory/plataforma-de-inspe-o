-- supabase/tests/00049_equipamento_fotos_delete_policy.test.sql
-- Verifies equipamento_fotos DELETE policy grants técnico ownership (editable inspection)
-- and admin write-all access; denies non-owning técnico.

begin;

-- Create a técnico who owns the inspection
insert into auth.users (id, email) values ('49490000-0000-0000-0000-000000000001', 'tecnico-00049-owner@example.com');
insert into public.users (id, nome, email, role) values
  ('49490000-0000-0000-0000-000000000001', 'Técnico 00049 Owner', 'tecnico-00049-owner@example.com', 'tecnico');

-- Create a second técnico who does NOT own the inspection
insert into auth.users (id, email) values ('49490000-0000-0000-0000-000000000002', 'tecnico-00049-other@example.com');
insert into public.users (id, nome, email, role) values
  ('49490000-0000-0000-0000-000000000002', 'Técnico 00049 Other', 'tecnico-00049-other@example.com', 'tecnico');

-- Create an admin user
insert into auth.users (id, email) values ('49490000-0000-0000-0000-000000000003', 'admin-00049@example.com');
insert into public.users (id, nome, email, role) values
  ('49490000-0000-0000-0000-000000000003', 'Admin 00049', 'admin-00049@example.com', 'admin');

set local role authenticated;
set local request.jwt.claim.sub = '49490000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"49490000-0000-0000-0000-000000000001"}';

do $$
declare
  v_inspection_id uuid;
  v_equipamento_inspecao_id uuid;
  v_equipamento_fotos_id uuid;
  v_count int;
begin
  -- Owner creates inspection
  v_inspection_id := public.create_inspection(
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-049',
    p_marca => 'TestMarca',
    p_modelo => 'TestModelo',
    p_nome_solicitante => 'TestCliente',
    p_quilometragem => 50000
  );
  raise notice 'Created inspection % as owner', v_inspection_id;

  -- Create an equipamento_inspecao row
  insert into public.equipamento_inspecao (inspection_id, categoria, nome_equipamento, condicao, ordem)
  values (v_inspection_id, 'interior', 'TestEquipamento', 'bom', 0)
  returning id into v_equipamento_inspecao_id;
  raise notice 'Created equipamento_inspecao %', v_equipamento_inspecao_id;

  -- Create a foto row
  insert into public.equipamento_fotos (inspection_id, equipamento_inspecao_id, url, ordem)
  values (v_inspection_id, v_equipamento_inspecao_id, 'https://example.com/foto1.jpg', 0)
  returning id into v_equipamento_fotos_id;
  raise notice 'Created equipamento_fotos %', v_equipamento_fotos_id;

  -- Owner (tecnico) should be able to delete: inspection is in 'rascunho' status
  delete from public.equipamento_fotos
  where id = v_equipamento_fotos_id;

  select count(*) into v_count from public.equipamento_fotos where id = v_equipamento_fotos_id;
  if v_count <> 0 then
    raise exception 'FALHOU: owner should be able to delete equipamento_fotos row (row still exists)';
  end if;
  raise notice 'OK: owner (tecnico) pode deletar equipamento_fotos em inspeção rascunho';

  -- Recreate the foto row for the non-owner test
  insert into public.equipamento_fotos (id, inspection_id, equipamento_inspecao_id, url, ordem)
  values (v_equipamento_fotos_id, v_inspection_id, v_equipamento_inspecao_id, 'https://example.com/foto1.jpg', 0);
end $$;

-- Now switch to a different técnico (non-owner)
set local role authenticated;
set local request.jwt.claim.sub = '49490000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"49490000-0000-0000-0000-000000000002"}';

do $$
declare
  v_inspection_id uuid;
  v_equipamento_fotos_id uuid;
  v_count_before int;
  v_count_after int;
begin
  -- Fetch the inspection and foto from the first tecnico (which we can't see, but we'll try anyway)
  select id into v_inspection_id from public.inspections where marca = 'TestMarca' limit 1;

  if v_inspection_id is null then
    raise notice 'OK: non-owner cannot see the inspection (as expected by inspections_select policy)';
  else
    select id into v_equipamento_fotos_id from public.equipamento_fotos where inspection_id = v_inspection_id limit 1;

    if v_equipamento_fotos_id is null then
      raise notice 'OK: non-owner cannot see equipamento_fotos (equipment_fotos_select policy prevents access)';
    else
      select count(*) into v_count_before from public.equipamento_fotos where id = v_equipamento_fotos_id;

      delete from public.equipamento_fotos where id = v_equipamento_fotos_id;

      select count(*) into v_count_after from public.equipamento_fotos where id = v_equipamento_fotos_id;

      if v_count_before <> v_count_after then
        raise exception 'FALHOU: non-owner should NOT be able to delete equipamento_fotos (row was deleted)';
      end if;
      raise notice 'OK: non-owner cannot delete equipamento_fotos (RLS blocks delete)';
    end if;
  end if;
end $$;

-- Switch to admin
set local role authenticated;
set local request.jwt.claim.sub = '49490000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"49490000-0000-0000-0000-000000000003"}';

do $$
declare
  v_inspection_id uuid;
  v_equipamento_fotos_id uuid;
  v_count int;
begin
  -- Admin can see and delete any inspection's photos
  select id into v_inspection_id from public.inspections where marca = 'TestMarca' limit 1;

  if v_inspection_id is null then
    raise exception 'FALHOU: admin should see all inspections';
  end if;

  select id into v_equipamento_fotos_id from public.equipamento_fotos where inspection_id = v_inspection_id limit 1;

  if v_equipamento_fotos_id is null then
    raise exception 'FALHOU: admin should see all equipamento_fotos';
  end if;

  delete from public.equipamento_fotos where id = v_equipamento_fotos_id;

  select count(*) into v_count from public.equipamento_fotos where id = v_equipamento_fotos_id;
  if v_count <> 0 then
    raise exception 'FALHOU: admin should be able to delete equipamento_fotos (row still exists)';
  end if;
  raise notice 'OK: admin pode deletar qualquer equipamento_fotos';
end $$;

reset role;
rollback;
