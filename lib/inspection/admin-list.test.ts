import { describe, it, expect } from "vitest";
import { buildAdminInspectionRows } from "./admin-list";

const inspections = [
  {
    id: "insp-1",
    status: "aguardando_aprovacao" as const,
    tipo_cliente: "particular" as const,
    data_abertura: "2026-08-01",
    atrasada: true,
    parceiro_nome: null,
    parceiro_logo_url: null,
    parceiro_telefone: null,
    vehicle_data: { matricula: "AA-11-BB", marca: "Toyota", modelo: "Corolla" },
    users: { nome: "Técnico Um" },
  },
  {
    id: "insp-2",
    status: "aprovada" as const,
    tipo_cliente: "stand" as const,
    data_abertura: "2026-08-01",
    atrasada: false,
    parceiro_nome: "Stand Central",
    parceiro_logo_url: "https://example.com/logo.png",
    parceiro_telefone: "351912345678",
    vehicle_data: { matricula: "CC-22-DD", marca: "Honda", modelo: "Civic" },
    users: { nome: "Técnico Dois" },
  },
];
const scores = [{ inspection_id: "insp-1", nota_geral: 7.5, classificacao: "B" as const }];

describe("buildAdminInspectionRows", () => {
  it("attaches nota/classificação from the score map, null when absent", () => {
    const rows = buildAdminInspectionRows(inspections, scores);
    expect(rows[0].nota).toBe(7.5);
    expect(rows[0].classificacao).toBe("B");
    expect(rows[1].nota).toBeNull();
  });

  it("passes atrasada through as computed by the inspections_with_flags view", () => {
    const rows = buildAdminInspectionRows(inspections, scores);
    expect(rows[0].atrasada).toBe(true);
    expect(rows[1].atrasada).toBe(false); // aprovada, nunca atrasada
  });

  it("passa os 3 campos de parceiro adiante, null quando a inspeção não tem parceiro", () => {
    const rows = buildAdminInspectionRows(inspections, scores);
    expect(rows[0].parceiroNome).toBeNull();
    expect(rows[0].parceiroLogoUrl).toBeNull();
    expect(rows[0].parceiroTelefone).toBeNull();
    expect(rows[1].parceiroNome).toBe("Stand Central");
    expect(rows[1].parceiroLogoUrl).toBe("https://example.com/logo.png");
    expect(rows[1].parceiroTelefone).toBe("351912345678");
  });
});
