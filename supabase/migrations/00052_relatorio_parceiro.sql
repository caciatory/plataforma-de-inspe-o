-- supabase/migrations/00052_relatorio_parceiro.sql
-- Fase 6 (relatorio final): docs/superpowers/specs/2026-08-12-relatorio-final-design.md
-- secao 4.1. Campos do parceiro/stand, preenchidos do zero pelo admin numa
-- secao separada apos a aprovacao (nao bloqueiam approveInspectionAction).
-- Nullable -- nem toda inspecao tem parceiro associado. Sem RLS nova: a
-- policy inspections_update (00008_rls_helpers_and_core.sql) ja permite
-- is_admin() escrever independente do status da inspecao.
alter table public.inspections
  add column parceiro_nome text,
  add column parceiro_logo_url text,
  add column parceiro_telefone text;

-- ALTER TABLE ADD COLUMN nao propaga para uma view "select *" ja existente --
-- inspections_with_flags (00001_core_entities.sql) precisa ser recriada para
-- expor as novas colunas de parceiro. Reaplica security_invoker (00007).
drop view public.inspections_with_flags;
create view public.inspections_with_flags as
select i.*,
  (i.status not in ('aprovada', 'cancelada') and i.data_abertura < current_date) as atrasada
from public.inspections i;
alter view public.inspections_with_flags set (security_invoker = true);
