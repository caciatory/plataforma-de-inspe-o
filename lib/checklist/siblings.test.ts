import { describe, it, expect } from "vitest";
import {
  deriveSiblingRows,
  buildBatchRows,
  slugifyOpcaoLabel,
  resolveEscolhaColorModifier,
  type SiblingSourceItem,
  type SiblingRow,
  type SiblingResponseRow,
  type Opcao,
} from "./siblings";

describe("deriveSiblingRows", () => {
  const items: SiblingSourceItem[] = [
    { id: "item-1", nome: "Pneu dianteiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-2", nome: "Pneu dianteiro direito", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-3", nome: "Pneu traseiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
    { id: "item-4", nome: "Vidro lateral esquerdo", grupo_replicacao: "vidros-lateral-dianteiro" },
    { id: "item-5", nome: "Marca", grupo_replicacao: null },
  ];
  const opcaoLabelById = new Map([
    ["opt-medio", "Médio"],
    ["opt-ruim", "Ruim"],
  ]);

  it("returns an empty list when the current item has no grupo_replicacao", () => {
    expect(deriveSiblingRows("item-5", items, [], opcaoLabelById)).toEqual([]);
  });

  it("returns only items sharing the same grupo_replicacao, excluding self", () => {
    const result = deriveSiblingRows("item-1", items, [], opcaoLabelById);
    expect(result.map((r) => r.id)).toEqual(["item-2", "item-3"]);
  });

  it("defaults checked=true for siblings with no opcao_id and false for already-answered ones", () => {
    const responses: SiblingResponseRow[] = [{ item_template_id: "item-2", opcao_id: "opt-medio" }];
    const result = deriveSiblingRows("item-1", items, responses, opcaoLabelById);

    const item2 = result.find((r) => r.id === "item-2")!;
    const item3 = result.find((r) => r.id === "item-3")!;
    expect(item2.defaultChecked).toBe(false);
    expect(item2.opcao_id).toBe("opt-medio");
    expect(item3.defaultChecked).toBe(true);
    expect(item3.opcao_id).toBeNull();
  });

  it("resolves the sibling's opcao label from the given map", () => {
    const responses: SiblingResponseRow[] = [{ item_template_id: "item-2", opcao_id: "opt-ruim" }];
    const result = deriveSiblingRows("item-1", items, responses, opcaoLabelById);

    const item2 = result.find((r) => r.id === "item-2")!;
    const item3 = result.find((r) => r.id === "item-3")!;
    expect(item2.opcao_label).toBe("Ruim");
    expect(item3.opcao_label).toBeNull();
  });

  it("returns an empty list when the current item id isn't found", () => {
    expect(deriveSiblingRows("does-not-exist", items, [], opcaoLabelById)).toEqual([]);
  });
});

describe("buildBatchRows", () => {
  const current = {
    itemTemplateId: "item-1",
    nome: "Pneu dianteiro esquerdo",
    opcao_id: "opt-ruim",
    observacao: "Desgaste irregular",
    photos: [{ id: "photo-1", url: "https://example.com/photo-1.jpg" }],
  };

  const siblings: SiblingRow[] = [
    { id: "item-2", nome: "Pneu dianteiro direito", opcao_id: null, opcao_label: null, defaultChecked: true },
    { id: "item-3", nome: "Pneu traseiro esquerdo", opcao_id: null, opcao_label: null, defaultChecked: true },
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

  it("applies the current item's opcao_id and observacao to every selected sibling", () => {
    const result = buildBatchRows(current, siblings, new Set(["item-2", "item-3"]));

    const siblingRows = result.filter((r) => r.itemTemplateId !== "item-1");
    for (const row of siblingRows) {
      expect(row.opcao_id).toBe(current.opcao_id);
      expect(row.observacao).toBe(current.observacao);
    }
  });
});

describe("slugifyOpcaoLabel", () => {
  it("strips accents, lowercases, and removes non-alphanumeric characters", () => {
    expect(slugifyOpcaoLabel("Ótimo")).toBe("otimo");
    expect(slugifyOpcaoLabel("Médio")).toBe("medio");
    expect(slugifyOpcaoLabel("Ruim")).toBe("ruim");
    expect(slugifyOpcaoLabel("N.A.")).toBe("na");
  });
});

describe("resolveEscolhaColorModifier", () => {
  it("keeps N.A. neutral regardless of its position in the conjunto", () => {
    const opcoes: Opcao[] = [
      { id: "1", label: "Bom", ordem: 1, exige_foto: false },
      { id: "2", label: "Mau", ordem: 2, exige_foto: false },
      { id: "3", label: "N.A.", ordem: 3, exige_foto: false },
    ];
    expect(resolveEscolhaColorModifier(opcoes, "3")).toBe("na");
  });

  it("colors a 2-option conjunto: first=otimo, last=ruim", () => {
    const opcoes: Opcao[] = [
      { id: "1", label: "Bom", ordem: 1, exige_foto: false },
      { id: "2", label: "Mau", ordem: 2, exige_foto: false },
    ];
    expect(resolveEscolhaColorModifier(opcoes, "1")).toBe("otimo");
    expect(resolveEscolhaColorModifier(opcoes, "2")).toBe("ruim");
  });

  it("colors a 3-option conjunto: first=otimo, middle=medio, last=ruim", () => {
    const opcoes: Opcao[] = [
      { id: "1", label: "Bom", ordem: 1, exige_foto: false },
      { id: "2", label: "Médio", ordem: 2, exige_foto: false },
      { id: "3", label: "Mau", ordem: 3, exige_foto: false },
    ];
    expect(resolveEscolhaColorModifier(opcoes, "1")).toBe("otimo");
    expect(resolveEscolhaColorModifier(opcoes, "2")).toBe("medio");
    expect(resolveEscolhaColorModifier(opcoes, "3")).toBe("ruim");
  });

  it("colors a 4-option conjunto: first=otimo, both middles=medio, last=ruim", () => {
    const opcoes: Opcao[] = [
      { id: "1", label: "Ausente", ordem: 1, exige_foto: false },
      { id: "2", label: "Ligeira", ordem: 2, exige_foto: false },
      { id: "3", label: "Moderada", ordem: 3, exige_foto: false },
      { id: "4", label: "Severa", ordem: 4, exige_foto: false },
    ];
    expect(resolveEscolhaColorModifier(opcoes, "1")).toBe("otimo");
    expect(resolveEscolhaColorModifier(opcoes, "2")).toBe("medio");
    expect(resolveEscolhaColorModifier(opcoes, "3")).toBe("medio");
    expect(resolveEscolhaColorModifier(opcoes, "4")).toBe("ruim");
  });
});
