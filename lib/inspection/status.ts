// lib/inspection/status.ts
// Espelha a condicao de public.owns_editable_inspection() (RLS,
// supabase/migrations/00008_rls_helpers_and_core.sql) para o tecnico -- e o
// bypass de is_admin() nas mesmas policies para o admin (owns_editable_inspection
// nunca entra em jogo quando quem chama e admin). Nao substitui a RLS (que
// continua sendo o bloqueio real), so evita que a UI deixe o usuario bater
// num erro de permissao sem explicacao.

import type { UserRole } from "@/lib/auth/session";

export type InspectionStatus = "rascunho" | "aguardando_aprovacao" | "devolvida" | "aprovada" | "cancelada";

export function isInspectionEditable(status: InspectionStatus, role: UserRole): boolean {
  if (role === "admin") return true;
  return status === "rascunho" || status === "devolvida";
}
