-- supabase/migrations/00054_comentario_obrigatorio_medio_ruim.sql
-- Fase 8 (hardening), item 1: comentario obrigatorio em itens de escolha
-- marcados como medio ou ruim -- mesma regra de negocio do RF-16 (foto
-- obrigatoria), mesmo padrao de constraint trigger. "Medio ou ruim" usa a
-- mesma classificacao por posicao que o relatorio ja usa
-- (resolveEscolhaColorModifier, lib/checklist/siblings.ts): a opcao de
-- menor ordem (excluindo is_na) e "otimo", as demais sao "medio"/"ruim" --
-- so a primeira (otimo) fica de fora da exigencia. Calculado 100% em SQL
-- via ordem/is_na/conjunto_id, sem duplicar a regex de deteccao de N.A.
-- que so existe hoje em TypeScript (NA_LABEL_RE) -- is_na (migration
-- 00041) ja e a fonte estruturada de verdade pra isso.
-- Escopo desta fase: so tipo "escolha" (medicao fica de fora por decisao
-- do usuario). Dados ja salvos antes desta migration nao sao revalidados
-- retroativamente -- so novos inserts/updates de opcao_id/observacao.

create function public.check_exige_comentario() returns trigger
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_exige_comentario boolean;
begin
  if new.opcao_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.opcoes o
    where o.id = new.opcao_id
      and o.is_na = false
      and o.ordem > (
        select min(o2.ordem)
        from public.opcoes o2
        where o2.conjunto_id = o.conjunto_id and o2.is_na = false
      )
  )
  into v_exige_comentario;

  if v_exige_comentario and (new.observacao is null or btrim(new.observacao) = '') then
    raise exception 'COMENTARIO_OBRIGATORIO: esta resposta exige um comentario (item %)', new.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create constraint trigger checklist_item_responses_exige_comentario
  after insert or update of opcao_id, observacao on public.checklist_item_responses
  deferrable initially deferred
  for each row execute function public.check_exige_comentario();
