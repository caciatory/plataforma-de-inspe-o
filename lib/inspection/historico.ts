type ReviewEventRow = {
  tipo: "aprovacao" | "devolucao" | "cancelamento";
  motivo: string | null;
  timestamp: string;
  users: { nome: string } | null;
};

type AuditLogRow = {
  descricao: string;
  timestamp: string;
  users: { nome: string } | null;
};

export type HistoricoEntry =
  | { tipo: "review"; label: string; motivo: string | null; autor: string; timestamp: string }
  | { tipo: "auditoria"; descricao: string; autor: string; timestamp: string };

const REVIEW_LABEL: Record<ReviewEventRow["tipo"], string> = {
  aprovacao: "Aprovação",
  devolucao: "Devolução",
  cancelamento: "Cancelamento",
};

export function mergeHistorico(reviewEvents: ReviewEventRow[], auditEntries: AuditLogRow[]): HistoricoEntry[] {
  const entries: HistoricoEntry[] = [
    ...reviewEvents.map((e) => ({
      tipo: "review" as const,
      label: REVIEW_LABEL[e.tipo],
      motivo: e.motivo,
      autor: e.users?.nome ?? "—",
      timestamp: e.timestamp,
    })),
    ...auditEntries.map((e) => ({
      tipo: "auditoria" as const,
      descricao: e.descricao,
      autor: e.users?.nome ?? "—",
      timestamp: e.timestamp,
    })),
  ];

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
