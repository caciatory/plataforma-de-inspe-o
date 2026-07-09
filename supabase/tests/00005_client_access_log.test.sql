-- supabase/tests/00005_client_access_log.test.sql
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tecnico@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Técnico Teste', 'tecnico@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'particular', 'compra');

insert into public.client_access_logs (inspection_id, email, origem) values
  ('00000000-0000-0000-0000-000000000010', 'cliente@example.com', 'whatsapp');

do $$
declare v_count int;
begin
  select count(*) into v_count from public.client_access_logs
    where inspection_id = '00000000-0000-0000-0000-000000000010';
  if v_count <> 1 then raise exception 'FALHOU: esperava 1 registro de acesso, veio %', v_count; end if;
  raise notice 'OK: client_access_logs grava acesso do cliente';
end $$;

rollback;
