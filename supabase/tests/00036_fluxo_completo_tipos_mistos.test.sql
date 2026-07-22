-- supabase/tests/00036_fluxo_completo_tipos_mistos.test.sql
-- Fix pos-review (final): os testes das Tasks 3-8 cobrem cada tipo de
-- resposta isolado (00030 medicao, 00031 escolha/texto/data no
-- checklist_item_status, 00033 RF-16 pra escolha e medicao separados). Este
-- teste prova que os 4 tipos compostos numa unica inspecao continuam
-- passando pela "espinha" (checklist_item_status, medicoes_resultado,
-- check_exige_foto) sem um tipo atrapalhar o outro -- fim a fim, nao por
-- partes.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 904, 'Grupo Teste Fluxo Completo');

insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item Escolha', 'escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'));
insert into public.checklist_item_templates (id, group_id, nome, tipo, qtd_pontos_medicao, faixa_min_ok, faixa_max_ok, limiar_critico_superior) values
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000020', 'Item Medicao', 'medicao', 1, 70, 160, 300);
insert into public.checklist_item_templates (id, group_id, nome, tipo) values
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000020', 'Item Texto', 'texto'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000020', 'Item Data', 'data');

-- Uma resposta por item, todas na mesma inspecao (010) -- e o ponto deste
-- teste: os 4 tipos compostos, nao isolados em inspecoes/transacoes
-- separadas como nos testes por-task.
insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022'),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000023'),
  ('00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000024');

-- Os dois itens com exige_foto (escolha=Ruim, medicao=critico) precisam da
-- foto anexada ANTES do "set constraints all immediate", ainda em modo
-- deferred -- mesmo padrao de supabase/tests/00033_rf16_generico.test.sql
-- (senao o primeiro insert isolado dispara o check_exige_foto antes da foto
-- existir e falha por engano).

-- Item escolha: opcao 'Ruim' (exige_foto=true no conjunto estado_4) + foto.
update public.checklist_item_responses
  set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Ruim')
  where id = '00000000-0000-0000-0000-000000000060';
insert into public.photos (inspection_id, item_response_id, contexto, url)
  values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000060', 'item', 'https://example.com/foto-escolha.jpg');

-- Item medicao: valor >= limiar_critico_superior (300) => resultado 'critico' + foto.
insert into public.medicoes (item_response_id, valores) values ('00000000-0000-0000-0000-000000000061', array[300.0]::numeric(8,2)[]);
insert into public.photos (inspection_id, item_response_id, contexto, url)
  values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000061', 'item', 'https://example.com/foto-medicao.jpg');

do $$
begin
  execute 'set constraints all immediate';
  raise notice 'OK: opcao Ruim com foto e medicao critica com foto (mesma inspecao) nao bloqueiam';
exception when check_violation then
  raise exception 'FALHOU: nenhum dos dois casos com foto deveria ter bloqueado';
end $$;

-- Itens texto e data nao passam por check_exige_foto -- podem ser
-- preenchidos direto, ja em modo immediate.
update public.checklist_item_responses set resposta_texto = 'ABC123' where id = '00000000-0000-0000-0000-000000000062';
update public.checklist_item_responses set resposta_data = '2026-01-01' where id = '00000000-0000-0000-0000-000000000063';

do $$
declare
  v_escolha boolean;
  v_medicao boolean;
  v_texto boolean;
  v_data boolean;
  v_resultado public.medicao_resultado;
begin
  select respondido into v_escolha from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000060';
  select respondido into v_medicao from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000061';
  select respondido into v_texto from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000062';
  select respondido into v_data from public.checklist_item_status where response_id = '00000000-0000-0000-0000-000000000063';

  if v_escolha is not true then
    raise exception 'FALHOU: item escolha deveria estar respondido';
  end if;
  if v_medicao is not true then
    raise exception 'FALHOU: item medicao deveria estar respondido';
  end if;
  if v_texto is not true then
    raise exception 'FALHOU: item texto deveria estar respondido';
  end if;
  if v_data is not true then
    raise exception 'FALHOU: item data deveria estar respondido';
  end if;
  raise notice 'OK: os 4 tipos ficam respondido=true via checklist_item_status na mesma inspecao';

  select resultado into v_resultado from public.medicoes_resultado where item_response_id = '00000000-0000-0000-0000-000000000061';
  if v_resultado is distinct from 'critico'::public.medicao_resultado then
    raise exception 'FALHOU: medicoes_resultado deveria ser critico para o item de medicao (obteve %)', v_resultado;
  end if;
  raise notice 'OK: medicoes_resultado.resultado = critico pro item de medicao';
end $$;

rollback;
