-- supabase/tests/00021_save_paint_measurement.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 904, 'Exterior Teste RPC');
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Espessura de pintura - Capo', 'medicao', 3);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

-- Cenario A: valores na faixa normal (70-160) -> OK -> classificacao 'otimo',
-- status passa a 'respondido' sem nenhuma mudanca na Fase 1.
do $$
declare
  v_response_id uuid;
  v_resultado public.paint_resultado;
  v_classificacao public.item_classificacao;
begin
  select item_response_id, resultado_calculado, classificacao
    into v_response_id, v_resultado, v_classificacao
    from public.save_paint_measurement(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000021',
      array[100, 110, 120]::numeric[],
      'Sem avarias visiveis'
    );

  if v_resultado <> 'OK' or v_classificacao <> 'otimo' then
    raise exception 'FALHOU: esperava OK/otimo, obteve %/%', v_resultado, v_classificacao;
  end if;

  if not exists (
    select 1 from public.checklist_item_responses
    where id = v_response_id and status = 'respondido'
  ) then
    raise exception 'FALHOU: status deveria ser respondido apos salvar medicao';
  end if;

  if not exists (
    select 1 from public.checklist_item_responses
    where id = v_response_id and observacao = 'Sem avarias visiveis'
  ) then
    raise exception 'FALHOU: observacao deveria ter sido gravada na resposta';
  end if;

  raise notice 'OK: valores na faixa normal geram OK/otimo e status respondido';
  raise notice 'OK: observacao passada para save_paint_measurement e gravada na resposta';
end $$;

-- Cenario B: chamar de novo com valores diferentes faz upsert (nao duplica) e
-- recalcula o resultado.
do $$
declare
  v_count int;
  v_resultado public.paint_resultado;
begin
  select resultado_calculado into v_resultado
    from public.save_paint_measurement(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000021',
      array[50, 60, 65]::numeric[],
      null
    );

  select count(*) into v_count from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010'
      and item_template_id = '00000000-0000-0000-0000-000000000021';

  if v_count <> 1 then
    raise exception 'FALHOU: esperava 1 linha de resposta apos upsert, encontrou %', v_count;
  end if;
  if v_resultado <> 'anomalia' then
    raise exception 'FALHOU: esperava anomalia pra minimo 50um, obteve %', v_resultado;
  end if;

  raise notice 'OK: segunda chamada faz upsert (1 linha) e recalcula resultado';
end $$;

-- Forca checagem imediata da trigger deferred de RF-16 (migration 00013) pro
-- cenario C conseguir testar o bloqueio dentro desta mesma transacao.
set constraints all immediate;

-- Cenario C: valor >= 300 -> reparacao_colisao -> classificacao 'ruim' -> exige
-- foto (trigger RF-16 ja existente) -- sem foto, a chamada inteira falha.
do $$
begin
  begin
    perform public.save_paint_measurement(
      '00000000-0000-0000-0000-000000000010',
      '00000000-0000-0000-0000-000000000021',
      array[100, 200, 300]::numeric[],
      null
    );
    raise exception 'FALHOU: reparacao_colisao sem foto deveria ter bloqueado (RF-16)';
  exception when check_violation then
    raise notice 'OK: reparacao_colisao sem foto bloqueado pela trigger RF-16 existente';
  end;
end $$;

rollback;
