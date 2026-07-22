-- supabase/migrations/00030_medicoes_generalizado.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 5. paint_measurements (so tinta, valores_um, resultado_calculado
-- hardcoded em 3 faixas fixas de micrometro) generaliza pra qualquer
-- unidade de medicao. ALTER TABLE/COLUMN RENAME carregam RLS, triggers e
-- indices automaticamente (Postgres resolve por OID/attnum, nao por nome) --
-- so as policies e a PK ganham nomes novos por clareza, nao porque
-- precisassem.
--
-- resultado_calculado deixa de ser gerado a partir de constantes fixas no
-- codigo e vira medicoes_resultado, uma view que le os limiares
-- configuraveis de checklist_item_templates (faixa_min_ok/faixa_max_ok/
-- limiar_critico_*, Task 3) -- view, nao coluna gerada, pelo mesmo motivo
-- de checklist_item_status (Task 5): precisa ler outra tabela.
--
-- Pra tinta, faixa_min_ok=70/faixa_max_ok=160/limiar_critico_superior=300
-- (setados no backfill da Task 3) reproduzem exatamente os thresholds
-- hardcoded da migration 00012 -- nenhuma mudanca de resultado pra itens
-- de tinta ja seedados.
--
-- save_paint_measurement referencia paint_measurements e paint_resultado no
-- corpo -- fica quebrada ate a Task 7 a substituir. Derrubada aqui de
-- proposito: falha limpa "function does not exist" em vez de um erro de
-- cast confuso se alguem chamar nesse meio-tempo.
--
-- O trigger paint_measurements_valores_um_length (migration 00011) e a
-- funcao que ele chama sao a excecao ao "rename carrega tudo": o corpo em
-- PL/pgSQL referencia NEW.valores_um por nome de campo (resolvido em
-- runtime contra o tipo da linha), e a clausula "UPDATE OF valores_um" do
-- proprio trigger tranca o ALTER TYPE seguinte (SQLSTATE 0A000: "cannot
-- alter type of a column used in a trigger definition"). Drop + recreate
-- com o nome de coluna novo, sem mudar a logica de validacao.

drop function if exists public.save_paint_measurement(uuid, uuid, numeric[], text);

drop trigger paint_measurements_valores_um_length on public.paint_measurements;

alter table public.paint_measurements rename to medicoes;
alter table public.medicoes rename constraint paint_measurements_pkey to medicoes_pkey;
alter table public.medicoes rename column valores_um to valores;
-- resultado_calculado (generated) depende de valores -- precisa cair antes do
-- ALTER TYPE, senao Postgres recusa alterar o tipo de uma coluna usada por
-- coluna gerada (SQLSTATE 0A000).
alter table public.medicoes drop column resultado_calculado;
alter table public.medicoes alter column valores type numeric(8,2)[] using valores::numeric(8,2)[];

drop type public.paint_resultado;

alter policy paint_measurements_select on public.medicoes rename to medicoes_select;
alter policy paint_measurements_insert on public.medicoes rename to medicoes_insert;
alter policy paint_measurements_update on public.medicoes rename to medicoes_update;

create or replace function public.check_valores_um_length() returns trigger
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_expected int;
begin
  select cit.qtd_pontos_medicao into v_expected
  from public.checklist_item_responses cir
  join public.checklist_item_templates cit on cit.id = cir.item_template_id
  where cir.id = new.item_response_id;

  if v_expected is null then
    raise exception 'item_response % nao esta associado a um item de medicao valido', new.item_response_id
      using errcode = 'check_violation';
  end if;

  if array_length(new.valores, 1) is distinct from v_expected then
    raise exception 'valores deve ter % ponto(s) para este item (recebeu %)', v_expected, array_length(new.valores, 1)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger medicoes_valores_length
  before insert or update of valores on public.medicoes
  for each row execute function public.check_valores_um_length();

create type public.medicao_resultado as enum ('ok', 'atencao', 'critico');

create view public.medicoes_resultado as
select m.item_response_id,
  case
    when t.limiar_critico_superior is not null and public.array_max_numeric(m.valores) >= t.limiar_critico_superior then 'critico'
    when t.limiar_critico_inferior is not null and public.array_min_numeric(m.valores) <= t.limiar_critico_inferior then 'critico'
    when t.faixa_min_ok is not null and public.array_min_numeric(m.valores) < t.faixa_min_ok then 'atencao'
    when t.faixa_max_ok is not null and public.array_max_numeric(m.valores) > t.faixa_max_ok then 'atencao'
    when t.faixa_min_ok is null and t.faixa_max_ok is null
      and t.limiar_critico_inferior is null and t.limiar_critico_superior is null then null
    else 'ok'
  end::public.medicao_resultado as resultado
from public.medicoes m
join public.checklist_item_responses r on r.id = m.item_response_id
join public.checklist_item_templates t on t.id = r.item_template_id;
