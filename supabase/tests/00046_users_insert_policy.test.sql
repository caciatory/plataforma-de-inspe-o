-- supabase/tests/00046_users_insert_policy.test.sql
-- Cobre a policy users_insert (00046): admin pode inserir uma nova linha em
-- public.users (fluxo de criação de técnico via createTecnicoAction);
-- tecnico nao pode inserir nenhuma linha em public.users, nem a propria.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin1@test.com'),
  -- ids referenced only by the public.users inserts below (auth.admin.createUser's
  -- auth.users row, which createTecnicoAction always creates first)
  ('00000000-0000-0000-0000-000000000004', 'tecnico2@test.com'),
  ('00000000-0000-0000-0000-000000000005', 'tecnico3@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000003', 'Admin Um', 'admin1@test.com', 'admin');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
begin
  begin
    insert into public.users (id, nome, email, role) values
      ('00000000-0000-0000-0000-000000000004', 'Tecnico Novo', 'tecnico2@test.com', 'tecnico');
    raise exception 'FALHOU: tecnico nao deveria conseguir inserir em public.users';
  exception when insufficient_privilege then
    raise notice 'OK: tecnico bloqueado ao tentar inserir em public.users';
  end;
end $$;

-- simulate admin
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
declare v_count int;
begin
  insert into public.users (id, nome, email, role) values
    ('00000000-0000-0000-0000-000000000005', 'Tecnico Criado Por Admin', 'tecnico3@test.com', 'tecnico');
  select count(*) into v_count from public.users where id = '00000000-0000-0000-0000-000000000005';
  if v_count <> 1 then
    raise exception 'FALHOU: admin deveria poder inserir novo usuario em public.users';
  end if;
  raise notice 'OK: admin insere novo usuario em public.users (criacao de tecnico)';
end $$;

reset role;
rollback;
