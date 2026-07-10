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
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000002', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'aguardando_aprovacao', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Grupo Teste');

insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item Um', 'padrao'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item Dois', 'padrao');

-- unico response pre-existente: preso a inspecao 012 (T1, aguardando_aprovacao,
-- NAO editavel) — usado para testar UPDATE bloqueado e o bypass do admin.
-- O response da inspecao editavel (010) e criado pelo proprio tecnico no teste,
-- para exercitar checklist_item_responses_insert de verdade (nao so o UPDATE).
insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000021');

insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado) values
  ('00000000-0000-0000-0000-000000000032', array[100.0, 105.0]::numeric(6,2)[], 'OK');

-- simulate tecnico 1
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ler templates de grupo (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico le checklist_group_templates';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates;
  if v_count <> 2 then
    raise exception 'FALHOU: tecnico deveria ler templates de item (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico le checklist_item_templates';
end $$;

do $$
begin
  begin
    insert into public.checklist_group_templates (ordem, nome) values (2, 'Outro Grupo');
    raise exception 'FALHOU: tecnico nao deveria inserir template de grupo';
  exception when insufficient_privilege then
    raise notice 'OK: insert em checklist_group_templates bloqueado para tecnico';
  end;
end $$;

do $$
begin
  insert into public.checklist_item_responses (id, inspection_id, item_template_id)
    values ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022');
  raise notice 'OK: tecnico insere checklist_item_responses na propria inspecao editavel';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_responses;
  if v_count <> 2 then
    raise exception 'FALHOU: tecnico deveria ver so as respostas das proprias inspecoes (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve apenas checklist_item_responses das proprias inspecoes';
end $$;

do $$
begin
  update public.checklist_item_responses set classificacao = 'otimo'
    where id = '00000000-0000-0000-0000-000000000030';
  if not found then
    raise exception 'FALHOU: tecnico deveria editar resposta da propria inspecao em rascunho';
  end if;
  raise notice 'OK: tecnico edita checklist_item_responses em inspecao editavel';
end $$;

do $$
declare v_rows int;
begin
  update public.checklist_item_responses set classificacao = 'otimo'
    where id = '00000000-0000-0000-0000-000000000032';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria editar resposta de inspecao fora de rascunho/devolvida';
  end if;
  raise notice 'OK: update bloqueado em checklist_item_responses fora de status editavel';
end $$;

do $$
begin
  insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado)
    values ('00000000-0000-0000-0000-000000000030', array[110.0, 112.0]::numeric(6,2)[], 'OK');
  raise notice 'OK: tecnico insere paint_measurements para resposta propria editavel';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.paint_measurements;
  if v_count <> 2 then
    raise exception 'FALHOU: tecnico deveria ver as paint_measurements das proprias inspecoes (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve paint_measurements via join ate as proprias inspecoes';
end $$;

do $$
declare v_rows int;
begin
  update public.paint_measurements set resultado_calculado = 'anomalia'
    where item_response_id = '00000000-0000-0000-0000-000000000032';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria editar paint_measurements de inspecao fora de rascunho/devolvida';
  end if;
  raise notice 'OK: update bloqueado em paint_measurements fora de status editavel';
end $$;

do $$
begin
  insert into public.photos (inspection_id, item_response_id, contexto, url)
    values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000030', 'item', 'https://example.com/foto1.jpg');
  raise notice 'OK: tecnico insere foto de item na propria inspecao editavel';
end $$;

do $$
begin
  begin
    insert into public.photos (inspection_id, item_response_id, contexto, url)
      values ('00000000-0000-0000-0000-000000000010', null, 'capa', 'https://example.com/capa.jpg');
    raise exception 'FALHOU: tecnico nao deveria inserir foto de capa';
  exception when insufficient_privilege then
    raise notice 'OK: insert de foto de capa bloqueado para tecnico';
  end;
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.photos;
  if v_count <> 1 then
    raise exception 'FALHOU: tecnico deveria ver a foto da propria inspecao (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico ve photos da propria inspecao';
end $$;

do $$
declare v_rows int;
begin
  update public.photos set ordem = 1
    where inspection_id = '00000000-0000-0000-0000-000000000010' and contexto = 'item';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FALHOU: tecnico nao deveria conseguir editar foto (photos_update e admin-only)';
  end if;
  raise notice 'OK: update em photos bloqueado para tecnico mesmo na propria inspecao';
end $$;

-- simulate tecnico 2 (isolation check)
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.paint_measurements;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico2 nao deveria ver paint_measurements de outro tecnico (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico2 nao enxerga paint_measurements de outro tecnico';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.photos;
  if v_count <> 0 then
    raise exception 'FALHOU: tecnico2 nao deveria ver photos de outro tecnico (viu %)', v_count;
  end if;
  raise notice 'OK: tecnico2 nao enxerga photos de outro tecnico';
end $$;

-- simulate admin
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003"}';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_responses;
  if v_count <> 2 then
    raise exception 'FALHOU: admin deveria ver todas as respostas (viu %)', v_count;
  end if;
  raise notice 'OK: admin ve todas as checklist_item_responses';
end $$;

do $$
begin
  update public.paint_measurements set resultado_calculado = 'anomalia'
    where item_response_id = '00000000-0000-0000-0000-000000000032';
  if not found then
    raise exception 'FALHOU: admin deveria poder editar paint_measurements de qualquer inspecao';
  end if;
  raise notice 'OK: admin edita paint_measurements mesmo fora de rascunho/devolvida';
end $$;

do $$
begin
  insert into public.photos (inspection_id, item_response_id, contexto, ordem, url)
    values ('00000000-0000-0000-0000-000000000010', null, 'capa', 1, 'https://example.com/capa-admin.jpg');
  raise notice 'OK: admin insere foto de capa';
end $$;

do $$
begin
  update public.photos set ordem = 2
    where inspection_id = '00000000-0000-0000-0000-000000000010' and contexto = 'item';
  if not found then
    raise exception 'FALHOU: admin deveria poder editar qualquer foto';
  end if;
  raise notice 'OK: admin edita photos';
end $$;

reset role;
rollback;
