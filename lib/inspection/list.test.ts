import { describe, it, expect } from "vitest";
import { buildTecnicoInspectionRows } from "./list";

describe("buildTecnicoInspectionRows", () => {
  it("marks devolvida inspections and attaches the motivo", () => {
    const rows = buildTecnicoInspectionRows(
      [
        { id: "insp-1", status: "rascunho", data_abertura: "2026-08-01", vehicle_data: { matricula: "AA-11-BB" } },
        { id: "insp-2", status: "devolvida", data_abertura: "2026-08-02", vehicle_data: { matricula: "CC-22-DD" } },
      ],
      new Map([["insp-2", "Faltou foto do pneu traseiro"]])
    );

    expect(rows).toEqual([
      { id: "insp-1", matricula: "AA-11-BB", status: "rascunho", dataAbertura: "2026-08-01", devolvida: false, motivo: null },
      {
        id: "insp-2",
        matricula: "CC-22-DD",
        status: "devolvida",
        dataAbertura: "2026-08-02",
        devolvida: true,
        motivo: "Faltou foto do pneu traseiro",
      },
    ]);
  });

  it("falls back to a dash when vehicle_data is missing", () => {
    const rows = buildTecnicoInspectionRows(
      [{ id: "insp-3", status: "rascunho", data_abertura: "2026-08-03", vehicle_data: null }],
      new Map()
    );
    expect(rows[0].matricula).toBe("—");
  });
});
