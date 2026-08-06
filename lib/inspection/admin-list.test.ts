import { describe, it, expect } from "vitest";
import { buildAdminInspectionRows } from "./admin-list";

const inspections = [
  {
    id: "insp-1",
    status: "aguardando_aprovacao" as const,
    tipo_cliente: "particular" as const,
    data_abertura: "2026-08-01",
    vehicle_data: { matricula: "AA-11-BB", marca: "Toyota", modelo: "Corolla" },
    users: { nome: "Técnico Um" },
  },
  {
    id: "insp-2",
    status: "aprovada" as const,
    tipo_cliente: "stand" as const,
    data_abertura: "2026-08-01",
    vehicle_data: { matricula: "CC-22-DD", marca: "Honda", modelo: "Civic" },
    users: { nome: "Técnico Dois" },
  },
];
const scores = [{ inspection_id: "insp-1", nota_geral: 7.5, classificacao: "B" as const }];

describe("buildAdminInspectionRows", () => {
  it("attaches nota/classificação from the score map, null when absent", () => {
    const rows = buildAdminInspectionRows(inspections, scores, "2026-08-06");
    expect(rows[0].nota).toBe(7.5);
    expect(rows[0].classificacao).toBe("B");
    expect(rows[1].nota).toBeNull();
  });

  it("marks as atrasada when opened before today and not finalized/cancelled", () => {
    const rows = buildAdminInspectionRows(inspections, scores, "2026-08-06");
    expect(rows[0].atrasada).toBe(true); // aguardando_aprovacao, aberta ontem
    expect(rows[1].atrasada).toBe(false); // aprovada, nunca atrasada
  });

  it("does not mark as atrasada when opened today", () => {
    const rows = buildAdminInspectionRows(inspections, scores, "2026-08-01");
    expect(rows[0].atrasada).toBe(false);
  });
});
