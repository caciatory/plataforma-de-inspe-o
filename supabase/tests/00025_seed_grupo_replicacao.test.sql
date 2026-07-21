-- supabase/tests/00025_seed_grupo_replicacao.test.sql
begin;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates where grupo_replicacao is not null;
  if v_count <> 101 then
    raise exception 'FALHOU: esperava 101 itens com grupo_replicacao, encontrou %', v_count;
  end if;
  raise notice 'OK: 101 itens marcados com grupo_replicacao';
end $$;

do $$
declare
  v_slug text;
begin
  select grupo_replicacao into v_slug from public.checklist_item_templates
    where nome = 'Pneu dianteiro esquerdo - estado geral';
  if v_slug <> 'pneus-estado-geral' then
    raise exception 'FALHOU: Pneu dianteiro esquerdo deveria ter pneus-estado-geral, tem %', coalesce(v_slug, 'null');
  end if;
  raise notice 'OK: cluster de pneus curado corretamente (spot check)';
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where grupo_replicacao = 'farois-luz-media';
  if v_count <> 2 then
    raise exception 'FALHOU: cluster farois-luz-media deveria ter 2 itens, tem %', v_count;
  end if;
  raise notice 'OK: cluster farois-luz-media tem exatamente 2 itens';
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.checklist_item_templates
    where grupo_replicacao is not null and tipo <> 'padrao';
  if v_count <> 0 then
    raise exception 'FALHOU: nenhum item de medicao deveria ter grupo_replicacao, encontrou %', v_count;
  end if;
  raise notice 'OK: nenhum item de medicao foi marcado com grupo_replicacao';
end $$;

rollback;
