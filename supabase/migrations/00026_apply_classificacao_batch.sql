-- supabase/migrations/00026_apply_classificacao_batch.sql
-- Fase 2.5: docs/superpowers/specs/2026-07-21-aplicar-aos-demais-design.md
-- secao 4. Escreve varios checklist_item_responses numa transacao so --
-- se um item do lote falhar (ex: RF-16, "ruim" sem foto), o lote inteiro
-- nao e salvo. security invoker: cada linha ainda passa pela RLS de
-- checklist_item_responses_insert/update (migration 00009), igual toda
-- escrita desta tabela.

create function public.apply_classificacao_batch(
  p_inspection_id uuid,
  p_items jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.checklist_item_responses (inspection_id, item_template_id, classificacao, observacao)
    values (
      p_inspection_id,
      (v_item->>'item_template_id')::uuid,
      (v_item->>'classificacao')::public.item_classificacao,
      v_item->>'observacao'
    )
    on conflict (inspection_id, item_template_id) do update
      set classificacao = excluded.classificacao,
          observacao = excluded.observacao,
          atualizado_em = now();
  end loop;
end;
$$;
