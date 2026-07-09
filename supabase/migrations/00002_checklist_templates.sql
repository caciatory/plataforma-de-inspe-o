create type item_template_tipo as enum ('padrao', 'medicao');

create table public.checklist_group_templates (
  id uuid primary key default gen_random_uuid(),
  ordem int not null unique,
  nome text not null
);

create table public.checklist_item_templates (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.checklist_group_templates(id) on delete cascade,
  subcategoria text,
  nome text not null,
  tipo item_template_tipo not null default 'padrao',
  qtd_pontos_medicao int,
  aplica_stand boolean not null default false,
  constraint qtd_pontos_medicao_valido check (
    tipo <> 'medicao' or (qtd_pontos_medicao is not null and qtd_pontos_medicao between 3 and 5)
  )
);

create index on public.checklist_item_templates (group_id);
