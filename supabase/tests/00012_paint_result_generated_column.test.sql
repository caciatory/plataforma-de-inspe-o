-- supabase/tests/00012_paint_result_generated_column.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 902, 'Exterior');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000020', 'Capo', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000020', 'Tejadilho', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000020', 'Porta diant esq', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000020', 'Porta diant dir', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000020', 'Porta tras esq', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000020', 'Porta tras dir', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000047', '00000000-0000-0000-0000-000000000020', 'Para-lamas esq', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000048', '00000000-0000-0000-0000-000000000020', 'Para-lamas dir', 'medicao', 3),
  ('00000000-0000-0000-0000-000000000049', '00000000-0000-0000-0000-000000000020', 'Soleira esq', 'medicao', 3);

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000043'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000044'),
  ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000045'),
  ('00000000-0000-0000-0000-000000000056', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000046'),
  ('00000000-0000-0000-0000-000000000057', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000047'),
  ('00000000-0000-0000-0000-000000000058', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000048'),
  ('00000000-0000-0000-0000-000000000059', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000049');

-- caso normal: todos os pontos na faixa de fabrica (70-160)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000051', array[100.0, 110.0, 120.0]::numeric(6,2)[]);
-- um ponto fino demais (<70)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000052', array[50.0, 110.0, 120.0]::numeric(6,2)[]);
-- um ponto em faixa de repintura (161-299)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000053', array[200.0, 110.0, 120.0]::numeric(6,2)[]);
-- um ponto de reparacao de colisao (>=300), mesmo com os outros normais
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000054', array[300.0, 110.0, 120.0]::numeric(6,2)[]);
-- fronteira: 70 e 160 sao OK (inclusive)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000055', array[70.0, 160.0, 120.0]::numeric(6,2)[]);
-- fronteira: 69 e anomalia (abaixo de 70)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000056', array[69.0, 110.0, 120.0]::numeric(6,2)[]);
-- fronteira: 161 e anomalia (limite inferior da faixa de repintura)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000057', array[161.0, 110.0, 120.0]::numeric(6,2)[]);
-- fronteira: 299 ainda e anomalia (limite superior da faixa de repintura)
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000058', array[299.0, 110.0, 120.0]::numeric(6,2)[]);
-- fronteira: 300 exato ja e reparacao_colisao
insert into public.paint_measurements (item_response_id, valores_um) values
  ('00000000-0000-0000-0000-000000000059', array[300.0, 110.0, 120.0]::numeric(6,2)[]);

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000051';
  if v_resultado <> 'OK' then
    raise exception 'FALHOU: todos os pontos na faixa de fabrica deveria dar OK (deu %)', v_resultado;
  end if;
  raise notice 'OK: todos os pontos 70-160 calcula OK';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000052';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: ponto abaixo de 70 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: um ponto abaixo de 70 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000053';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: ponto em 161-299 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: um ponto em 161-299 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000054';
  if v_resultado <> 'reparacao_colisao' then
    raise exception 'FALHOU: ponto >=300 deveria dar reparacao_colisao mesmo com outros pontos normais (deu %)', v_resultado;
  end if;
  raise notice 'OK: um ponto >=300 calcula reparacao_colisao mesmo com o pior caso vencendo sobre pontos normais';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000055';
  if v_resultado <> 'OK' then
    raise exception 'FALHOU: 70 e 160 exatos deveriam dar OK (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteiras 70 e 160 calculam OK (inclusive)';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000056';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: 69 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteira 69 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000057';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: 161 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteira 161 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000058';
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: 299 deveria dar anomalia (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteira 299 calcula anomalia';
end $$;

do $$
declare v_resultado paint_resultado;
begin
  select resultado_calculado into v_resultado from public.paint_measurements where item_response_id = '00000000-0000-0000-0000-000000000059';
  if v_resultado <> 'reparacao_colisao' then
    raise exception 'FALHOU: 300 exato deveria dar reparacao_colisao (deu %)', v_resultado;
  end if;
  raise notice 'OK: fronteira 300 calcula reparacao_colisao';
end $$;

do $$
begin
  begin
    insert into public.paint_measurements (item_response_id, valores_um, resultado_calculado)
      values ('00000000-0000-0000-0000-000000000051', array[100.0, 110.0, 120.0]::numeric(6,2)[], 'OK');
    raise exception 'FALHOU: resultado_calculado deveria ser generated (nao aceitar insert explicito)';
  exception when generated_always then
    raise notice 'OK: resultado_calculado rejeita valor explicito (e generated always)';
  end;
end $$;

rollback;
