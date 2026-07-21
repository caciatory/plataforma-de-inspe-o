begin;

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000030', 906, 'Grupo Teste GR');

do $$
begin
  insert into public.checklist_item_templates (group_id, nome, tipo, grupo_replicacao)
    values ('00000000-0000-0000-0000-000000000030', 'Item Padrao', 'padrao', 'cluster-teste');
  raise notice 'OK: item padrao aceita grupo_replicacao';
end $$;

do $$
begin
  begin
    insert into public.checklist_item_templates (group_id, nome, tipo, qtd_pontos_medicao, grupo_replicacao)
      values ('00000000-0000-0000-0000-000000000030', 'Item Medicao', 'medicao', 3, 'cluster-teste');
    raise exception 'FALHOU: item medicao nao deveria aceitar grupo_replicacao';
  exception when check_violation then
    raise notice 'OK: item medicao com grupo_replicacao bloqueado pela constraint';
  end;
end $$;

do $$
begin
  insert into public.checklist_item_templates (group_id, nome, tipo, grupo_replicacao)
    values ('00000000-0000-0000-0000-000000000030', 'Item Sem Cluster', 'padrao', null);
  raise notice 'OK: grupo_replicacao null aceito normalmente';
end $$;

rollback;
