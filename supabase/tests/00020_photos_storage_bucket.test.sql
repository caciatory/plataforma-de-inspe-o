begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000002', 'tecnico2@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000002', 'Tecnico Dois', 'tecnico2@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'aprovada', 'particular', 'compra');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
begin
  insert into storage.objects (bucket_id, name)
    values ('fotos-inspecao', '00000000-0000-0000-0000-000000000010/item-x/foto.jpg');
  raise notice 'OK: tecnico dono de inspecao rascunho consegue subir foto';
end $$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('fotos-inspecao', '00000000-0000-0000-0000-000000000011/item-x/foto.jpg');
    raise exception 'FALHOU: deveria ter bloqueado upload em inspecao aprovada (nao editavel)';
  exception when insufficient_privilege then
    raise notice 'OK: upload bloqueado em inspecao nao editavel';
  end;
end $$;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('fotos-inspecao', '00000000-0000-0000-0000-000000000010/item-x/foto.jpg');
    raise exception 'FALHOU: deveria ter bloqueado upload de tecnico que nao e dono da inspecao';
  exception when insufficient_privilege then
    raise notice 'OK: upload bloqueado pra tecnico que nao e dono';
  end;
end $$;

rollback;
