-- supabase/tests/00054_comentario_obrigatorio_medio_ruim.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'tecnico1@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000001', 'Tecnico Um', 'tecnico1@test.com', 'tecnico');
insert into public.inspections (id, tecnico_id, status, tipo_cliente, objetivo) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'rascunho', 'particular', 'compra');

insert into public.checklist_group_templates (id, ordem, nome) values
  ('00000000-0000-0000-0000-000000000020', 904, 'Grupo Teste Comentario');
insert into public.checklist_item_templates (id, group_id, nome, tipo, conjunto_opcao_id)
  values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000020', 'Item Escolha', 'escolha',
    (select id from public.conjuntos_opcao where nome = 'estado_4'));

-- Uma linha de resposta por cenario -- mesma cautela do teste da 00033.
insert into public.checklist_item_responses (id, inspection_id, item_template_id) values
  ('00000000-0000-0000-0000-000000000060', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021');

-- O trigger e "deferrable initially deferred" -- sem forcar immediate,
-- ele so dispara no COMMIT (que este teste nunca alcanca, so ROLLBACK no
-- fim), entao cada bloco "exception when check_violation" abaixo reportaria
-- falso-OK mesmo numa violacao real. Mesmo ajuste do teste da migration
-- 00033 (RF-16): forcar immediate logo no inicio, antes de qualquer cenario.
set constraints all immediate;

-- Cenario A: opcao Otimo, sem comentario -- nunca deveria exigir, mesmo
-- vazio.
do $$
begin
  update public.checklist_item_responses
    set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Ótimo')
    where id = '00000000-0000-0000-0000-000000000060';
  raise notice 'OK: opcao Otimo sem comentario nao bloqueia';
exception when check_violation then
  raise exception 'FALHOU: opcao Otimo nunca deveria exigir comentario';
end $$;

-- Cenario B: opcao Medio sem comentario deve bloquear.
do $$
begin
  begin
    update public.checklist_item_responses
      set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Médio')
      where id = '00000000-0000-0000-0000-000000000061';
    raise exception 'FALHOU: opcao Medio sem comentario deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: opcao Medio sem comentario bloqueada';
  end;
end $$;

-- Cenario C: opcao Medio COM comentario deve passar.
do $$
begin
  update public.checklist_item_responses
    set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Médio'),
        observacao = 'Desgaste leve, dentro do esperado.'
    where id = '00000000-0000-0000-0000-000000000061';
  raise notice 'OK: opcao Medio com comentario passa';
exception when check_violation then
  raise exception 'FALHOU: opcao Medio com comentario nao deveria ter bloqueado';
end $$;

-- Cenario D: opcao Ruim sem comentario deve bloquear (mesma regra do Medio).
do $$
begin
  begin
    update public.checklist_item_responses
      set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Ruim')
      where id = '00000000-0000-0000-0000-000000000062';
    raise exception 'FALHOU: opcao Ruim sem comentario deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: opcao Ruim sem comentario bloqueada';
  end;
end $$;

-- Cenario E: opcao N.A. sem comentario nao deve bloquear (excluida do calculo por is_na).
do $$
begin
  update public.checklist_item_responses
    set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'N.A.')
    where id = '00000000-0000-0000-0000-000000000062';
  raise notice 'OK: opcao N.A. sem comentario nao bloqueia';
exception when check_violation then
  raise exception 'FALHOU: opcao N.A. nunca deveria exigir comentario';
end $$;

-- Cenario F: comentario so espacos em branco conta como vazio, deve bloquear.
do $$
begin
  begin
    update public.checklist_item_responses
      set opcao_id = (select o.id from public.opcoes o join public.conjuntos_opcao co on co.id = o.conjunto_id where co.nome = 'estado_4' and o.label = 'Ruim'),
          observacao = '   '
      where id = '00000000-0000-0000-0000-000000000062';
    raise exception 'FALHOU: comentario so com espacos deveria ter bloqueado';
  exception when check_violation then
    raise notice 'OK: comentario so com espacos em branco bloqueado';
  end;
end $$;

rollback;
