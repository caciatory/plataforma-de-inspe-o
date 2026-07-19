-- supabase/migrations/00014_photos_delete_policy.sql
-- RF-17: fotos podem ser removidas pelo tecnico enquanto a inspecao nao estiver
-- finalizada. A branch de RLS anterior deixou de proposito sem nenhuma policy de
-- DELETE em nenhuma tabela ("se surgir necessidade real depois, adiciona-se uma
-- policy pontual ai" -- design spec da branch rls-policies, secao 1); este e esse
-- "depois", motivado por RF-17. Fora de photos, nenhuma outra tabela precisa de
-- DELETE ainda -- as demais continuam sem policy de DELETE.

create policy photos_delete on public.photos
  for delete to authenticated
  using (
    public.is_admin()
    or (public.owns_editable_inspection(inspection_id) and contexto = 'item')
  );
