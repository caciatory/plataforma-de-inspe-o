-- supabase/tests/00033_rf16_generico.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');
-- Segunda inspecao (011) so existe pra dar aos cenarios B/D uma
-- (inspection_id, item_template_id) livre -- checklist_item_responses tem
-- unique nesse par (migration 00003) e os 4 cenarios reusam so 2 templates.

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 903, 'Grupo Teste RF16');
insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id)
  values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item Escolha', 'escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'));
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao, faixa_min_ok, faixa_max_ok, limiar_critico_superior)
  values ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item Medicao', 'medicao', 1, 70, 160, 300);

-- Uma linha de resposta por cenario -- evita depender de como o savepoint
-- implicito de um bloco "exception" reverte (ou nao) um UPDATE anterior
-- feito na mesma linha; mesma cautela do teste original da migration 00013.
insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022'),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000022');

-- Cenarios A e C preparam os dois casos "felizes" (opcao Ruim + foto;
-- medicao critica + foto) ENQUANTO AINDA EM MODO DEFERRED -- forcar
-- immediate faz o Postgres ficar em modo immediate pro resto da transacao
-- (mesmo comportamento da migration 00013), entao os dois setups multi-
-- statement precisam terminar antes do primeiro "set constraints all
-- immediate"; senao o segundo setup dispararia o check no meio do caminho
-- (ex: so o insert em medicoes, antes da foto) e falharia por engano.

-- Cenario A (mesmo padrao da migration 00013): marcar Ruim e anexar a foto
-- na mesma transacao, ainda deferred.
update public.checklist_item_responses
  set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Ruim')
  where id = '00000000-0000-0000-0000-000000000060';
insert into public.photos (inspection_id, item_response_id, contexto, url)
  values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000060', 'item', 'https://example.com/foto.jpg');

-- Cenario C: medicao com resultado critico e foto anexada, ainda deferred.
insert into public.medicoes (item_response_id, valores) values ('00000000-0000-0000-0000-000000000062', array[300.0]::numeric(8,2)[]);
insert into public.photos (inspection_id, item_response_id, contexto, url)
  values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000062', 'item', 'https://example.com/foto-medicao.jpg');

do $$
begin
  execute 'set constraints all immediate';
  raise notice 'OK: opcao Ruim com foto e medicao critica com foto (ambas na mesma transacao) passam';
exception when check_violation then
  raise exception 'FALHOU: nenhum dos dois casos com foto deveria ter bloqueado';
end $$;

-- A partir daqui a sessao esta em modo IMMEDIATE pro resto da transacao.

-- Cenario B: marcar Ruim (linha separada) sem nenhuma foto deve bloquear.
do $$
begin
  begin
    update public.checklist_item_responses
      set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Ruim')
      where id = '00000000-0000-0000-0000-000000000061';
    raise exception 'FALHOU: opcao Ruim sem foto deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: opcao com exige_foto=true sem foto bloqueado';
  end;
end $$;

-- Cenario D: medicao com resultado critico (linha separada) sem foto deve bloquear.
do $$
begin
  begin
    insert into public.medicoes (item_response_id, valores) values ('00000000-0000-0000-0000-000000000063', array[300.0]::numeric(8,2)[]);
    raise exception 'FALHOU: medicao critica sem foto deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: medicao com resultado critico sem foto bloqueada';
  end;
end $$;

rollback;
