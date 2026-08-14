-- supabase/tests/00053_acesso_cliente_publico.test.sql
-- Cobre a migration 00053: get_relatorio_publico so devolve dados de
-- inspecao aprovada, nunca inclui client_data (nao ha coluna client_data no
-- retorno pois a funcao nunca faz join com essa tabela), e as policies
-- novas de client_access_logs (anon insere, nao le; admin le).

begin;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'tecnico-00053@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'admin-00053@example.com');
insert into public.users (id, nome, email, role) values
  ('11111111-1111-1111-1111-111111111111', 'Tecnico 00053', 'tecnico-00053@example.com', 'tecnico'),
  ('22222222-2222-2222-2222-222222222222', 'Admin 00053', 'admin-00053@example.com', 'admin');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

do $$
declare
  v_inspection_id uuid;
begin
  v_inspection_id := public.create_inspection(
    p_tipo_cliente => 'particular'::public.tipo_cliente,
    p_objetivo => 'compra'::public.objetivo_inspecao,
    p_matricula => 'AA-00-053',
    p_marca => 'Marca 053',
    p_modelo => 'Modelo 053',
    p_nome_solicitante => 'Cliente Sensível 053',
    p_quilometragem => 1000
  );
  perform set_config('acesso_cliente_053.inspection_id', v_inspection_id::text, false);
end $$;

reset role;

do $$
declare
  v_inspection_id uuid := current_setting('acesso_cliente_053.inspection_id')::uuid;
  v_resultado jsonb;
begin
  -- ainda 'rascunho': get_relatorio_publico nao deve devolver nada mesmo
  -- com codigo certo, porque a inspecao nao esta aprovada.
  update public.inspections set codigo_certificado = 'TESTE0053' where id = v_inspection_id;

  set local role anon;
  v_resultado := public.get_relatorio_publico('TESTE0053');
  if v_resultado is not null then
    raise exception 'FALHOU: get_relatorio_publico devolveu dados de inspecao nao aprovada';
  end if;
  raise notice 'OK: get_relatorio_publico bloqueia inspecao nao aprovada';

  v_resultado := public.get_relatorio_publico('CODIGOINEXISTENTE');
  if v_resultado is not null then
    raise exception 'FALHOU: get_relatorio_publico devolveu dados pra codigo inexistente';
  end if;
  raise notice 'OK: get_relatorio_publico devolve null pra codigo inexistente';
  reset role;

  update public.inspections set status = 'aprovada' where id = v_inspection_id;

  set local role anon;
  v_resultado := public.get_relatorio_publico('TESTE0053');
  if v_resultado is null then
    raise exception 'FALHOU: get_relatorio_publico nao devolveu dados de inspecao aprovada com codigo certo';
  end if;
  if v_resultado->'inspection'->>'codigo_certificado' <> 'TESTE0053' then
    raise exception 'FALHOU: codigo_certificado incorreto no retorno';
  end if;
  if v_resultado ? 'client_data' then
    raise exception 'FALHOU: retorno inclui client_data (RF-50)';
  end if;
  if v_resultado::text ilike '%Cliente Sensível 053%' then
    raise exception 'FALHOU: retorno vaza o nome do solicitante (RF-50)';
  end if;
  raise notice 'OK: get_relatorio_publico devolve dados corretos sem client_data pra inspecao aprovada';
  reset role;
end $$;

-- client_access_logs: anon insere, nao le; admin le.
set local role anon;
do $$
declare
  v_inspection_id uuid := current_setting('acesso_cliente_053.inspection_id')::uuid;
  v_count int;
begin
  insert into public.client_access_logs (inspection_id, origem) values (v_inspection_id, 'whatsapp');
  raise notice 'OK: anon consegue inserir em client_access_logs';

  select count(*) into v_count from public.client_access_logs;
  if v_count <> 0 then
    raise exception 'FALHOU: anon conseguiu ler client_access_logs (esperava 0 linhas visiveis, achou %)', v_count;
  end if;
  raise notice 'OK: anon nao ve nenhuma linha de client_access_logs (RLS)';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.client_access_logs;
  if v_count < 1 then
    raise exception 'FALHOU: admin nao conseguiu ler client_access_logs';
  end if;
  raise notice 'OK: admin le client_access_logs';
end $$;
reset role;

rollback;
