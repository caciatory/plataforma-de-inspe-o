// lib/inspection/status.ts
// Espelha a condicao de public.owns_editable_inspection()
// (supabase/migrations/00008_rls_helpers_and_core.sql) -- unica fonte de
// verdade sobre quando o tecnico ainda pode editar uma inspecao. Nao
// substitui a RLS (que continua sendo o bloqueio real), so evita que a UI
// deixe o usuario bater num erro de permissao sem explicacao.

export type InspectionStatus = "rascunho" | "aguardando_aprovacao" | "devolvida" | "aprovada" | "cancelada";

export function isInspectionEditable(status: InspectionStatus): boolean {
  return status === "rascunho" || status === "devolvida";
}
