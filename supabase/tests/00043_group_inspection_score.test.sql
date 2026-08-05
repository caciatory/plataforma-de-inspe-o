begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');

insert into public.conjuntos_opcao (id, nome) values ('00000000-0000-0000-0000-000000000070', 'teste_grupo_3op');
insert into public.opcoes (id, conjunto_id, label, ordem, exige_foto, is_na) values
  ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000070', 'Bom', 1, false, false),
  ('00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000070', 'Medio', 2, false, false),
  ('00000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000070', 'Mau', 3, true, false),
  ('00000000-0000-0000-0000-000000000074', '00000000-0000-0000-0000-000000000070', 'N.A.', 4, false, true);

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000080', 903, 'Grupo A (nota alta)'),
  ('00000000-0000-0000-0000-000000000081', 904, 'Grupo B (nota media)'),
  ('00000000-0000-0000-0000-000000000082', 905, 'Grupo Todo NA');

insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id) values
  ('00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000080', 'A1', 'escolha', '00000000-0000-0000-0000-000000000070'),
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000080', 'A2', 'escolha', '00000000-0000-0000-0000-000000000070'),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000081', 'B1', 'escolha', '00000000-0000-0000-0000-000000000070'),
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000082', 'C1', 'escolha', '00000000-0000-0000-0000-000000000070'),
  ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000082', 'C2', 'escolha', '00000000-0000-0000-0000-000000000070');

-- Inspecao 1: grupo A todo "Bom" (nota 10), grupo B "Medio" (nota 6) -> geral (10+6)/2=8 -> A
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');
insert into public.checklist_item_responses (inspection_id, item_template_id, opcao_id) values
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-000000000071'),
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000071'),
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000072');

-- Inspecao 2: so grupo B, "Mau" (nota 2) -> geral 2 -> C; grupo Todo NA fica de fora mesmo respondido
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');
insert into public.checklist_item_responses (inspection_id, item_template_id, opcao_id) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000073'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000074'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000074');

-- Inspecao 3: nada avaliado ainda (sem nenhuma resposta) -> sem linha em inspection_score
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

do $$
declare v_nota numeric;
begin
  select nota into v_nota from public.checklist_group_score
  where inspection_id = '00000000-0000-0000-0000-000000000100' and group_id = '00000000-0000-0000-0000-000000000080';
  if v_nota <> 10 then raise exception 'FALHOU: grupo A (2 itens Bom) deveria dar nota 10 (deu %)', v_nota; end if;
  raise notice 'OK: nota de grupo = media dos itens avaliados';
end $$;

do $$
declare v_nota_geral numeric; v_classificacao text;
begin
  select nota_geral, classificacao into v_nota_geral, v_classificacao from public.inspection_score
  where inspection_id = '00000000-0000-0000-0000-000000000100';
  if v_nota_geral <> 8 or v_classificacao <> 'A' then
    raise exception 'FALHOU: inspecao 1 deveria dar nota_geral=8, classificacao=A (deu % / %)', v_nota_geral, v_classificacao;
  end if;
  raise notice 'OK: fronteira exata nota_geral=8 classifica A (>=8)';
end $$;

do $$
declare v_nota_geral numeric; v_classificacao text; v_itens_avaliados_grupo_na int;
begin
  select nota_geral, classificacao into v_nota_geral, v_classificacao from public.inspection_score
  where inspection_id = '00000000-0000-0000-0000-000000000101';
  if v_nota_geral <> 2 or v_classificacao <> 'C' then
    raise exception 'FALHOU: inspecao 2 deveria dar nota_geral=2, classificacao=C (deu % / %)', v_nota_geral, v_classificacao;
  end if;

  select itens_avaliados into v_itens_avaliados_grupo_na from public.checklist_group_score
  where inspection_id = '00000000-0000-0000-0000-000000000101' and group_id = '00000000-0000-0000-0000-000000000082';
  if v_itens_avaliados_grupo_na <> 0 then
    raise exception 'FALHOU: grupo todo N.A. deveria ter itens_avaliados=0 (deu %)', v_itens_avaliados_grupo_na;
  end if;
  raise notice 'OK: grupo todo N.A. fica com itens_avaliados=0 e nao entra na nota geral (fronteira <5 classifica C)';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.inspection_score where inspection_id = '00000000-0000-0000-0000-000000000102';
  if v_count <> 0 then
    raise exception 'FALHOU: inspecao sem nenhum item avaliado nao deveria aparecer em inspection_score';
  end if;
  raise notice 'OK: inspecao sem nada avaliado nao aparece em inspection_score (nota_geral/classificacao efetivamente null pra quem consulta)';
end $$;

rollback;
