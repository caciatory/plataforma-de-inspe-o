-- supabase/tests/00047_remove_duplicate_identificacao_historico.test.sql
-- Cobre a migration 00047: os 21 itens de Identificação/Histórico (grupo
-- ordem=1) somem do checklist; "Documentação" (mesmo grupo) fica intacta;
-- nenhuma checklist_item_responses fica orfã.

begin;

do $$
declare
  v_removidos int;
  v_documentacao int;
  v_orfas int;
begin
  select count(*) into v_removidos
  from public.checklist_item_templates t
  join public.checklist_group_templates g on g.id = t.group_id
  where g.ordem = 1 and t.subcategoria in ('Identificação', 'Histórico');
  if v_removidos <> 0 then
    raise exception 'FALHOU: % itens de Identificação/Histórico ainda existem', v_removidos;
  end if;
  raise notice 'OK: itens de Identificação/Histórico removidos';

  select count(*) into v_documentacao
  from public.checklist_item_templates t
  join public.checklist_group_templates g on g.id = t.group_id
  where g.ordem = 1 and t.subcategoria = 'Documentação';
  if v_documentacao <> 4 then
    raise exception 'FALHOU: esperava 4 itens em Documentação, achou %', v_documentacao;
  end if;
  raise notice 'OK: itens de Documentação intactos';

  select count(*) into v_orfas
  from public.checklist_item_responses r
  where not exists (select 1 from public.checklist_item_templates t where t.id = r.item_template_id);
  if v_orfas <> 0 then
    raise exception 'FALHOU: % checklist_item_responses orfas', v_orfas;
  end if;
  raise notice 'OK: nenhuma checklist_item_responses orfa';
end $$;

rollback;
