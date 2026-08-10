-- supabase/tests/00050_remove_documentacao_checklist.test.sql
begin;

do $$
declare
  v_removidos int;
  v_orfas int;
begin
  select count(*) into v_removidos
  from public.checklist_item_templates t
  join public.checklist_group_templates g on g.id = t.group_id
  where g.ordem = 1 and t.subcategoria = 'Documentação';
  if v_removidos <> 0 then
    raise exception 'FALHOU: % itens de Documentação ainda existem', v_removidos;
  end if;
  raise notice 'OK: itens de Documentação removidos';

  select count(*) into v_orfas
  from public.checklist_item_responses r
  where not exists (select 1 from public.checklist_item_templates t where t.id = r.item_template_id);
  if v_orfas <> 0 then
    raise exception 'FALHOU: % checklist_item_responses orfas', v_orfas;
  end if;
  raise notice 'OK: nenhuma checklist_item_responses orfa';
end $$;

rollback;
