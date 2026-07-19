-- supabase/migrations/00013_ruim_requires_photo.sql
-- RF-16: quando a classificacao for 'ruim', pelo menos 1 foto e obrigatoria antes
-- de avancar/salvar o item. E uma invariante entre duas tabelas
-- (checklist_item_responses x photos), entao nao da pra expressar como CHECK
-- simples -- usa constraint trigger deferravel, checada so no fim da transacao
-- (equivalente a "salvar o item"), para permitir marcar ruim e anexar a foto na
-- mesma transacao sem bloquear um passo no meio do caminho.

create function public.check_ruim_requires_photo() returns trigger
language plpgsql
security invoker set search_path = ''
as $$
declare
  v_response_id uuid;
  v_classificacao public.item_classificacao;
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

  select classificacao into v_classificacao
  from public.checklist_item_responses
  where id = v_response_id;

  if v_classificacao = 'ruim' then
    select count(*) into v_photo_count
    from public.photos
    where item_response_id = v_response_id and contexto = 'item';

    if v_photo_count = 0 then
      raise exception 'RF-16: item % classificado como ruim precisa de pelo menos 1 foto', v_response_id
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create constraint trigger checklist_item_responses_ruim_requires_photo
  after insert or update of classificacao on public.checklist_item_responses
  deferrable initially deferred
  for each row execute function public.check_ruim_requires_photo();

create constraint trigger photos_ruim_requires_photo
  after delete on public.photos
  deferrable initially deferred
  for each row execute function public.check_ruim_requires_photo();
