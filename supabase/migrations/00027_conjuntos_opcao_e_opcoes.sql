-- supabase/migrations/00027_conjuntos_opcao_e_opcoes.sql
-- Peca 1: docs/superpowers/specs/2026-07-22-modelo-generico-tipos-resposta-design.md
-- secao 2. Catalogo compartilhado de conjuntos de opcoes -- ~20 conjuntos
-- (Bom/Medio/Mau, Funciona/Nao Funciona/N.A., etc.) se repetem em ~260 dos
-- 360 itens do checklist v7; um catalogo evita duplicar rotulos centenas de
-- vezes e centraliza a flag exige_foto (substitui o RF-16 fixo em 'ruim')
-- por opcao, num lugar so.

create table public.conjuntos_opcao (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

create table public.opcoes (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos_opcao(id) on delete cascade,
  label text not null,
  ordem int not null,
  exige_foto boolean not null default false
);

create index on public.opcoes (conjunto_id);

alter table public.conjuntos_opcao enable row level security;

create policy conjuntos_opcao_select on public.conjuntos_opcao
  for select to authenticated
  using (true);

alter table public.opcoes enable row level security;

create policy opcoes_select on public.opcoes
  for select to authenticated
  using (true);

-- Conjunto default que reproduz a classificacao universal de hoje
-- (item_classificacao: otimo/medio/ruim/NF) -- usado no backfill dos 320
-- itens existentes (Task 3), ate a Peca 2 (re-seed do checklist v7) trazer
-- os conjuntos reais.
insert into public.conjuntos_opcao (nome) values ('estado_4');

insert into public.opcoes (conjunto_id, label, ordem, exige_foto)
select co.id, v.label, v.ordem, v.exige_foto
from public.conjuntos_opcao co
cross join (values
  ('Ótimo', 1, false),
  ('Médio', 2, false),
  ('Ruim', 3, true),
  ('N.A.', 4, false)
) as v(label, ordem, exige_foto)
where co.nome = 'estado_4';
