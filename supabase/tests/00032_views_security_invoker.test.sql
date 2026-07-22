begin;

do $$
begin
  if not exists (
    select 1 from pg_class
    where relname = 'medicoes_resultado'
      and reloptions @> array['security_invoker=true']
  ) then
    raise exception 'FALHOU: medicoes_resultado deveria ter security_invoker=true';
  end if;
  raise notice 'OK: medicoes_resultado tem security_invoker=true';
end $$;

do $$
begin
  if not exists (
    select 1 from pg_class
    where relname = 'checklist_item_status'
      and reloptions @> array['security_invoker=true']
  ) then
    raise exception 'FALHOU: checklist_item_status deveria ter security_invoker=true';
  end if;
  raise notice 'OK: checklist_item_status tem security_invoker=true';
end $$;

rollback;
