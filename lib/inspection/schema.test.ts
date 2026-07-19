import { describe, it, expect } from "vitest";
import { resolveObjetivo, inspectionFormSchema } from "./schema";

describe("resolveObjetivo", () => {
  it("forces venda when tipoCliente is stand", () => {
    expect(resolveObjetivo("stand", "compra")).toBe("venda");
    expect(resolveObjetivo("stand", "venda")).toBe("venda");
  });

  it("passes objetivo through when tipoCliente is particular", () => {
    expect(resolveObjetivo("particular", "compra")).toBe("compra");
    expect(resolveObjetivo("particular", "venda")).toBe("venda");
  });
});

describe("inspectionFormSchema", () => {
  const base = {
    tipoCliente: "particular" as const,
    objetivo: "compra" as const,
    nomeSolicitante: "Cliente Teste",
    matricula: "AA-00-BB",
    marca: "Toyota",
    modelo: "Corolla",
    quilometragem: "45000",
  };

  it("accepts a minimal valid particular submission", () => {
    const result = inspectionFormSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects tipoCliente=stand with objetivo=compra (RF-03)", () => {
    const result = inspectionFormSchema.safeParse({ ...base, tipoCliente: "stand", objetivo: "compra" });
    expect(result.success).toBe(false);
  });

  it("accepts tipoCliente=stand with objetivo=venda", () => {
    const result = inspectionFormSchema.safeParse({ ...base, tipoCliente: "stand", objetivo: "venda" });
    expect(result.success).toBe(true);
  });

  it("rejects missing matricula", () => {
    const { matricula, ...rest } = base;
    const result = inspectionFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("treats a blank optional numeric field as undefined, not 0", () => {
    const result = inspectionFormSchema.safeParse({ ...base, anoFabrico: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.anoFabrico).toBeUndefined();
    }
  });

  it("still coerces a real numeric string on the happy path", () => {
    const result = inspectionFormSchema.safeParse({ ...base, anoFabrico: "2020" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.anoFabrico).toBe(2020);
    }
  });

  it("coerces quilometragem from a FormData string to a number", () => {
    const result = inspectionFormSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quilometragem).toBe(45000);
    }
  });

  it("rejects a missing quilometragem", () => {
    const { quilometragem, ...rest } = base;
    const result = inspectionFormSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a blank quilometragem string", () => {
    const result = inspectionFormSchema.safeParse({ ...base, quilometragem: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative quilometragem", () => {
    const result = inspectionFormSchema.safeParse({ ...base, quilometragem: "-1" });
    expect(result.success).toBe(false);
  });
});
