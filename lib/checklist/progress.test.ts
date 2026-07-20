import { describe, it, expect } from "vitest";
import {
  isItemPending,
  computeGroupProgress,
  groupItemsBySubcategoria,
  type GroupTemplate,
  type ItemTemplate,
  type ItemResponseRow,
  type ItemTemplateDetail,
} from "./progress";

describe("isItemPending", () => {
  it("treats a missing response as pending", () => {
    expect(isItemPending(undefined)).toBe(true);
  });

  it("treats status='pendente' as pending", () => {
    expect(isItemPending("pendente")).toBe(true);
  });

  it("treats status='respondido' as not pending", () => {
    expect(isItemPending("respondido")).toBe(false);
  });

  it("treats status='NF' as not pending", () => {
    expect(isItemPending("NF")).toBe(false);
  });
});

describe("computeGroupProgress", () => {
  const groups: GroupTemplate[] = [
    { id: "g2", ordem: 2, nome: "Interior" },
    { id: "g1", ordem: 1, nome: "Exterior" },
  ];
  const items: ItemTemplate[] = [
    { id: "i1", group_id: "g1" },
    { id: "i2", group_id: "g1" },
    { id: "i3", group_id: "g2" },
  ];

  it("counts items without a response row as pending", () => {
    const responses: ItemResponseRow[] = [{ item_template_id: "i1", status: "respondido" }];
    const result = computeGroupProgress(groups, items, responses);
    expect(result.find((g) => g.id === "g1")).toEqual({
      id: "g1",
      ordem: 1,
      nome: "Exterior",
      pendentes: 1,
      total: 2,
    });
  });

  it("does not count NF or respondido items as pending", () => {
    const responses: ItemResponseRow[] = [
      { item_template_id: "i1", status: "respondido" },
      { item_template_id: "i2", status: "NF" },
    ];
    const result = computeGroupProgress(groups, items, responses);
    expect(result.find((g) => g.id === "g1")?.pendentes).toBe(0);
  });

  it("returns groups sorted by ordem regardless of input order", () => {
    const result = computeGroupProgress(groups, items, []);
    expect(result.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("returns 0/0 for a group with no items", () => {
    const result = computeGroupProgress(groups, [], []);
    expect(result.find((g) => g.id === "g2")).toEqual({
      id: "g2",
      ordem: 2,
      nome: "Interior",
      pendentes: 0,
      total: 0,
    });
  });
});

describe("groupItemsBySubcategoria", () => {
  const items: ItemTemplateDetail[] = [
    { id: "i1", subcategoria: "Pneus", nome: "Pneu traseiro esquerdo" },
    { id: "i2", subcategoria: "Pintura", nome: "Capo" },
    { id: "i3", subcategoria: "Pintura", nome: "Bagageira" },
    { id: "i4", subcategoria: null, nome: "Item sem subcategoria" },
  ];

  it("groups items by subcategoria, with items sorted by nome inside each group", () => {
    const result = groupItemsBySubcategoria(items, []);
    const pintura = result.find((g) => g.subcategoria === "Pintura");
    expect(pintura?.items.map((i) => i.nome)).toEqual(["Bagageira", "Capo"]);
  });

  it("puts items with null subcategoria in their own group", () => {
    const result = groupItemsBySubcategoria(items, []);
    const semSubcategoria = result.find((g) => g.subcategoria === null);
    expect(semSubcategoria?.items.map((i) => i.id)).toEqual(["i4"]);
  });

  it("defaults an item's status to pendente when it has no response row", () => {
    const result = groupItemsBySubcategoria([items[0]], []);
    expect(result[0].items[0].status).toBe("pendente");
  });

  it("uses the response's status when one exists", () => {
    const result = groupItemsBySubcategoria([items[0]], [{ item_template_id: "i1", status: "NF" }]);
    expect(result[0].items[0].status).toBe("NF");
  });
});
