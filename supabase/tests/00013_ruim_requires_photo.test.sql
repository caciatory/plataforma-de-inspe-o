-- supabase/tests/00013_ruim_requires_photo.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Grupo Teste');
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item A', 'padrao'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item B', 'padrao');

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022');

-- Cenario A (modo deferred, o default): marcar ruim e anexar a foto na mesma
-- transacao nao deve bloquear no meio do caminho, e deve passar quando a
-- constraint e forcada a checar.
do $$
begin
  update public.checklist_item_responses set classificacao = 'ruim'
    where id = '00000000-0000-0000-0000-000000000060';
  insert into public.photos (inspection_id, item_response_id, contexto, url)
    values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000060', 'item', 'https://example.com/foto-ruim.jpg');
  execute 'set constraints all immediate';
  raise notice 'OK: ruim com foto na mesma transacao passa quando a constraint deferrable e checada';
exception when check_violation then
  raise exception 'FALHOU: ruim com foto nao deveria ter bloqueado';
end $$;

-- A partir daqui a sessao esta em modo IMMEDIATE (SET CONSTRAINTS afeta o resto
-- da transacao) -- os cenarios B/C/D testam diretamente, sem precisar forcar de novo.

-- Cenario B: marcar ruim sem nenhuma foto deve bloquear.
do $$
begin
  begin
    update public.checklist_item_responses set classificacao = 'ruim'
      where id = '00000000-0000-0000-0000-000000000061';
    raise exception 'FALHOU: deveria ter bloqueado ruim sem foto';
  exception when check_violation then
    raise notice 'OK: ruim sem foto bloqueado';
  end;
end $$;

-- Cenario C: remover a unica foto de um item que continua ruim deve bloquear.
do $$
begin
  begin
    delete from public.photos
      where item_response_id = '00000000-0000-0000-0000-000000000060' and contexto = 'item';
    raise exception 'FALHOU: deveria ter bloqueado remover a unica foto de item ruim';
  exception when check_violation then
    raise notice 'OK: remover a unica foto de item ruim bloqueado';
  end;
end $$;

-- Cenario D: mudar a classificacao para longe de 'ruim' libera a remocao da foto.
do $$
begin
  update public.checklist_item_responses set classificacao = 'medio'
    where id = '00000000-0000-0000-0000-000000000060';
  delete from public.photos
    where item_response_id = '00000000-0000-0000-0000-000000000060' and contexto = 'item';
  raise notice 'OK: apos mudar classificacao para nao-ruim, remover a foto e permitido';
end $$;

rollback;
