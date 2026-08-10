-- supabase/migrations/00049_equipamento_fotos_delete_policy.sql
-- Fixes silent photo-replacement failure in editar flow: missing DELETE RLS policy on equipamento_fotos
-- prevents uploadEquipamentoFotos (actions.ts lines 193-197) from deleting stale photo rows
-- during edit-time photo slot replacement, causing duplicate photo rows per slot.
-- Mirrors equipamento_inspecao_delete policy from 00048 (same inspection-scoped permission model).

create policy equipamento_fotos_delete on public.equipamento_fotos
  for delete to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id));
