-- supabase/tests/00052_relatorio_parceiro.test.sql
-- Cobre a migration 00052: colunas de parceiro sao escritas via a policy
-- inspections_update ja existente (00008), sem policy nova. Confirma que
-- admin escreve mesmo com a inspecao ja aprovada (nao editavel) e que um
-- tecnico nao-admin continua bloqueado.

begin;

insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'admin-00052@example.com');
insert into public.users (id, nome, email, role) values
  ('44444444-4444-4444-4444-444444444444', 'Admin 00052', 'admin-00052@example.com', 'admin');

insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'tecnico-00052@example.com');
insert into public.users (id, nome, email, role) values
  ('55555555-5555-5555-5555-555555555555', 'Tecnico 00052', 'tecnico-00052@example.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

do $$
declare
  v_inspection_id uuid;
begin
  v_inspection_id := public.create_inspection(
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-052',
    p_marca => 'Marca',
    p_modelo => 'Modelo',
    p_nome_solicitante => 'Cliente',
    p_quilometragem => 1000
  );
  perform set_config('test.inspection_id', v_inspection_id::text, true);
end $$;

reset role;

set local role authenticated;
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';

do $$
declare
  v_inspection_id uuid := current_setting('test.inspection_id')::uuid;
  v_nome text;
begin
  -- admin aprova (bypassa o trigger de transicao, 00045) e escreve parceiro_* na mesma chamada
  update public.inspections
  set status = 'aprovada', parceiro_nome = 'Stand Central', parceiro_telefone = '351912345678'
  where id = v_inspection_id;

  select parceiro_nome into v_nome from public.inspections where id = v_inspection_id;
  if v_nome <> 'Stand Central' then
    raise exception 'FALHOU: admin nao conseguiu escrever parceiro_nome numa inspecao aprovada';
  end if;
  raise notice 'OK: admin aprova e escreve parceiro_* na mesma inspecao (sem policy nova)';
end $$;

reset role;

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

do $$
declare
  v_inspection_id uuid := current_setting('test.inspection_id')::uuid;
  v_count int;
begin
  update public.inspections set parceiro_nome = 'Tentativa Tecnico' where id = v_inspection_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico nao-admin conseguiu escrever parceiro_nome em inspecao aprovada';
  end if;
  raise notice 'OK: tecnico nao-admin bloqueado (0 linhas) ao tentar escrever parceiro_* em inspecao aprovada';
end $$;

reset role;
rollback;
