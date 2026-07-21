import { describe, it, expect } from "vitest";
import { deriveSiblingRows, type SiblingSourceItem } from "./siblings";
import type { ItemResponseRow } from "./progress";

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
    const responses: ItemResponseRow[] = [{ item_template_id: "item-2", status: "respondido" }];
    const result = deriveSiblingRows("item-1", items, responses);

    const item2 = result.find((r) => r.id === "item-2")!;
    const item3 = result.find((r) => r.id === "item-3")!;
    expect(item2.defaultChecked).toBe(false);
    expect(item2.status).toBe("respondido");
    expect(item3.defaultChecked).toBe(true);
    expect(item3.status).toBe("pendente");
  });

  it("returns an empty list when the current item id isn't found", () => {
    expect(deriveSiblingRows("does-not-exist", items, [])).toEqual([]);
  });
});
