begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 901, 'Grupo Teste Medicoes');
insert into public.checklist_item_templates
  (id, group_id, nome, tipo, qtd_pontos_medicao, unidade_medicao, faixa_min_ok, faixa_max_ok, limiar_critico_superior) values
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000020', 'Item OK', 'medicao', 3, 'µm', 70, 160, 300),
  ('00000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000020', 'Item Atencao', 'medicao', 3, 'µm', 70, 160, 300),
  ('00000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000020', 'Item Critico', 'medicao', 3, 'µm', 70, 160, 300);
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000020', 'Item Sem Faixa', 'medicao', 1);

insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000042'),
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000043'),
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000044');

insert into public.medicoes (item_response_id, valores) values
  ('00000000-0000-0000-0000-000000000051', array[70.0, 160.0, 120.0]::numeric(8,2)[]),
  ('00000000-0000-0000-0000-000000000052', array[69.0, 110.0, 120.0]::numeric(8,2)[]),
  ('00000000-0000-0000-0000-000000000053', array[300.0, 110.0, 120.0]::numeric(8,2)[]),
  ('00000000-0000-0000-0000-000000000054', array[42.0]::numeric(8,2)[]);

do $$
declare v_resultado public.medicao_resultado;
begin
  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000051';
  if v_resultado <> 'ok' then
    raise exception 'FALHOU: fronteiras 70/160 deveriam dar ok (deu %)', v_resultado;
  end if;
  raise notice 'OK: valores dentro da faixa (fronteiras inclusive) calculam ok';
end $$;

do $$
declare v_resultado public.medicao_resultado;
begin
  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000052';
  if v_resultado <> 'atencao' then
    raise exception 'FALHOU: ponto abaixo de 70 deveria dar atencao (deu %)', v_resultado;
  end if;
  raise notice 'OK: ponto abaixo da faixa calcula atencao';
end $$;

do $$
declare v_resultado public.medicao_resultado;
begin
  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000053';
  if v_resultado <> 'critico' then
    raise exception 'FALHOU: ponto >=300 deveria dar critico (deu %)', v_resultado;
  end if;
  raise notice 'OK: ponto acima do limiar critico calcula critico (pior caso vence)';
end $$;

do $$
declare v_resultado public.medicao_resultado;
begin
  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000054';
  if v_resultado is not null then
    raise exception 'FALHOU: item sem faixa configurada deveria dar resultado null (deu %)', v_resultado;
  end if;
  raise notice 'OK: item de medicao sem faixa configurada nao calcula resultado (valor bruto)';
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'medicoes' and policyname = 'medicoes_select') then
    raise exception 'FALHOU: policy medicoes_select deveria existir apos o rename';
  end if;
  raise notice 'OK: RLS sobrevive ao rename da tabela';
end $$;

rollback;
