-- RF-15/16/21: bucket de Storage pras fotos de item -- nao existia nenhum ate
-- aqui, photos.url so guardava texto sem nada que o preenchesse. Publico
-- (decisao do design: docs/superpowers/specs/2026-07-20-preenchimento-item-
-- design.md secao 2) -- leitura nao passa por RLS, so o upload.
--
-- path convention: {inspection_id}/{item_template_id}/{filename} -- primeiro
-- segmento e sempre o inspection_id, e o que a policy abaixo usa.

insert into storage.buckets (id, name, public)
values ('fotos-inspecao', 'fotos-inspecao', true);

create policy fotos_inspecao_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos-inspecao'
    and public.owns_editable_inspection((storage.foldername(name))[1]::uuid)
  );

-- ponytail: sem policy de DELETE aqui de proposito -- excluir foto (RF-17) so
-- apaga a linha em public.photos (Task 4), o objeto fica orfao no bucket
-- (publico, custo irrelevante). Adicionar policy de DELETE + limpeza se isso
-- virar problema real.
--
-- NOTE: initial insert policy lacked admin bypass (RF-35 requires admins to edit
-- any inspection including approved/finalized). Fixed in migration 00022.
