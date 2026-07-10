-- supabase/migrations/00008_rls_helpers_and_core.sql
-- RLS policies — Inspecta v1.0. Mapa de Permissões: docs/especificacao-tecnica-v1.md §3.
-- Design: docs/superpowers/specs/2026-07-10-inspecta-rls-policies-design.md

create function public.is_admin() returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid()) and role = 'admin'
  )
$$;

create function public.owns_inspection(insp_id uuid) returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.inspections
    where id = insp_id and tecnico_id = (select auth.uid())
  )
$$;

create function public.owns_editable_inspection(insp_id uuid) returns boolean
language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.inspections
    where id = insp_id and tecnico_id = (select auth.uid())
      and status in ('rascunho', 'devolvida')
  )
$$;

alter table public.users enable row level security;

create policy users_select on public.users
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

alter table public.inspections enable row level security;

create policy inspections_select on public.inspections
  for select to authenticated
  using (public.is_admin() or tecnico_id = (select auth.uid()));

create policy inspections_insert on public.inspections
  for insert to authenticated
  with check (public.is_admin() or tecnico_id = (select auth.uid()));

create policy inspections_update on public.inspections
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(id))
  with check (public.is_admin() or tecnico_id = (select auth.uid()));

alter table public.vehicle_data enable row level security;

create policy vehicle_data_select on public.vehicle_data
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy vehicle_data_insert on public.vehicle_data
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

create policy vehicle_data_update on public.vehicle_data
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id))
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

alter table public.client_data enable row level security;

create policy client_data_select on public.client_data
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy client_data_insert on public.client_data
  for insert to authenticated
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));

create policy client_data_update on public.client_data
  for update to authenticated
  using (public.is_admin() or public.owns_editable_inspection(inspection_id))
  with check (public.is_admin() or public.owns_editable_inspection(inspection_id));
