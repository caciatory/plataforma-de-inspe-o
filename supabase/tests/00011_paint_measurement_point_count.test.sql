-- supabase/tests/00011_paint_measurement_point_count.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 1, 'Exterior');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Espessura de pintura - Capo', 'medicao', 3);

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021');

do $$
begin
  begin
    insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado)
      values ('00000000-0000-0000-0000-000000000030', array[100.0, 110.0]::numeric(6,2)[], 'OK');
    raise exception 'FALHOU: deveria ter bloqueado 2 pontos quando o item exige 3';
  exception when check_violation then
    raise notice 'OK: insert bloqueado com numero errado de pontos (2 de 3)';
  end;
end $$;

do $$
begin
  insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado)
    values ('00000000-0000-0000-0000-000000000030', array[100.0, 110.0, 120.0]::numeric(6,2)[], 'OK');
  raise notice 'OK: insert aceito com numero certo de pontos (3 de 3)';
end $$;

do $$
begin
  begin
    update public.paint_measurements set valores_um = array[100.0, 110.0, 120.0, 130.0, 140.0]::numeric(6,2)[]
      where item_response_id = '00000000-0000-0000-0000-000000000030';
    raise exception 'FALHOU: deveria ter bloqueado update para 5 pontos quando o item exige 3';
  exception when check_violation then
    raise notice 'OK: update bloqueado com numero errado de pontos (5 de 3)';
  end;
end $$;

rollback;
