import { describe, it, expect } from "vitest";
import { EQUIPAMENTO_CATEGORIAS } from "./catalog";

describe("EQUIPAMENTO_CATEGORIAS", () => {
  it("has the 5 categories from the spec, in order", () => {
    expect(EQUIPAMENTO_CATEGORIAS.map((c) => c.id)).toEqual([
      "audio-multimedia",
      "conforto",
      "assistencia-conducao",
      "seguranca",
      "outros-equipamentos",
    ]);
  });

  it("has 41 items total across all categories", () => {
    const total = EQUIPAMENTO_CATEGORIAS.reduce((sum, c) => sum + c.itens.length, 0);
    expect(total).toBe(41);
  });

  it("has no duplicate item names within a category", () => {
    for (const categoria of EQUIPAMENTO_CATEGORIAS) {
      expect(new Set(categoria.itens).size).toBe(categoria.itens.length);
    }
  });
});
