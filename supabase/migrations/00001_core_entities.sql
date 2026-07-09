create extension if not exists pgcrypto;

create type user_role as enum ('tecnico', 'admin');
create type inspection_status as enum ('rascunho', 'aguardando_aprovacao', 'devolvida', 'aprovada', 'cancelada');
create type tipo_cliente as enum ('particular', 'stand');
create type objetivo_inspecao as enum ('compra', 'venda');
create type classificacao_final as enum ('A', 'B', 'C');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null unique,
  role user_role not null default 'tecnico',
  credencial_interna text,
  created_at timestamptz not null default now()
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.users(id),
  status inspection_status not null default 'rascunho',
  tipo_cliente tipo_cliente not null,
  objetivo objetivo_inspecao not null,
  data_abertura date not null default current_date,
  data_finalizacao timestamptz,
  nota_geral numeric(4,2),
  classificacao_final classificacao_final,
  codigo_certificado text unique,
  certificado_emitido_em timestamptz,
  created_at timestamptz not null default now(),
  constraint objetivo_stand_fixo check (
    tipo_cliente <> 'stand' or objetivo = 'venda'
  )
);

create table public.vehicle_data (
  inspection_id uuid primary key references public.inspections(id) on delete cascade,
  matricula text not null,
  marca text not null,
  modelo text not null,
  versao_trim text,
  ano_fabrico int,
  ano_modelo int,
  cor text,
  codigo_cor text,
  vin text,
  numero_motor text,
  numero_portas int,
  combustivel text,
  caixa_velocidades text,
  tracao text,
  potencia_cv int,
  torque_nm numeric(6,2)
);

create table public.client_data (
  inspection_id uuid primary key references public.inspections(id) on delete cascade,
  nome_solicitante text not null,
  tipo tipo_cliente not null,
  contacto text,
  email text,
  responsavel_presente text
);

-- RF-62 "atrasada" é derivado, calculado em tempo de leitura — não persistido.
create view public.inspections_with_flags as
select i.*,
  (i.status not in ('aprovada', 'cancelada') and i.data_abertura < current_date) as atrasada
from public.inspections i;
