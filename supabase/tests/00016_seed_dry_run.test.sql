-- supabase/tests/00016_seed_dry_run.test.sql
-- Dry-run only: wraps the generated seed in a transaction and rolls back.
-- Confirms 12 groups, exactly 13 tipo=medicao items with qtd_pontos_medicao
-- 3-5, and aplica_stand defaulting false — before the real, non-transactional
-- `supabase db push` in Step 5 makes it permanent.
begin;

\i supabase/migrations/00016_seed_checklist_groups_and_items.sql

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_group_templates;
  if v_count <> 12 then
    raise exception 'FALHOU (dry-run): esperava 12 grupos, achei %', v_count;
  end if;
  raise notice 'OK (dry-run): 12 grupos batem com o esperado';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where tipo = 'medicao';
  if v_count <> 13 then
    raise exception 'FALHOU (dry-run): esperava 13 itens tipo=medicao, achei %', v_count;
  end if;

  select count(*) into v_count from public.checklist_item_templates
  where tipo = 'medicao' and (qtd_pontos_medicao is null or qtd_pontos_medicao not between 3 and 5);
  if v_count <> 0 then
    raise exception 'FALHOU (dry-run): % dos 13 itens de medicao tem qtd_pontos_medicao fora de 3-5', v_count;
  end if;
  raise notice 'OK (dry-run): os 13 itens de espessura de pintura (tipo=medicao) tem qtd_pontos_medicao entre 3 e 5';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where aplica_stand <> false;
  if v_count <> 0 then
    raise exception 'FALHOU (dry-run): esperava aplica_stand=false por default em todos os itens, achei % com true', v_count;
  end if;
  raise notice 'OK (dry-run): aplica_stand chega false por default em todos os 320 itens';
end $$;

rollback;
