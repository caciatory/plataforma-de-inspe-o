// lib/inspection/status.ts
// Espelha a condicao de public.owns_editable_inspection()
// (supabase/migrations/00008_rls_helpers_and_core.sql) -- unica fonte de
// verdade sobre quando o tecnico ainda pode editar uma inspecao. Nao
// substitui a RLS (que continua sendo o bloqueio real), so evita que a UI
// deixe o usuario bater num erro de permissao sem explicacao.
// Cobre apenas o lado do tecnico da RLS (owns_editable_inspection) -- o
// outro braco da policy inspections_update, is_admin(), fica fora deste
// predicado; a Fase 5 sub-projeto 3 (edicao do admin) e que vai precisar dele.

export type InspectionStatus = "rascunho" | "aguardando_aprovacao" | "devolvida" | "aprovada" | "cancelada";

export function isInspectionEditable(status: InspectionStatus): boolean {
  return status === "rascunho" || status === "devolvida";
}
