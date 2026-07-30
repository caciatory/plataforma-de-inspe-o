-- supabase/tests/00039_equipamentos_inspecao.test.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'tecnicoE@test.com');
insert into public.users (id, nome, email, role) values
  ('00000000-0000-0000-0000-000000000041', 'Tecnico E', 'tecnicoE@test.com', 'tecnico');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000041';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000041"}';

do $$
declare
  v_id uuid;
  v_count int;
  v_sugestao_count int;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'EE-55-FF',
    p_marca => 'VW', p_modelo => 'Golf', p_nome_solicitante => 'Cliente E', p_quilometragem => 1000,
    p_equipamentos => '[
      {"ordem": 0, "categoria": "audio-multimedia", "nome_equipamento": "Bluetooth", "condicao": "bom", "comentario": null, "personalizado": false},
      {"ordem": 1, "categoria": "outros-equipamentos", "nome_equipamento": "Bagageira de teto", "condicao": "atencao", "comentario": "Fecho solto", "personalizado": true}
    ]'::jsonb
  );

  select count(*) into v_count from public.equipamento_inspecao where inspection_id = v_id;
  if v_count <> 2 then
    raise exception 'FALHOU: esperava 2 equipamentos, achei %', v_count;
  end if;

  select count(*) into v_sugestao_count from public.equipamento_sugestoes
    where lower(categoria) = 'outros-equipamentos' and lower(nome) = 'bagageira de teto';
  if v_sugestao_count <> 1 then
    raise exception 'FALHOU: item personalizado deveria ter virado sugestao, achei %', v_sugestao_count;
  end if;

  select count(*) into v_sugestao_count from public.equipamento_sugestoes
    where lower(nome) = 'bluetooth';
  if v_sugestao_count <> 0 then
    raise exception 'FALHOU: item pre-definido (personalizado=false) nao deveria virar sugestao';
  end if;

  raise notice 'OK: create_inspection grava equipamentos e sugestao personalizada';
end $$;

-- ordem preservada
do $$
declare
  v_id uuid;
  v_primeiro text;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'FF-66-GG',
    p_marca => 'Opel', p_modelo => 'Corsa', p_nome_solicitante => 'Cliente F', p_quilometragem => 1000,
    p_equipamentos => '[
      {"ordem": 0, "categoria": "seguranca", "nome_equipamento": "Airbags", "condicao": "bom", "comentario": null, "personalizado": false},
      {"ordem": 1, "categoria": "seguranca", "nome_equipamento": "ABS/ESP", "condicao": "bom", "comentario": null, "personalizado": false}
    ]'::jsonb
  );
  select nome_equipamento into v_primeiro from public.equipamento_inspecao
    where inspection_id = v_id order by ordem asc limit 1;
  if v_primeiro <> 'Airbags' then
    raise exception 'FALHOU: ordem nao preservada, primeiro item foi %', v_primeiro;
  end if;
  raise notice 'OK: ordem dos equipamentos preservada';
end $$;

-- dedupe de sugestao (mesmo nome/categoria, capitalizacao diferente)
do $$
declare
  v_id uuid;
  v_count int;
begin
  v_id := public.create_inspection(
    p_tipo_cliente => 'particular', p_objetivo => 'compra', p_matricula => 'GG-77-HH',
    p_marca => 'Kia', p_modelo => 'Rio', p_nome_solicitante => 'Cliente G', p_quilometragem => 1000,
    p_equipamentos => '[{"ordem": 0, "categoria": "outros-equipamentos", "nome_equipamento": "BAGAGEIRA DE TETO", "condicao": "bom", "comentario": null, "personalizado": true}]'::jsonb
  );
  select count(*) into v_count from public.equipamento_sugestoes
    where lower(categoria) = 'outros-equipamentos' and lower(nome) = 'bagageira de teto';
  if v_count <> 1 then
    raise exception 'FALHOU: deveria ter deduplicado por lower(), achei % linhas', v_count;
  end if;
  raise notice 'OK: sugestao personalizada deduplicada por categoria+nome case-insensitive';
end $$;

rollback;
