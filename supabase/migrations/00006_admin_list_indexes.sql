-- supabase/migrations/00006_admin_list_indexes.sql
create index if not exists idx_inspections_tecnico on public.inspections (tecnico_id);
create index if not exists idx_inspections_status on public.inspections (status);
create index if not exists idx_inspections_data_abertura on public.inspections (data_abertura desc);

-- RF-58: busca livre por matrícula/cliente/modelo — pg_trgm é extensão nativa do Postgres,
-- cobre ILIKE '%termo%' com índice, sem precisar de motor de busca externo (Elasticsearch etc.)
create extension if not exists pg_trgm;
create index if not exists idx_vehicle_data_matricula_trgm on public.vehicle_data using gin (matricula gin_trgm_ops);
create index if not exists idx_vehicle_data_modelo_trgm on public.vehicle_data using gin (modelo gin_trgm_ops);
create index if not exists idx_client_data_nome_trgm on public.client_data using gin (nome_solicitante gin_trgm_ops);
