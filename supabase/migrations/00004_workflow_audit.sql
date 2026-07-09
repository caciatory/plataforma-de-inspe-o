-- supabase/migrations/00004_workflow_audit.sql
create type review_tipo as enum ('aprovacao', 'devolucao', 'cancelamento');

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  tipo review_tipo not null,
  autor_id uuid not null references public.users(id),
  motivo text,
  timestamp timestamptz not null default now(),
  constraint motivo_obrigatorio_devolucao_cancelamento check (
    tipo = 'aprovacao' or motivo is not null
  )
);

create index on public.review_events (inspection_id);

-- RF-36: log simples (quem, o quê, quando) — sem valor anterior/novo.
-- RNF-11: inspection_id NÃO usa "on delete cascade" (diferente de review_events) —
-- deletar uma inspeção com log de auditoria deve falhar (foreign_key_violation),
-- não apagar o log junto. Isso é o que torna "log imutável" uma garantia real de
-- banco, não só a revogação de UPDATE/DELETE abaixo (que não bloqueia cascade).
create table public.audit_log_entries (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id),
  admin_id uuid not null references public.users(id),
  descricao text not null,
  timestamp timestamptz not null default now()
);

create index on public.audit_log_entries (inspection_id);

-- RNF-11: log é somente-inserção — bloqueado a nível de banco, não só por convenção de app.
revoke update, delete on public.audit_log_entries from authenticated, anon;
