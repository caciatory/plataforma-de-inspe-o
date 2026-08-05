begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');
insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 902, 'Grupo Teste Pontuacao');

-- Conjunto de 2 opcoes (funciona_2-like): 10/2
insert into public.conjuntos_opcao (id, nome) values ('00000000-0000-0000-0000-000000000030', 'teste_2op');
insert into public.opcoes (id, conjunto_id, label, ordem, exige_foto, is_na) values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000030', 'Funciona', 1, false, false),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000030', 'Nao Funciona', 2, true, false);

-- Conjunto de 3 opcoes + N.A. (estado_3_na-like): 10/6/2, N.A. fora da formula
insert into public.conjuntos_opcao (id, nome) values ('00000000-0000-0000-0000-000000000033', 'teste_3op_na');
insert into public.opcoes (id, conjunto_id, label, ordem, exige_foto, is_na) values
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000033', 'Bom', 1, false, false),
  ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000033', 'Medio', 2, false, false),
  ('00000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000033', 'Mau', 3, true, false),
  ('00000000-0000-0000-0000-000000000037', '00000000-0000-0000-0000-000000000033', 'N.A.', 4, false, true);

-- Conjunto de 5 opcoes: 10/8/6/4/2
insert into public.conjuntos_opcao (id, nome) values ('00000000-0000-0000-0000-000000000038', 'teste_5op');
insert into public.opcoes (id, conjunto_id, label, ordem, exige_foto, is_na) values
  ('00000000-0000-0000-0000-000000000039', '00000000-0000-0000-0000-000000000038', 'Nivel 1', 1, false, false),
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000038', 'Nivel 2', 2, false, false),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000038', 'Nivel 3', 3, false, false),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000038', 'Nivel 4', 4, false, false),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000038', 'Nivel 5', 5, false, false);

insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id) values
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000020', 'Item 2op', 'escolha', '00000000-0000-0000-0000-000000000030'),
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000020', 'Item 3op meio', 'escolha', '00000000-0000-0000-0000-000000000033'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000020', 'Item 3op NA', 'escolha', '00000000-0000-0000-0000-000000000033'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000020', 'Item 5op pos3', 'escolha', '00000000-0000-0000-0000-000000000038'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000020', 'Item Texto', 'texto', null),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000020', 'Item Data', 'data', null),
  ('00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000020', 'Item Medicao', 'medicao', null);
update public.checklist_item_templates set qtd_pontos_medicao = 3, unidade_medicao = 'µm',
  faixa_min_ok = 70, faixa_max_ok = 160, limiar_critico_superior = 300
  where id = '00000000-0000-0000-0000-000000000056';

insert into public.checklist_item_responses (id, inspection_id, item_template_id, opcao_id, resposta_texto, resposta_data) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000031', null, null),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000035', null, null),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000037', null, null),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000041', null, null),
  ('00000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000054', null, 'algum texto', null),
  ('00000000-0000-0000-0000-000000000065', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000055', null, null, '2026-01-01'),
  ('00000000-0000-0000-0000-000000000066', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000056', null, null, null);

insert into public.medicoes (item_response_id, valores) values
  ('00000000-0000-0000-0000-000000000066', array[100.0, 110.0, 120.0]::numeric(8,2)[]);

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000060';
  if v_pontos <> 10 then raise exception 'FALHOU: opcao 1a de 2 deveria dar 10 (deu %)', v_pontos; end if;
  raise notice 'OK: conjunto de 2 opcoes, posicao 1 = 10';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000061';
  if v_pontos <> 6 then raise exception 'FALHOU: opcao do meio de 3 deveria dar 6 (deu %)', v_pontos; end if;
  raise notice 'OK: conjunto de 3 opcoes (com N.A. no catalogo), posicao do meio = 6 -- reproduz RF-38';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000062';
  if v_pontos is not null then raise exception 'FALHOU: opcao N.A. deveria dar pontos null (deu %)', v_pontos; end if;
  raise notice 'OK: opcao is_na=true nunca pontua';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000063';
  if v_pontos <> 6 then raise exception 'FALHOU: posicao 3 de 5 deveria dar 6 (deu %)', v_pontos; end if;
  raise notice 'OK: conjunto de 5 opcoes, posicao 3 (meio) = 6';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000064';
  if v_pontos is not null then raise exception 'FALHOU: item texto respondido deveria dar pontos null (deu %)', v_pontos; end if;
  raise notice 'OK: item texto nunca pontua, mesmo respondido';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000065';
  if v_pontos is not null then raise exception 'FALHOU: item data respondido deveria dar pontos null (deu %)', v_pontos; end if;
  raise notice 'OK: item data nunca pontua, mesmo respondido';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000066';
  if v_pontos <> 10 then raise exception 'FALHOU: medicao dentro da faixa (ok) deveria dar 10 (deu %)', v_pontos; end if;
  raise notice 'OK: medicao com resultado ok mapeia pra 10, mesma escala';
end $$;

rollback;
