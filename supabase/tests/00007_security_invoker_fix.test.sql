begin;

do $$
begin
  -- security_invoker is stored as a view option in pg_class.reloptions, not a column flag
  if not exists (
    select 1 from pg_class c
    where c.relname = 'inspections_with_flags'
      and c.relkind = 'v'
      and 'security_invoker=true' = any(c.reloptions)
  ) then
    raise exception 'FALHOU: inspections_with_flags nao tem security_invoker=true';
  end if;
  raise notice 'OK: inspections_with_flags tem security_invoker=true';
end $$;

do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'checklist_item_responses_inspection_id_idx'
  ) then
    raise exception 'FALHOU: indice redundante ainda existe';
  end if;
  raise notice 'OK: indice redundante removido';
end $$;

rollback;
