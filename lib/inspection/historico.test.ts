import { describe, it, expect } from "vitest";
import { mergeHistorico } from "./historico";

describe("mergeHistorico", () => {
  it("merges review_events and audit_log_entries sorted by timestamp desc", () => {
    const result = mergeHistorico(
      [{ tipo: "devolucao" as const, motivo: "Faltou foto", timestamp: "2026-08-01T10:00:00Z", users: { nome: "Admin A" } }],
      [{ descricao: 'Editou "Pneu"', timestamp: "2026-08-02T10:00:00Z", users: { nome: "Admin A" } }]
    );

    expect(result).toEqual([
      { tipo: "auditoria", descricao: 'Editou "Pneu"', autor: "Admin A", timestamp: "2026-08-02T10:00:00Z" },
      { tipo: "review", label: "Devolução", motivo: "Faltou foto", autor: "Admin A", timestamp: "2026-08-01T10:00:00Z" },
    ]);
  });

  it("labels aprovacao and cancelamento correctly and falls back to — for a missing author", () => {
    const result = mergeHistorico(
      [
        { tipo: "aprovacao" as const, motivo: null, timestamp: "2026-08-03T10:00:00Z", users: null },
        { tipo: "cancelamento" as const, motivo: "Duplicada", timestamp: "2026-08-04T10:00:00Z", users: { nome: "Admin B" } },
      ],
      []
    );

    expect(result[1]).toEqual({ tipo: "review", label: "Aprovação", motivo: null, autor: "—", timestamp: "2026-08-03T10:00:00Z" });
    expect(result[0]).toEqual({
      tipo: "review",
      label: "Cancelamento",
      motivo: "Duplicada",
      autor: "Admin B",
      timestamp: "2026-08-04T10:00:00Z",
    });
  });
});
