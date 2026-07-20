-- RF-35: admins must be able to upload photos to any inspection they create
-- (even approved/finalized ones). Add admin bypass to fotos_inspecao insert policy
-- to match pattern in public.photos policy (00009_rls_checklist_media.sql).

drop policy fotos_inspecao_insert on storage.objects;

create policy fotos_inspecao_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-inspecao'
    and (public.is_admin() or public.owns_editable_inspection((storage.foldername(name))[1]::uuid))
  );
