begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 900, 'Grupo Teste Status');
insert into public.checklist_item_templates (id, group_id, nome, conjunto_opcao_id) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000020', 'Item Escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'));
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000020', 'Item Texto', 'texto'),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000020', 'Item Data', 'data');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000020', 'Item Medicao', 'medicao', 1);

-- update explicito de tipo pro item 41 -- o insert acima usa o tipo default
-- da coluna (escolha e o default hoje, ver migration 00002); deixa
-- explicito aqui pra clareza do teste.
update public.checklist_item_templates set tipo = 'escolha' where id = '00000000-0000-0000-0000-000000000041';

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000043'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000044');

do $$
declare v_respondido boolean;
begin
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000051';
  if v_respondido is not false then
    raise exception 'FALHOU: item escolha sem opcao_id deveria ser pendente (respondido=false)';
  end if;
  raise notice 'OK: item escolha sem resposta ainda e pendente';
end $$;

do $$
declare v_respondido boolean;
begin
  update public.checklist_item_responses
    set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Médio')
    where id = '00000000-0000-0000-0000-000000000051';
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000051';
  if v_respondido is not true then
    raise exception 'FALHOU: item escolha com opcao_id deveria ser respondido';
  end if;
  raise notice 'OK: item escolha com opcao_id preenchido fica respondido';
end $$;

do $$
declare v_respondido boolean;
begin
  update public.checklist_item_responses set resposta_texto = 'ABC123' where id = '00000000-0000-0000-0000-000000000052';
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000052';
  if v_respondido is not true then
    raise exception 'FALHOU: item texto com resposta_texto deveria ser respondido';
  end if;
  raise notice 'OK: item texto com resposta_texto preenchido fica respondido';
end $$;

do $$
declare v_respondido boolean;
begin
  update public.checklist_item_responses set resposta_data = '2026-01-01' where id = '00000000-0000-0000-0000-000000000053';
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000053';
  if v_respondido is not true then
    raise exception 'FALHOU: item data com resposta_data deveria ser respondido';
  end if;
  raise notice 'OK: item data com resposta_data preenchida fica respondido';
end $$;

do $$
declare v_respondido boolean;
begin
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000054';
  if v_respondido is not false then
    raise exception 'FALHOU: item medicao sem linha em medicoes deveria ser pendente';
  end if;
  insert into public.medicoes (item_response_id, valores) values ('00000000-0000-0000-0000-000000000054', array[10.0]::numeric(8,2)[]);
  select respondido into v_respondido from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000054';
  if v_respondido is not true then
    raise exception 'FALHOU: item medicao com linha em medicoes deveria ser respondido';
  end if;
  raise notice 'OK: item medicao usa a existencia da linha em medicoes pra respondido';
end $$;

rollback;
