-- supabase/tests/00028_item_template_tipo_enum.test.sql
begin;

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'item_template_tipo' and e.enumlabel = 'escolha'
  ) then
    raise exception 'FALHOU: item_template_tipo deveria ter o valor escolha';
  end if;
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'item_template_tipo' and e.enumlabel = 'padrao'
  ) then
    raise exception 'FALHOU: item_template_tipo nao deveria mais ter o valor padrao';
  end if;
  raise notice 'OK: padrao renomeado para escolha';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'item_template_tipo' and e.enumlabel in ('texto', 'data');
  if v_count <> 2 then
    raise exception 'FALHOU: item_template_tipo deveria ter texto e data, achou %', v_count;
  end if;
  raise notice 'OK: texto e data adicionados';
end $$;

do $$
begin
  insert into public.checklist_group_templates (ordem, nome) values (997, 'Grupo Teste Enum');
  insert into public.checklist_item_templates (group_id, nome, tipo)
    select id, 'Item Escolha', 'escolha' from public.checklist_group_templates where nome = 'Grupo Teste Enum';
  raise notice 'OK: tipo escolha aceito em checklist_item_templates';
end $$;

rollback;
