import { describe, it, expect } from "vitest";
import {
  isItemPending,
  computeGroupProgress,
  groupItemsBySubcategoria,
  computeSubcategoriaProgress,
  SEM_SUBCATEGORIA_PARAM,
  type GroupTemplate,
  type ItemTemplate,
  type ItemResponseRow,
  type ItemTemplateDetail,
  type ItemGroupSubcategoria,
} from "./progress";

describe("isItemPending", () => {
  it("treats a missing response as pending", () => {
    expect(isItemPending(undefined)).toBe(true);
  });

  it("treats respondido=false as pending", () => {
    expect(isItemPending(false)).toBe(true);
  });

  it("treats respondido=true as not pending", () => {
    expect(isItemPending(true)).toBe(false);
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
    const responses: ItemResponseRow[] = [{ item_template_id: "i1", respondido: true }];
    const result = computeGroupProgress(groups, items, responses);
    expect(result.find((g) => g.id === "g1")).toEqual({
      id: "g1",
      ordem: 1,
      nome: "Exterior",
      pendentes: 1,
      total: 2,
    });
  });

  it("does not count respondido items as pending", () => {
    const responses: ItemResponseRow[] = [
      { item_template_id: "i1", respondido: true },
      { item_template_id: "i2", respondido: true },
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

  it("defaults an item's respondido to false when it has no response row", () => {
    const result = groupItemsBySubcategoria([items[0]], []);
    expect(result[0].items[0].respondido).toBe(false);
  });

  it("uses the response's respondido when one exists", () => {
    const result = groupItemsBySubcategoria([items[0]], [{ item_template_id: "i1", respondido: true }]);
    expect(result[0].items[0].respondido).toBe(true);
  });
});

describe("computeSubcategoriaProgress", () => {
  const items: ItemGroupSubcategoria[] = [
    { id: "i1", group_id: "g1", subcategoria: "Pneus" },
    { id: "i2", group_id: "g1", subcategoria: "Pneus" },
    { id: "i3", group_id: "g1", subcategoria: "Pintura" },
    { id: "i4", group_id: "g2", subcategoria: null },
  ];

  it("groups items by group_id then by subcategoria, counting pendentes/total per bucket", () => {
    const responses: ItemResponseRow[] = [{ item_template_id: "i1", respondido: true }];
    const result = computeSubcategoriaProgress(items, responses);
    const g1 = result.find((g) => g.id === "g1")!;
    expect(g1.subcategorias).toEqual([
      { subcategoria: "Pintura", pendentes: 1, total: 1 },
      { subcategoria: "Pneus", pendentes: 1, total: 2 },
    ]);
  });

  it("puts items with null subcategoria in their own bucket", () => {
    const result = computeSubcategoriaProgress(items, []);
    const g2 = result.find((g) => g.id === "g2")!;
    expect(g2.subcategorias).toEqual([{ subcategoria: null, pendentes: 1, total: 1 }]);
  });

  it("treats an item without a response row as pending", () => {
    const result = computeSubcategoriaProgress([items[0]], []);
    expect(result[0].subcategorias[0].pendentes).toBe(1);
  });

  it("does not count respondido items as pending", () => {
    const responses: ItemResponseRow[] = [
      { item_template_id: "i1", respondido: true },
      { item_template_id: "i2", respondido: true },
    ];
    const result = computeSubcategoriaProgress(items, responses);
    const g1 = result.find((g) => g.id === "g1")!;
    expect(g1.subcategorias.find((s) => s.subcategoria === "Pneus")?.pendentes).toBe(0);
  });

  it("returns an empty array when there are no items", () => {
    expect(computeSubcategoriaProgress([], [])).toEqual([]);
  });
});

describe("SEM_SUBCATEGORIA_PARAM", () => {
  it("is the URL sentinel string for a null subcategoria", () => {
    expect(SEM_SUBCATEGORIA_PARAM).toBe("sem-subcategoria");
  });
});
