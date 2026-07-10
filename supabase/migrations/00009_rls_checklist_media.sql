alter table public.checklist_group_templates enable row level security;

create policy checklist_group_templates_select on public.checklist_group_templates
  for select to authenticated
  using (true);

alter table public.checklist_item_templates enable row level security;

create policy checklist_item_templates_select on public.checklist_item_templates
  for select to authenticated
  using (true);

alter table public.checklist_item_responses enable row level security;

create policy checklist_item_responses_select on public.checklist_item_responses
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy checklist_item_responses_insert on public.checklist_item_responses
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

create policy checklist_item_responses_update on public.checklist_item_responses
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id))
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

alter table public.paint_measurements enable row level security;

create policy paint_measurements_select on public.paint_measurements
  for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.checklist_item_responses cir
      where cir.id = paint_measurements.item_response_id
        and public.owns_inspection(cir.inspection_id)
    )
  );

create policy paint_measurements_insert on public.paint_measurements
  for insert to authenticated
  with check (
    public.is_admin() or exists (
      select 1 from public.checklist_item_responses cir
      where cir.id = paint_measurements.item_response_id
        and public.owns_editable_inspection(cir.inspection_id)
    )
  );

create policy paint_measurements_update on public.paint_measurements
  for update to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.checklist_item_responses cir
      where cir.id = paint_measurements.item_response_id
        and public.owns_editable_inspection(cir.inspection_id)
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from public.checklist_item_responses cir
      where cir.id = paint_measurements.item_response_id
        and public.owns_editable_inspection(cir.inspection_id)
    )
  );

alter table public.photos enable row level security;

create policy photos_select on public.photos
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy photos_insert on public.photos
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.owns_editable_inspection(inspection_id) and contexto = 'item')
  );

create policy photos_update on public.photos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
