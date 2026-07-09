-- supabase/migrations/00003_checklist_responses_media.sql
create type item_classificacao as enum ('otimo', 'medio', 'ruim', 'NF');
create type item_status as enum ('pendente', 'respondido', 'NF');
create type paint_resultado as enum ('OK', 'anomalia', 'reparacao_colisao');
create type photo_contexto as enum ('item', 'capa');

create table public.checklist_item_responses (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  item_template_id uuid not null references public.checklist_item_templates(id),
  classificacao item_classificacao,
  observacao text,
  status item_status generated always as (
    case
      when classificacao is null then 'pendente'::item_status
      when classificacao = 'NF' then 'NF'::item_status
      else 'respondido'::item_status
    end
  ) stored,
  atualizado_em timestamptz not null default now(),
  unique (inspection_id, item_template_id)
);

create index on public.checklist_item_responses (inspection_id);

create table public.paint_measurements (
  item_response_id uuid primary key references public.checklist_item_responses(id) on delete cascade,
  valores_um numeric(6,2)[] not null,
  resultado_calculado paint_resultado not null
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  item_response_id uuid references public.checklist_item_responses(id) on delete cascade,
  contexto photo_contexto not null,
  url text not null,
  ordem int,
  criado_em timestamptz not null default now(),
  constraint photo_contexto_coerente check (
    (contexto = 'item' and item_response_id is not null)
    or (contexto = 'capa' and item_response_id is null)
  )
);

create index on public.photos (inspection_id);
create index on public.photos (item_response_id);
