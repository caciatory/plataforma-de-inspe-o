-- supabase/tests/00003_checklist_responses_media.test.sql
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tecnico@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Técnico Teste', 'tecnico@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'particular', 'compra');
insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Exterior');
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', 'Vidro dianteiro esquerdo', 'padrao');

-- status derivado: sem classificacao -> pendente
insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000030');
do $$
declare v_status item_status;
begin
  select status into v_status from public.checklist_item_responses where id = '00000000-0000-0000-0000-000000000040';
  if v_status <> 'pendente' then raise exception 'FALHOU: esperava pendente, veio %', v_status; end if;
  raise notice 'OK: status derivado = pendente sem classificacao';
end $$;

-- status derivado: classificacao=NF -> status=NF
update public.checklist_item_responses set classificacao = 'NF' where id = '00000000-0000-0000-0000-000000000040';
do $$
declare v_status item_status;
begin
  select status into v_status from public.checklist_item_responses where id = '00000000-0000-0000-0000-000000000040';
  if v_status <> 'NF' then raise exception 'FALHOU: esperava NF, veio %', v_status; end if;
  raise notice 'OK: status derivado = NF quando classificacao=NF';
end $$;

-- foto de item SEM item_response_id deve falhar
do $$
begin
  begin
    insert into public.photos (inspection_id, contexto, url) values
      ('00000000-0000-0000-0000-000000000010', 'item', 'https://x/foto.jpg');
    raise exception 'FALHOU: deveria ter bloqueado foto contexto=item sem item_response_id';
  exception when check_violation then
    raise notice 'OK: photo_contexto_coerente bloqueou item sem item_response_id';
  end;
end $$;

-- foto de capa com item_response_id preenchido deve falhar
do $$
begin
  begin
    insert into public.photos (inspection_id, item_response_id, contexto, url) values
      ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000040', 'capa', 'https://x/capa.jpg');
    raise exception 'FALHOU: deveria ter bloqueado foto contexto=capa com item_response_id';
  exception when check_violation then
    raise notice 'OK: photo_contexto_coerente bloqueou capa com item_response_id';
  end;
end $$;

rollback;
