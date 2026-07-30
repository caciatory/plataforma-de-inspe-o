begin;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates;
  if v_count <> 13 then
    raise exception 'FALHOU: esperava 13 grupos, achei %', v_count;
  end if;
  raise notice 'OK: 13 grupos seedados';
end $$;

do $$
declare v_ativo boolean;
declare v_inativos int;
begin
  select ativo into v_ativo from public.checklist_group_templates where ordem = 13;
  if v_ativo is not false then
    raise exception 'FALHOU: grupo 13 (Motoriz. Especial) deveria estar ativo=false (foi %)', v_ativo;
  end if;
  select count(*) into v_inativos from public.checklist_group_templates where ativo = false;
  if v_inativos <> 1 then
    raise exception 'FALHOU: so o grupo 13 deveria estar inativo (achei % grupos inativos)', v_inativos;
  end if;
  raise notice 'OK: apenas o grupo 13 esta inativo, os outros 12 estao ativos';
end $$;

do $$
declare v_count int;
declare v_grupo13 int;
begin
  select count(*) into v_count from public.checklist_item_templates;
  if v_count <> 318 then
    raise exception 'FALHOU: esperava 318 itens, achei % (item #351 e nota, nao deveria ter sido seedado)', v_count;
  end if;

  select count(*) into v_grupo13 from public.checklist_item_templates cit
    join public.checklist_group_templates cgt on cgt.id = cit.group_id
    where cgt.ordem = 13;
  if v_grupo13 <> 34 then
    raise exception 'FALHOU: grupo 13 deveria ter 34 itens (35 linhas - item #351 excluido), achei %', v_grupo13;
  end if;
  raise notice 'OK: 318 itens no total, grupo 13 com 34 (item #351 excluido)';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where tipo = 'medicao' and (qtd_pontos_medicao is null or unidade_medicao is null);
  if v_count <> 0 then
    raise exception 'FALHOU: % itens medicao sem qtd_pontos_medicao/unidade_medicao', v_count;
  end if;
  raise notice 'OK: todo item medicao tem qtd_pontos_medicao e unidade_medicao';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates cit
    where cit.tipo = 'escolha'
      and (cit.conjunto_opcao_id is null
        or (select count(*) from public.opcoes o where o.conjunto_id = cit.conjunto_opcao_id) < 2);
  if v_count <> 0 then
    raise exception 'FALHOU: % itens escolha sem conjunto_opcao_id valido (>=2 opcoes)', v_count;
  end if;
  raise notice 'OK: todo item escolha aponta pra um conjunto com >=2 opcoes';
end $$;

do $$
declare v_conjuntos int;
declare v_problema_sim_foto int;
declare v_presenca_sim_foto int;
begin
  select count(*) into v_conjuntos from public.conjuntos_opcao
    where nome in ('sim_nao_problema', 'sim_nao_problema_na', 'sim_nao_presenca', 'sim_nao_presenca_na');
  if v_conjuntos <> 4 then
    raise exception 'FALHOU: esperava os 4 conjuntos sim_nao_*, achei %', v_conjuntos;
  end if;

  select count(*) into v_problema_sim_foto from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome in ('sim_nao_problema', 'sim_nao_problema_na') and o.label = 'Sim' and o.exige_foto = true;
  if v_problema_sim_foto <> 2 then
    raise exception 'FALHOU: opcao Sim de sim_nao_problema(_na) deveria ter exige_foto=true (achei % com esse estado)', v_problema_sim_foto;
  end if;

  select count(*) into v_presenca_sim_foto from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome in ('sim_nao_presenca', 'sim_nao_presenca_na') and o.label = 'Sim' and o.exige_foto = true;
  if v_presenca_sim_foto <> 0 then
    raise exception 'FALHOU: opcao Sim de sim_nao_presenca(_na) NAO deveria exigir foto (achei % marcadas true)', v_presenca_sim_foto;
  end if;
  raise notice 'OK: 4 conjuntos sim_nao_*, exige_foto correto em cada polaridade';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.conjuntos_opcao where nome = 'estado_4';
  if v_count <> 0 then
    raise exception 'FALHOU: conjunto orfao estado_4 (backfill da Peca 1a) ainda existe, deveria ter sido limpo';
  end if;
  raise notice 'OK: conjunto orfao estado_4 foi removido';
end $$;

do $$
declare v_piso record;
declare v_fluido record;
declare v_alternador record;
begin
  select limiar_critico_inferior, faixa_min_ok, faixa_max_ok, limiar_critico_superior into v_piso
    from public.checklist_item_templates where nome = 'Profundidade do piso – dianteiro esq.';
  if v_piso.limiar_critico_inferior is distinct from 1.6 then
    raise exception 'FALHOU: profundidade do piso deveria ter limiar_critico_inferior=1.6, achei %', v_piso.limiar_critico_inferior;
  end if;

  select limiar_critico_superior into v_fluido
    from public.checklist_item_templates where nome = 'Teste do fluido de travões';
  if v_fluido.limiar_critico_superior is distinct from 3 then
    raise exception 'FALHOU: fluido de travoes deveria ter limiar_critico_superior=3, achei %', v_fluido.limiar_critico_superior;
  end if;

  select faixa_min_ok, faixa_max_ok into v_alternador
    from public.checklist_item_templates where nome = 'Alternador – tensão de carga';
  if v_alternador.faixa_min_ok is distinct from 13.8 or v_alternador.faixa_max_ok is distinct from 14.4 then
    raise exception 'FALHOU: alternador deveria ter faixa 13.8-14.4V, achei %-%', v_alternador.faixa_min_ok, v_alternador.faixa_max_ok;
  end if;
  raise notice 'OK: faixas de piso/fluido de travoes/alternador corretas';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where nome ilike '%ver Secção 5%' or nome ilike '%Itens motor térmico aplicam-se%';
  if v_count <> 0 then
    raise exception 'FALHOU: item #351 (nota, nao e item de verificacao) foi seedado por engano';
  end if;
  raise notice 'OK: item #351 nao foi seedado';
end $$;

do $$
declare v_grupos int;
begin
  select count(*) into v_grupos from (
    select grupo_replicacao from public.checklist_item_templates
      where grupo_replicacao is not null
      group by grupo_replicacao
      having count(*) <> 2
  ) sub;
  if v_grupos <> 0 then
    raise exception 'FALHOU: % grupo(s) de replicacao nao tem exatamente 2 membros', v_grupos;
  end if;
  raise notice 'OK: todo grupo_replicacao no seed tem exatamente 2 membros';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where tipo = 'medicao' and grupo_replicacao is not null;
  if v_count <> 0 then
    raise exception 'FALHOU: % itens de medicao tem grupo_replicacao (deveria ser bloqueado pela constraint)', v_count;
  end if;
  raise notice 'OK: nenhum item de medicao tem grupo_replicacao';
end $$;

rollback;
