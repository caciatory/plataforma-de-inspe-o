import { describe, it, expect } from "vitest";
import { isInspectionEditable } from "./status";

describe("isInspectionEditable", () => {
  it("técnico: returns true for rascunho", () => {
    expect(isInspectionEditable("rascunho", "tecnico")).toBe(true);
  });

  it("técnico: returns true for devolvida", () => {
    expect(isInspectionEditable("devolvida", "tecnico")).toBe(true);
  });

  it("técnico: returns false for aguardando_aprovacao, aprovada, cancelada", () => {
    expect(isInspectionEditable("aguardando_aprovacao", "tecnico")).toBe(false);
    expect(isInspectionEditable("aprovada", "tecnico")).toBe(false);
    expect(isInspectionEditable("cancelada", "tecnico")).toBe(false);
  });

  it("admin: always returns true, regardless of status", () => {
    expect(isInspectionEditable("rascunho", "admin")).toBe(true);
    expect(isInspectionEditable("aguardando_aprovacao", "admin")).toBe(true);
    expect(isInspectionEditable("devolvida", "admin")).toBe(true);
    expect(isInspectionEditable("aprovada", "admin")).toBe(true);
    expect(isInspectionEditable("cancelada", "admin")).toBe(true);
  });
});
