begin;

-- Parte 1: a migration 00044 troca as ordens de 'Sim'/'Nao' pro conjunto
-- real sim_nao_problema (seed real, migration 00037) -- 'Nao' (sem defeito)
-- deve ficar na ordem=1 (melhor) e 'Sim' (defeito presente) na ordem=2 (pior).
do $$
declare v_ordem_nao int; v_ordem_sim int;
begin
  select ordem into v_ordem_nao from public.opcoes
  where conjunto_id = (select id from public.conjuntos_opcao where nome = 'sim_nao_problema') and label = 'Não';
  select ordem into v_ordem_sim from public.opcoes
  where conjunto_id = (select id from public.conjuntos_opcao where nome = 'sim_nao_problema') and label = 'Sim';
  if v_ordem_nao <> 1 then
    raise exception 'FALHOU: "Nao" deveria ter ordem=1 em sim_nao_problema (deu %)', v_ordem_nao;
  end if;
  if v_ordem_sim <> 2 then
    raise exception 'FALHOU: "Sim" deveria ter ordem=2 em sim_nao_problema (deu %)', v_ordem_sim;
  end if;
  raise notice 'OK: sim_nao_problema tem "Nao" na ordem=1 e "Sim" na ordem=2 (ordem corrigida)';
end $$;

-- Parte 2: com a ordem corrigida, checklist_item_score deve pontuar 'Nao'
-- (sem defeito) com 10 e 'Sim' (defeito presente) com 2, usando itens reais
-- do seed que usam o conjunto sim_nao_problema. Unique (inspection_id,
-- item_template_id) em checklist_item_responses obriga usar dois item
-- templates distintos (ambos reais, ambos sim_nao_problema) em vez de duas
-- respostas pro mesmo item.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000201', 'tecnico-00044@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000201', 'Tecnico 00044', 'tecnico-00044@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000210', '00000000-0000-0000-0000-000000000201', 'rascunho', 'particular', 'compra');

insert into public.checklist_item_responses (id, inspection_id, item_template_id, opcao_id) values
  (
    '00000000-0000-0000-0000-000000000220',
    '00000000-0000-0000-0000-000000000210',
    (select id from public.checklist_item_templates where nome = 'Indícios de adulteração de quilometragem'),
    (select id from public.opcoes where conjunto_id = (select id from public.conjuntos_opcao where nome = 'sim_nao_problema') and label = 'Não')
  ),
  (
    '00000000-0000-0000-0000-000000000221',
    '00000000-0000-0000-0000-000000000210',
    (select id from public.checklist_item_templates where nome = 'Registo de acidentes anteriores'),
    (select id from public.opcoes where conjunto_id = (select id from public.conjuntos_opcao where nome = 'sim_nao_problema') and label = 'Sim')
  );

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000220';
  if v_pontos <> 10 then
    raise exception 'FALHOU: resposta "Nao" (sem defeito) em item real sim_nao_problema deveria dar 10 (deu %)', v_pontos;
  end if;
  raise notice 'OK: "Nao" (sem defeito) pontua 10 em item real do seed';
end $$;

do $$
declare v_pontos numeric;
begin
  select pontos into v_pontos from public.checklist_item_score where item_response_id = '00000000-0000-0000-0000-000000000221';
  if v_pontos <> 2 then
    raise exception 'FALHOU: resposta "Sim" (defeito presente) em item real sim_nao_problema deveria dar 2 (deu %)', v_pontos;
  end if;
  raise notice 'OK: "Sim" (defeito presente) pontua 2 em item real do seed';
end $$;

-- Parte 3: guarda de regressao sistemica (recomendada pela revisao final) --
-- em todo o catalogo, exige_foto=true (marca da pior resposta) nunca deveria
-- cair na ordem=1 (melhor posicao). Essa foi exatamente a pista que expos o
-- bug original em sim_nao_problema/sim_nao_problema_na; este assert pega a
-- mesma classe de erro se outro conjunto for semeado invertido no futuro.
do $$
declare v_count int;
begin
  select count(*) into v_count from public.opcoes
  where exige_foto = true and ordem = 1 and is_na = false;
  if v_count <> 0 then
    raise exception 'FALHOU: % conjunto(s) tem exige_foto=true na ordem=1 -- sinal de ordem invertida (pior resposta marcada como melhor)', v_count;
  end if;
  raise notice 'OK: nenhum conjunto tem a pior opcao (exige_foto) na primeira posicao';
end $$;

rollback;
