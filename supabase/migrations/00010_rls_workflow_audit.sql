alter table public.review_events enable row level security;

create policy review_events_select on public.review_events
  for select to authenticated
  using (public.is_admin() or public.owns_inspection(inspection_id));

create policy review_events_insert on public.review_events
  for insert to authenticated
  with check (public.is_admin() and autor_id = (select auth.uid()));

alter table public.audit_log_entries enable row level security;

create policy audit_log_entries_select on public.audit_log_entries
  for select to authenticated
  using (public.is_admin());

create policy audit_log_entries_insert on public.audit_log_entries
  for insert to authenticated
  with check (public.is_admin() and admin_id = (select auth.uid()));

-- UPDATE/DELETE need no policy: already REVOKEd from authenticated/anon in
-- 00004_workflow_audit.sql (RNF-11) — RLS SELECT/INSERT here are additive,
-- not a replacement for that revoke.

alter table public.client_access_logs enable row level security;
-- Sem policies: acesso de Cliente/Publico (RF-55/56) e resolvido por uma
-- function/service-role futura, fora do escopo deste RLS. Default-deny
-- total para anon/authenticated, inclusive admin, ate essa peca existir.
