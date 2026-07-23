-- supabase/migrations/00035_apply_opcoes_batch.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 7. Generaliza apply_classificacao_batch (derrubada na Task 5) --
-- mesma logica de lote atomico da Fase 2.5 (migration 00026), so troca o
-- valor replicado de classificacao (string fixa) por opcao_id (FK). Se um
-- item do lote falhar (RF-16 via check_exige_foto, Task 6), o lote inteiro
-- nao e salvo -- mesmo comportamento de sempre.

create function public.apply_opcoes_batch(
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
    insert into public.checklist_item_responses (inspection_id, item_template_id, opcao_id, observacao)
    values (
      p_inspection_id,
      (v_item->>'item_template_id')::uuid,
      (v_item->>'opcao_id')::uuid,
      v_item->>'observacao'
    )
    on conflict (inspection_id, item_template_id) do update
      set opcao_id = excluded.opcao_id,
          observacao = excluded.observacao,
          atualizado_em = now();
  end loop;
end;
$$;
