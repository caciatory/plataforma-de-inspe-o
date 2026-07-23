-- supabase/tests/00027_conjuntos_opcao_e_opcoes.test.sql
begin;

do $$
begin
  if (select count(*) from public.conjuntos_opcao where nome = 'estado_4') <> 1 then
    raise exception 'FALHOU: conjunto estado_4 deveria existir uma vez';
  end if;
  raise notice 'OK: conjunto estado_4 existe';
end $$;

do $$
declare
  v_count int;
  v_ruim_exige_foto boolean;
begin
  select count(*) into v_count from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome = 'estado_4';
  if v_count <> 4 then
    raise exception 'FALHOU: estado_4 deveria ter 4 opcoes, tem %', v_count;
  end if;

  select o.exige_foto into v_ruim_exige_foto from public.opcoes o
    join public.conjuntos_opcao co on co.id = o.conjunto_id
    where co.nome = 'estado_4' and o.label = 'Ruim';
  if v_ruim_exige_foto is not true then
    raise exception 'FALHOU: opcao Ruim deveria ter exige_foto = true';
  end if;

  raise notice 'OK: estado_4 tem 4 opcoes, Ruim exige foto';
end $$;

do $$
begin
  begin
    insert into public.opcoes (conjunto_id, label, ordem) values ('00000000-0000-0000-0000-000000000999', 'Teste', 1);
    raise exception 'FALHOU: opcao com conjunto_id inexistente deveria ser bloqueada pela FK';
  exception when foreign_key_violation then
    raise notice 'OK: FK de opcoes.conjunto_id bloqueia conjunto inexistente';
  end;
end $$;

rollback;
