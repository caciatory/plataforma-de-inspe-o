-- supabase/tests/00016_seed_checklist_groups_and_items.test.sql
-- Verifica dados ja commitados pelo seed (00012) — sem begin/rollback,
-- porque nao ha fixture de teste pra desfazer, so leitura.

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates;
  if v_count <> 12 then
    raise exception 'FALHOU: esperava 12 grupos, achei %', v_count;
  end if;
  raise notice 'OK: 12 grupos seedados';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates;
  if v_count <> 320 then
    raise exception 'FALHOU: esperava 320 itens, achei %', v_count;
  end if;
  raise notice 'OK: 320 itens seedados';
end $$;

do $$
declare v_ativo boolean;
begin
  select ativo into v_ativo from public.checklist_group_templates where ordem = 12;
  if v_ativo <> false then
    raise exception 'FALHOU: grupo 12 (Motoriz. Especial) deveria estar ativo=false (foi %)', v_ativo;
  end if;
  raise notice 'OK: grupo 12 (Fase 9) importado como inativo';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates where ativo = false;
  if v_count <> 1 then
    raise exception 'FALHOU: so o grupo 12 deveria estar inativo (achei % grupos inativos)', v_count;
  end if;
  raise notice 'OK: apenas o grupo 12 esta inativo, os outros 11 estao ativos';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where aplica_stand <> false;
  if v_count <> 0 then
    raise exception 'FALHOU: nenhum item deveria ter aplica_stand=true ainda (achei %)', v_count;
  end if;
  raise notice 'OK: aplica_stand=false em todos os itens (PENDENTE -> false)';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where observacoes is not null;
  if v_count <> 151 then
    raise exception 'FALHOU: esperava 151 itens com observacoes, achei %', v_count;
  end if;
  raise notice 'OK: 151 itens preservaram observacoes do CSV';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count
  from public.checklist_item_templates it
  join public.checklist_group_templates gt on gt.id = it.group_id
  where gt.ordem = 1 and it.nome = 'Cor do veículo';
  if v_count <> 1 then
    raise exception 'FALHOU: item "Cor do veiculo" deveria estar ligado ao grupo 1 (achei %)', v_count;
  end if;
  raise notice 'OK: item de exemplo ligado ao grupo correto via group_id';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where tipo = 'medicao';
  if v_count <> 13 then
    raise exception 'FALHOU: esperava 13 itens tipo=medicao (espessura de pintura), achei %', v_count;
  end if;

  select count(*) into v_count from public.checklist_item_templates
  where tipo = 'medicao' and (qtd_pontos_medicao is null or qtd_pontos_medicao not between 3 and 5);
  if v_count <> 0 then
    raise exception 'FALHOU: todo item tipo=medicao deveria ter qtd_pontos_medicao entre 3 e 5 (achei % invalidos)', v_count;
  end if;
  raise notice 'OK: os 13 itens de medicao (espessura de pintura) tem qtd_pontos_medicao valido (3-5)';
end $$;
