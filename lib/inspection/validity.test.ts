import { describe, it, expect } from "vitest";
import { computeInspectionValidity } from "./validity";

describe("computeInspectionValidity", () => {
  it("returns nao_emitida with null validoAte/kmLimite when certificadoEmitidoEm is null", () => {
    const result = computeInspectionValidity(null, 50000);
    expect(result).toEqual({ status: "nao_emitida", validoAte: null, kmLimite: null });
  });

  // `setMonth` operates on local time, so two independently hardcoded UTC
  // literals 6 months apart can straddle a DST offset change (WET/WEST in
  // Portugal, e.g.) and land on the wrong boundary depending on the machine's
  // timezone. Deriving `validoAte`/`now` from the same relative computation
  // the implementation uses keeps these tests timezone-agnostic.
  function sixMonthsLater(iso: string): Date {
    const d = new Date(iso);
    const originalDate = d.getDate();
    d.setMonth(d.getMonth() + 6);
    if (d.getDate() !== originalDate) {
      d.setDate(0);
    }
    return d;
  }

  it("returns valida the day before the 6-month mark", () => {
    const emitido = "2026-01-15T10:00:00.000Z";
    const now = new Date(sixMonthsLater(emitido).getTime() - 24 * 60 * 60 * 1000);
    const result = computeInspectionValidity(emitido, 50000, now);
    expect(result.status).toBe("valida");
    expect(result.validoAte).toEqual(sixMonthsLater(emitido));
  });

  it("treats exactly 6 months later as still valid (boundary)", () => {
    const emitido = "2026-01-15T10:00:00.000Z";
    const now = sixMonthsLater(emitido);
    const result = computeInspectionValidity(emitido, 50000, now);
    expect(result.status).toBe("valida");
  });

  it("returns expirada one millisecond after the 6-month mark", () => {
    const emitido = "2026-01-15T10:00:00.000Z";
    const now = new Date(sixMonthsLater(emitido).getTime() + 1);
    const result = computeInspectionValidity(emitido, 50000, now);
    expect(result.status).toBe("expirada");
  });

  it("clamps to the last day of the target month when the day overflows (Aug 31 -> Feb 28)", () => {
    const emitido = "2026-08-31T10:00:00.000Z";
    const result = computeInspectionValidity(emitido, 50000, new Date(emitido));
    expect(result.validoAte).toEqual(sixMonthsLater(emitido));
    expect(result.validoAte?.getFullYear()).toBe(2027);
    expect(result.validoAte?.getMonth()).toBe(1); // February
    expect(result.validoAte?.getDate()).toBe(28);
  });

  it("computes kmLimite as quilometragem + 100", () => {
    const emitido = "2026-01-15T10:00:00.000Z";
    const now = new Date("2026-02-01T00:00:00.000Z");
    expect(computeInspectionValidity(emitido, 0, now).kmLimite).toBe(100);
    expect(computeInspectionValidity(emitido, 87500, now).kmLimite).toBe(87600);
  });
});
