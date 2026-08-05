begin;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.opcoes where is_na = true;
  if v_count <> 6 then
    raise exception 'FALHOU: esperava 6 opcoes N.A. no seed real (deu %)', v_count;
  end if;
  raise notice 'OK: 6 opcoes N.A. identificadas no backfill';
end $$;

do $$
declare v_is_na boolean;
begin
  select is_na into v_is_na from public.opcoes
  where conjunto_id = (select id from public.conjuntos_opcao where nome = 'nivel_saturacao') and label = 'N.A. (gasolina)';
  if v_is_na is not true then
    raise exception 'FALHOU: "N.A. (gasolina)" deveria ser is_na=true (mesmo padrao do NA_LABEL_RE do cliente)';
  end if;
  raise notice 'OK: variante "N.A. (gasolina)" tambem classificada, nao so "N.A." exato';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.opcoes where is_na = true and label !~* '^n\.?a\.?(\s|\(|$)';
  if v_count <> 0 then
    raise exception 'FALHOU: ha opcao marcada is_na=true cujo rotulo nao bate com o padrao N.A.';
  end if;
  raise notice 'OK: nenhum falso positivo no backfill';
end $$;

-- Guarda simetrica (achado da revisao final whole-branch): o assert de
-- count(*) = 6 acima e fragil -- quem adicionar uma 7a opcao N.A. real "corrige"
-- o teste so bumpando o numero, sem perceber que isso desativa o detector de
-- drift de verdade. Este assert nao depende de contagem magica: compara
-- is_na contra o padrao do rotulo em toda a tabela, nos dois sentidos (falso
-- positivo E falso negativo), entao continua valendo mesmo se o catalogo crescer.
do $$
declare v_count int;
begin
  select count(*) into v_count from public.opcoes
  where is_na <> (label ~* '^n\.?a\.?(\s|\(|$)');
  if v_count <> 0 then
    raise exception 'FALHOU: % opcao(oes) com is_na dessincronizado do padrao N.A. do rotulo', v_count;
  end if;
  raise notice 'OK: is_na esta sincronizado com o padrao de rotulo N.A. em todas as opcoes (nenhum falso positivo nem negativo)';
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.opcoes
  where is_na = true and label ilike '%funciona%' and label not ilike 'n.a%';
  if v_count <> 0 then
    raise exception 'FALHOU: rotulos como "Nao Funciona" nao deveriam ser marcados N.A. (falso positivo do regex)';
  end if;
  raise notice 'OK: "Nao Funciona" nao e confundido com N.A.';
end $$;

rollback;
