-- supabase/migrations/00005_client_access_log.sql
create table public.client_access_logs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  email text not null,
  origem text,
  acessado_em timestamptz not null default now()
);

create index on public.client_access_logs (inspection_id);
