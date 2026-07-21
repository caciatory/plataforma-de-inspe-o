begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 907, 'Pneus Teste Lote');
insert into public.checklist_item_templates (id, group_id, nome, tipo, grupo_replicacao) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Pneu A', 'padrao', 'pneus-teste-lote'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Pneu B', 'padrao', 'pneus-teste-lote'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000020', 'Pneu C', 'padrao', 'pneus-teste-lote');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}';

-- Cenario A: lote de 3 itens com sucesso, numa chamada so.
do $$
declare
  v_count int;
begin
  perform public.apply_classificacao_batch(
    '00000000-0000-0000-0000-000000000010',
    '[
      {"item_template_id":"00000000-0000-0000-0000-000000000021","classificacao":"otimo","observacao":"Sem avarias"},
      {"item_template_id":"00000000-0000-0000-0000-000000000022","classificacao":"otimo","observacao":null},
      {"item_template_id":"00000000-0000-0000-0000-000000000023","classificacao":"medio","observacao":"Desgaste leve"}
    ]'::jsonb
  );

  select count(*) into v_count from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010'
      and item_template_id in (
        '00000000-0000-0000-0000-000000000021',
        '00000000-0000-0000-0000-000000000022',
        '00000000-0000-0000-0000-000000000023'
      )
      and status = 'respondido';

  if v_count <> 3 then
    raise exception 'FALHOU: esperava 3 itens respondido apos o lote, encontrou %', v_count;
  end if;

  raise notice 'OK: lote de 3 itens grava tudo numa chamada';
end $$;

-- Cenario B: reaplicar faz upsert, nao duplica linha.
do $$
declare
  v_count int;
  v_classificacao public.item_classificacao;
begin
  perform public.apply_classificacao_batch(
    '00000000-0000-0000-0000-000000000010',
    '[{"item_template_id":"00000000-0000-0000-0000-000000000021","classificacao":"medio","observacao":"Revisado"}]'::jsonb
  );

  select count(*), max(classificacao) into v_count, v_classificacao
    from public.checklist_item_responses
    where inspection_id = '00000000-0000-0000-0000-000000000010'
      and item_template_id = '00000000-0000-0000-0000-000000000021';

  if v_count <> 1 or v_classificacao <> 'medio' then
    raise exception 'FALHOU: upsert deveria ter 1 linha com medio, encontrou % linha(s) / %', v_count, v_classificacao;
  end if;

  raise notice 'OK: reaplicar faz upsert, nao duplica';
end $$;

-- Forca checagem imediata da trigger deferred de RF-16 (migration 00013)
-- pro cenario C conseguir testar o bloqueio dentro desta transacao.
set constraints all immediate;

-- Cenario C: um item do lote marcado ruim sem foto bloqueia O LOTE INTEIRO
-- -- inclusive o item valido que estava no mesmo lote (atomicidade real).
do $$
declare
  v_classificacao_21_antes public.item_classificacao;
  v_classificacao_21_depois public.item_classificacao;
begin
  select classificacao into v_classificacao_21_antes from public.checklist_item_responses
    where item_template_id = '00000000-0000-0000-0000-000000000021'
      and inspection_id = '00000000-0000-0000-0000-000000000010';

  begin
    perform public.apply_classificacao_batch(
      '00000000-0000-0000-0000-000000000010',
      '[
        {"item_template_id":"00000000-0000-0000-0000-000000000021","classificacao":"otimo","observacao":null},
        {"item_template_id":"00000000-0000-0000-0000-000000000022","classificacao":"ruim","observacao":null}
      ]'::jsonb
    );
    raise exception 'FALHOU: item ruim sem foto no lote deveria ter bloqueado tudo';
  exception when check_violation then
    raise notice 'OK: item ruim sem foto bloqueia o lote inteiro (RF-16)';
  end;

  select classificacao into v_classificacao_21_depois from public.checklist_item_responses
    where item_template_id = '00000000-0000-0000-0000-000000000021'
      and inspection_id = '00000000-0000-0000-0000-000000000010';

  if v_classificacao_21_antes <> v_classificacao_21_depois then
    raise exception 'FALHOU: item 21 nao deveria ter mudado (lote inteiro deveria ter sido revertido)';
  end if;

  raise notice 'OK: item valido do lote nao foi salvo quando outro item do mesmo lote falhou (atomicidade)';
end $$;

rollback;
