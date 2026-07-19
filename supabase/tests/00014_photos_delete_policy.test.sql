-- supabase/tests/00014_photos_delete_policy.test.sql
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
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'aguardando_aprovacao', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 904, 'Grupo Teste');
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item A', 'padrao');

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021');

insert into public.photos (id, inspection_id, item_response_id, contexto, url) values
  ('00000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000060', 'item', 'https://example.com/foto-editavel.jpg'),
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000061', 'item', 'https://example.com/foto-nao-editavel.jpg');
insert into public.photos (id, inspection_id, item_response_id, contexto, ordem, url) values
  ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000010', null, 'capa', 1, 'https://example.com/foto-capa.jpg');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
declare v_rows int;
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000071';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria remover foto de inspecao fora de rascunho/devolvida';
  end if;
  raise notice 'OK: delete bloqueado em foto de inspecao nao editavel';
end $$;

do $$
declare v_rows int;
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000072';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria remover foto de capa';
  end if;
  raise notice 'OK: delete bloqueado em foto de capa para tecnico';
end $$;

do $$
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000070';
  if not found then
    raise exception 'FALHOU: tecnico deveria remover a propria foto de item em inspecao editavel';
  end if;
  raise notice 'OK: tecnico remove a propria foto de item em inspecao editavel';
end $$;

-- simulate tecnico 2 (isolation)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

do $$
declare v_rows int;
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000072';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico2 nao deveria remover foto de outro tecnico';
  end if;
  raise notice 'OK: tecnico2 nao remove foto de outro tecnico (isolamento)';
end $$;

-- simulate admin
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000071';
  if not found then
    raise exception 'FALHOU: admin deveria remover qualquer foto';
  end if;
  raise notice 'OK: admin remove foto de qualquer inspecao/status';
end $$;

do $$
begin
  delete from public.photos where id = '00000000-0000-0000-0000-000000000072';
  if not found then
    raise exception 'FALHOU: admin deveria remover foto de capa';
  end if;
  raise notice 'OK: admin remove foto de capa';
end $$;

reset role;
rollback;
