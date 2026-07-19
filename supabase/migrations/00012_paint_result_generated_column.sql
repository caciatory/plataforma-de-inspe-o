-- supabase/migrations/00012_paint_result_generated_column.sql
-- RF-20 / RNF-19: resultado_calculado deixa de ser uma coluna gravavel pelo app e
-- passa a ser calculado pelo proprio Postgres a partir de valores_um, com as faixas
-- fixas no codigo (sem tela de configuracao):
--   < 70um        -> anomalia (pintura fina demais / desgaste, ex: polimento agressivo)
--   70um a 160um  -> OK (faixa padrao de fabrica)
--   161um a 299um -> anomalia (repintura provavel, mas sem massa pesada)
--   >= 300um      -> reparacao_colisao (indicio de massa plastica/poliester)
-- Pior caso vence: se qualquer ponto bate reparacao_colisao, o item inteiro fica
-- reparacao_colisao mesmo que os outros pontos estejam dentro da faixa normal.
--
-- Generated columns nao aceitam subquery na expressao (unnest()+max()/min() exige
-- uma), entao a reducao do array vira duas funcoes IMMUTABLE simples, que sao uma
-- chamada de funcao comum do ponto de vista da coluna gerada.

create function public.array_max_numeric(arr numeric[]) returns numeric
language sql immutable
security invoker set search_path = ''
as $$
  select max(v) from unnest(arr) as v
$$;

create function public.array_min_numeric(arr numeric[]) returns numeric
language sql immutable
security invoker set search_path = ''
as $$
  select min(v) from unnest(arr) as v
$$;

alter table public.paint_measurements drop column resultado_calculado;

alter table public.paint_measurements add column resultado_calculado paint_resultado
  generated always as (
    case
      when public.array_max_numeric(valores_um) >= 300 then 'reparacao_colisao'::paint_resultado
      when public.array_min_numeric(valores_um) < 70
        or public.array_max_numeric(valores_um) >= 161 then 'anomalia'::paint_resultado
      else 'OK'::paint_resultado
    end
  ) stored;
