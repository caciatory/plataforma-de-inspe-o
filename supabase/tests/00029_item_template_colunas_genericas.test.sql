begin;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where tipo = 'escolha' and conjunto_opcao_id is null;
  if v_count <> 0 then
    raise exception 'FALHOU: % itens escolha sem conjunto_opcao_id', v_count;
  end if;
  raise notice 'OK: todo item escolha tem conjunto_opcao_id';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where tipo = 'medicao'
      and (unidade_medicao is distinct from 'µm' or faixa_min_ok <> 70 or faixa_max_ok <> 160 or limiar_critico_superior <> 300);
  if v_count <> 0 then
    raise exception 'FALHOU: % itens medicao sem as faixas esperadas de tinta', v_count;
  end if;
  raise notice 'OK: todo item medicao (tinta) tem as faixas da 00012 preservadas';
end $$;

do $$
begin
  insert into public.checklist_group_templates (ordem, nome) values (996, 'Grupo Teste Faixas');
  insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao)
    select id, 'Item Medicao 1pt', 'medicao', 1 from public.checklist_group_templates where nome = 'Grupo Teste Faixas';
  raise notice 'OK: qtd_pontos_medicao=1 aceito (afrouxado de 3-5 pra 1-5)';
end $$;

do $$
begin
  begin
    insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao, grupo_replicacao)
      select id, 'Item Medicao Grupo', 'medicao', 3, 'cluster-teste' from public.checklist_group_templates where nome = 'Grupo Teste Faixas';
    raise exception 'FALHOU: medicao com grupo_replicacao deveria ser bloqueado';
  exception when check_violation then
    raise notice 'OK: grupo_replicacao_so_padrao ainda bloqueia medicao (agora checando tipo=escolha)';
  end;
end $$;

rollback;
