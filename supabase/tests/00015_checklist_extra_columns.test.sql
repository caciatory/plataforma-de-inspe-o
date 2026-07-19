-- supabase/tests/00015_checklist_extra_columns.test.sql
begin;

do $$
declare v_ativo boolean;
begin
  insert into public.checklist_group_templates (ordem, nome) values (901, 'Grupo Teste');
  select ativo into v_ativo from public.checklist_group_templates where ordem = 901;
  if v_ativo <> true then
    raise exception 'FALHOU: ativo deveria ser true por default (foi %)', v_ativo;
  end if;
  raise notice 'OK: checklist_group_templates.ativo tem default true';
end $$;

do $$
declare
  v_group_id uuid;
  v_obs text;
begin
  insert into public.checklist_group_templates (ordem, nome) values (902, 'Grupo Teste 2')
  returning id into v_group_id;

  insert into public.checklist_item_templates (group_id, nome) values (v_group_id, 'Item sem observacoes');
  select observacoes into v_obs from public.checklist_item_templates
  where group_id = v_group_id and nome = 'Item sem observacoes';
  if v_obs is not null then
    raise exception 'FALHOU: observacoes deveria aceitar null (foi %)', v_obs;
  end if;

  insert into public.checklist_item_templates (group_id, nome, observacoes)
  values (v_group_id, 'Item com observacoes', 'Ref: 80-180um');
  select observacoes into v_obs from public.checklist_item_templates
  where group_id = v_group_id and nome = 'Item com observacoes';
  if v_obs <> 'Ref: 80-180um' then
    raise exception 'FALHOU: observacoes deveria gravar o texto (foi %)', v_obs;
  end if;

  raise notice 'OK: checklist_item_templates.observacoes aceita null e texto';
end $$;

rollback;
