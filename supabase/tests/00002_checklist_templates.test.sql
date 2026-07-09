begin;

insert into public.checklist_group_templates (ordem, nome)
  values (1, 'Exterior');

-- aplica_stand default false: item padrão sem passar o campo fica de fora do plano Stand por padrão
insert into public.checklist_item_templates (group_id, nome, tipo)
  select id, 'Para-choque dianteiro', 'padrao' from public.checklist_group_templates where ordem = 1;
do $$
declare v_aplica_stand boolean;
begin
  select aplica_stand into v_aplica_stand from public.checklist_item_templates where nome = 'Para-choque dianteiro';
  if v_aplica_stand is not false then raise exception 'FALHOU: esperava aplica_stand=false por padrão, veio %', v_aplica_stand; end if;
  raise notice 'OK: aplica_stand default false';
end $$;

-- item tipo=medicao SEM qtd_pontos_medicao deve falhar
do $$
begin
  begin
    insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao)
      select id, 'Espessura porta dianteira', 'medicao', null from public.checklist_group_templates where ordem = 1;
    raise exception 'FALHOU: deveria ter bloqueado medicao sem qtd_pontos_medicao';
  exception when check_violation then
    raise notice 'OK: qtd_pontos_medicao_valido bloqueou medicao sem faixa';
  end;
end $$;

-- item tipo=medicao com qtd_pontos_medicao=4 (dentro de 3-5) e aplica_stand=true deve passar
insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao, aplica_stand)
  select id, 'Espessura porta dianteira', 'medicao', 4, true from public.checklist_group_templates where ordem = 1;

rollback;
