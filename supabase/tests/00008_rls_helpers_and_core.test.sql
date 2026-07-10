begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000002', 'tecnico2@test.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin1@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000002', 'Tecnico Dois', 'tecnico2@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000003', 'Admin Um', 'admin1@test.com', 'admin');

insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'aguardando_aprovacao', 'particular', 'compra');

insert into public.vehicle_data (inspection_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-000000000010', 'AA-00-BB', 'Toyota', 'Corolla');

insert into public.client_data (inspection_id, nome_solicitante, tipo) values
  ('00000000-0000-0000-0000-000000000010', 'Cliente Teste', 'particular');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.inspections;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ver so a propria inspecao (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve apenas a propria inspecao';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.users;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ver so a propria linha em users (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve apenas a propria linha em users';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.vehicle_data;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ver vehicle_data da propria inspecao (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve vehicle_data da propria inspecao via owns_inspection';
end $$;

do $$
begin
  update public.inspections set nota_geral = 8.5
    where id = '00000000-0000-0000-0000-000000000010';
  if not found then
    raise exception 'FALHOU: tecnico deveria poder editar inspecao propria em rascunho';
  end if;
  raise notice 'OK: tecnico edita inspecao propria em rascunho';
end $$;

do $$
declare v_rows int;
begin
  update public.inspections set nota_geral = 8.5
    where id = '00000000-0000-0000-0000-000000000011';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria enxergar/editar inspecao de outro tecnico';
  end if;
  raise notice 'OK: update em inspecao de outro tecnico afeta 0 linhas';
end $$;

do $$
begin
  begin
    insert into public.inspections (tecnico_id, tipo_cliente, objetivo)
      values ('00000000-0000-0000-0000-000000000002', 'particular', 'compra');
    raise exception 'FALHOU: tecnico nao deveria inserir inspecao com tecnico_id de outro tecnico';
  exception when insufficient_privilege then
    raise notice 'OK: insert com tecnico_id de outro tecnico bloqueado pela RLS';
  end;
end $$;

-- simulate tecnico 2 (owns the non-editable inspection)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

do $$
declare v_rows int;
begin
  update public.inspections set nota_geral = 5
    where id = '00000000-0000-0000-0000-000000000011';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico2 nao deveria editar a propria inspecao fora de rascunho/devolvida';
  end if;
  raise notice 'OK: tecnico nao edita a propria inspecao em aguardando_aprovacao';
end $$;

-- simulate admin
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.inspections;
  if v_count <> 2 then
    raise exception 'FALHOU: admin deveria ver todas as inspecoes (viu %)', v_count;
  end if;
  raise notice 'OK: admin ve todas as inspecoes';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.users;
  if v_count <> 3 then
    raise exception 'FALHOU: admin deveria ver todas as linhas de users (viu %)', v_count;
  end if;
  raise notice 'OK: admin ve todas as linhas de users';
end $$;

do $$
begin
  update public.inspections set nota_geral = 9
    where id = '00000000-0000-0000-0000-000000000011';
  if not found then
    raise exception 'FALHOU: admin deveria poder editar qualquer inspecao';
  end if;
  raise notice 'OK: admin edita inspecao em qualquer status';
end $$;

reset role;
rollback;
