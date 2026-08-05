import { describe, it, expect } from "vitest";
import { isInspectionEditable } from "./status";

describe("isInspectionEditable", () => {
  it("returns true for rascunho", () => {
    expect(isInspectionEditable("rascunho")).toBe(true);
  });

  it("returns true for devolvida", () => {
    expect(isInspectionEditable("devolvida")).toBe(true);
  });

  it("returns false for aguardando_aprovacao", () => {
    expect(isInspectionEditable("aguardando_aprovacao")).toBe(false);
  });

  it("returns false for aprovada", () => {
    expect(isInspectionEditable("aprovada")).toBe(false);
  });

  it("returns false for cancelada", () => {
    expect(isInspectionEditable("cancelada")).toBe(false);
  });
});
