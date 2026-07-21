import { describe, it, expect } from "vitest";
import { deriveSiblingRows, buildBatchRows, type SiblingSourceItem, type SiblingRow, type SiblingResponseRow } from "./siblings";

describe("deriveSiblingRows", () => {
  const items: SiblingSourceItem[] = [
    { id: "item-1", nome: "Pneu dianteiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-2", nome: "Pneu dianteiro direito", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-3", nome: "Pneu traseiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-4", nome: "Vidro lateral esquerdo", grupo_replicacao: "vidros-lateral-dianteiro" },
    { id: "item-5", nome: "Marca", grupo_replicacao: null },
  ];

  it("returns an empty list when the current item has no grupo_replicacao", () => {
    expect(deriveSiblingRows("item-5", items, [])).toEqual([]);
  });

  it("returns only items sharing the same grupo_replicacao, excluding self", () => {
    const result = deriveSiblingRows("item-1", items, []);
    expect(result.map((r) => r.id)).toEqual(["item-2", "item-3"]);
  });

  it("defaults checked=true for pending siblings and false for already-answered ones", () => {
    const responses: SiblingResponseRow[] = [
      { item_template_id: "item-2", status: "respondido", classificacao: "medio" },
    ];
    const result = deriveSiblingRows("item-1", items, responses);

    const item2 = result.find((r) => r.id === "item-2")!;
    const item3 = result.find((r) => r.id === "item-3")!;
    expect(item2.defaultChecked).toBe(false);
    expect(item2.status).toBe("respondido");
    expect(item3.defaultChecked).toBe(true);
    expect(item3.status).toBe("pendente");
  });

  it("carries the sibling's real classificacao, not just the collapsed status", () => {
    const responses: SiblingResponseRow[] = [
      { item_template_id: "item-2", status: "respondido", classificacao: "ruim" },
      { item_template_id: "item-3", status: "NF", classificacao: null },
    ];
    const result = deriveSiblingRows("item-1", items, responses);

    const item2 = result.find((r) => r.id === "item-2")!;
    const item3 = result.find((r) => r.id === "item-3")!;
    expect(item2.classificacao).toBe("ruim");
    expect(item3.classificacao).toBeNull();
  });

  it("returns an empty list when the current item id isn't found", () => {
    expect(deriveSiblingRows("does-not-exist", items, [])).toEqual([]);
  });
});

describe("buildBatchRows", () => {
  const current = {
    itemTemplateId: "item-1",
    nome: "Pneu dianteiro esquerdo",
    classificacao: "ruim",
    observacao: "Desgaste irregular",
    photos: [{ id: "photo-1", url: "https://example.com/photo-1.jpg" }],
  };

  const siblings: SiblingRow[] = [
    { id: "item-2", nome: "Pneu dianteiro direito", status: "pendente", classificacao: null, defaultChecked: true },
    { id: "item-3", nome: "Pneu traseiro esquerdo", status: "pendente", classificacao: null, defaultChecked: true },
  ];

  it("never copies the current item's photos onto sibling rows, regardless of how many it has", () => {
    const selected = new Set(["item-2", "item-3"]);
    const result = buildBatchRows(current, siblings, selected);

    const siblingRows = result.filter((r) => r.itemTemplateId !== "item-1");
    expect(siblingRows).toHaveLength(2);
    for (const row of siblingRows) {
      expect(row.photos).toEqual([]);
    }
  });

  it("excludes unselected siblings", () => {
    const selected = new Set(["item-2"]);
    const result = buildBatchRows(current, siblings, selected);

    expect(result.map((r) => r.itemTemplateId)).toEqual(["item-1", "item-2"]);
  });

  it("keeps the current item's own row unchanged, including its real photos", () => {
    const result = buildBatchRows(current, siblings, new Set(["item-2"]));

    expect(result[0]).toEqual(current);
  });

  it("applies the current item's classificacao and observacao to every selected sibling", () => {
    const result = buildBatchRows(current, siblings, new Set(["item-2", "item-3"]));

    const siblingRows = result.filter((r) => r.itemTemplateId !== "item-1");
    for (const row of siblingRows) {
      expect(row.classificacao).toBe(current.classificacao);
      expect(row.observacao).toBe(current.observacao);
    }
  });
});
