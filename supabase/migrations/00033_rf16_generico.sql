-- supabase/migrations/00033_rf16_generico.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 6. RF-16 checava classificacao = 'ruim', uma string fixa. Generaliza
-- pra checar duas fontes: resposta tipo escolha cuja opcao tem
-- exige_foto=true, OU resposta tipo medicao cujo resultado calculado
-- (medicoes_resultado, Task 4) e 'critico'. O branch que resolve
-- v_response_id a partir de item_response_id (usado por photos e agora
-- tambem por medicoes) ja era generico o bastante -- nao muda.
--
-- Os triggers antigos (checklist_item_responses_ruim_requires_photo,
-- photos_ruim_requires_photo) e a funcao check_ruim_requires_photo() ja
-- foram derrubados na migration 00031 (Task 5), porque referenciavam a
-- coluna classificacao que aquela migration removeu -- nada a dropar aqui.

create function public.check_exige_foto() returns trigger
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_response_id uuid;
  v_exige_foto boolean;
  v_photo_count int;
begin
  if TG_TABLE_NAME = 'checklist_item_responses' then
    v_response_id := new.id;
  else
    v_response_id := coalesce(old.item_response_id, new.item_response_id);
    if v_response_id is null then
      return coalesce(new, old);
    end if;
  end if;

  select coalesce(o.exige_foto, false) or coalesce(mr.resultado = 'critico', false)
  into v_exige_foto
  from public.checklist_item_responses r
  left join public.opcoes o on o.id = r.opcao_id
  left join public.medicoes_resultado mr on mr.item_response_id = r.id
  where r.id = v_response_id;

  if v_exige_foto then
    select count(*) into v_photo_count
    from public.photos
    where item_response_id = v_response_id and contexto = 'item';

    if v_photo_count = 0 then
      raise exception 'RF-16: esta resposta exige pelo menos 1 foto (item %)', v_response_id
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create constraint trigger checklist_item_responses_exige_foto
  after insert or update of opcao_id on public.checklist_item_responses
  deferrable initially deferred
  for each row execute function public.check_exige_foto();

create constraint trigger photos_exige_foto
  after delete on public.photos
  deferrable initially deferred
  for each row execute function public.check_exige_foto();

create constraint trigger medicoes_exige_foto
  after insert or update of valores on public.medicoes
  deferrable initially deferred
  for each row execute function public.check_exige_foto();
