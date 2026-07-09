-- supabase/tests/00004_workflow_audit.test.sql
begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'admin@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Admin Teste', 'admin@test.com', 'admin');
insert into public.inspections (id, tecnico_id, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'particular', 'compra');

-- devolucao sem motivo deve falhar (RF-32: motivo obrigatório)
do $$
begin
  begin
    insert into public.review_events (inspection_id, tipo, autor_id) values
      ('00000000-0000-0000-0000-000000000010', 'devolucao', '00000000-0000-0000-0000-000000000001');
    raise exception 'FALHOU: deveria ter bloqueado devolucao sem motivo';
  exception when check_violation then
    raise notice 'OK: motivo_obrigatorio_devolucao_cancelamento bloqueou devolucao sem motivo';
  end;
end $$;

-- aprovacao sem motivo passa normalmente
insert into public.review_events (inspection_id, tipo, autor_id) values
  ('00000000-0000-0000-0000-000000000010', 'aprovacao', '00000000-0000-0000-0000-000000000001');

insert into public.audit_log_entries (inspection_id, admin_id, descricao) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Editou VIN do veículo');

-- RNF-11: deletar uma inspeção com log de auditoria deve falhar (sem cascade) —
-- o log não pode sumir silenciosamente junto com a inspeção.
do $$
begin
  begin
    delete from public.inspections where id = '00000000-0000-0000-0000-000000000010';
    raise exception 'FALHOU: deveria ter bloqueado delete de inspection com audit_log_entries';
  exception when foreign_key_violation then
    raise notice 'OK: audit_log_entries sem cascade bloqueou delete da inspection';
  end;
end $$;

rollback;
