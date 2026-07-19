-- supabase/migrations/00011_paint_measurement_point_count.sql
-- RF-19: cada item de medicao aceita de 3 a 5 pontos numericos, definido por item
-- em checklist_item_templates.qtd_pontos_medicao. paint_measurements.valores_um
-- ainda nao valida esse tamanho -- fecha esse buraco via trigger (CHECK simples
-- nao alcanca outra tabela).

create function public.check_valores_um_length() returns trigger
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

  if array_length(new.valores_um, 1) is distinct from v_expected then
    raise exception 'valores_um deve ter % ponto(s) para este item (recebeu %)', v_expected, array_length(new.valores_um, 1)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger paint_measurements_valores_um_length
  before insert or update of valores_um on public.paint_measurements
  for each row execute function public.check_valores_um_length();
