begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com'),
  ('00000000-0000-0000-0000-000000000003', 'admin1@test.com');

insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico'),
  ('00000000-0000-0000-0000-000000000003', 'Admin Um', 'admin1@test.com', 'admin');

insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'devolvida', 'particular', 'compra');

insert into public.review_events (inspection_id, tipo, autor_id, motivo) values
  ('00000000-0000-0000-0000-000000000010', 'devolucao', '00000000-0000-0000-0000-000000000003', 'Faltou foto do para-choque');

insert into public.audit_log_entries (inspection_id, admin_id, descricao) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', 'Admin corrigiu classificacao do item X');

insert into public.client_access_logs (inspection_id, email, origem) values
  ('00000000-0000-0000-0000-000000000010', 'cliente@example.com', 'site');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.review_events;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ler o motivo da devolucao da propria inspecao (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico le review_events da propria inspecao';
end $$;

do $$
begin
  begin
    insert into public.review_events (inspection_id, tipo, autor_id)
      values ('00000000-0000-0000-0000-000000000010', 'aprovacao', '00000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU: tecnico nao deveria inserir review_events';
  exception when insufficient_privilege then
    raise notice 'OK: insert em review_events bloqueado para tecnico';
  end;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.audit_log_entries;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico nao deveria ver nenhuma linha de audit_log_entries (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico nao enxerga audit_log_entries';
end $$;

do $$
begin
  begin
    insert into public.audit_log_entries (inspection_id, admin_id, descricao)
      values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Tentativa de tecnico');
    raise exception 'FALHOU: tecnico nao deveria inserir em audit_log_entries';
  exception when insufficient_privilege then
    raise notice 'OK: insert em audit_log_entries bloqueado para tecnico';
  end;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.client_access_logs;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico nao deveria ver client_access_logs (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico nao enxerga client_access_logs (fora de escopo, default-deny)';
end $$;

-- simulate admin
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
begin
  insert into public.review_events (inspection_id, tipo, autor_id, motivo)
    values ('00000000-0000-0000-0000-000000000010', 'aprovacao', '00000000-0000-0000-0000-000000000003', null);
  raise notice 'OK: admin insere em review_events';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.audit_log_entries;
  if v_count <> 1 then
    raise exception 'FALHOU: admin deveria ver o log de auditoria (viu %)', v_count;
  end if;
  raise notice 'OK: admin le audit_log_entries';
end $$;

do $$
begin
  insert into public.audit_log_entries (inspection_id, admin_id, descricao)
    values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000003', 'Segunda edicao');
  raise notice 'OK: admin insere em audit_log_entries';
end $$;

do $$
begin
  begin
    update public.audit_log_entries set descricao = 'alterado'
      where inspection_id = '00000000-0000-0000-0000-000000000010';
    raise exception 'FALHOU: audit_log_entries nao deveria aceitar UPDATE nem de admin (RNF-11)';
  exception when insufficient_privilege then
    raise notice 'OK: UPDATE em audit_log_entries bloqueado mesmo para admin (RNF-11, revogado em 00004)';
  end;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.client_access_logs;
  if v_count <> 0 then
    raise exception 'FALHOU: admin tambem nao deveria ver client_access_logs (fora de escopo) (viu %)', v_count;
  end if;
  raise notice 'OK: admin tambem nao enxerga client_access_logs (mecanismo futuro, fora de escopo)';
end $$;

reset role;
rollback;
