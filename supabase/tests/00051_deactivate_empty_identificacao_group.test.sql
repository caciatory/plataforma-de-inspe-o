-- supabase/tests/00051_deactivate_empty_identificacao_group.test.sql
begin;

do $$
declare
  v_ativo boolean;
begin
  select ativo into v_ativo from public.checklist_group_templates where ordem = 1;
  if v_ativo is distinct from false then
    raise exception 'FALHOU: grupo ordem=1 deveria estar ativo=false, achou %', v_ativo;
  end if;
  raise notice 'OK: grupo ordem=1 (Identificação e Documentação) desativado';
end $$;

rollback;
