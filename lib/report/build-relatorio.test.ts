import { describe, it, expect } from "vitest";
import { buildRelatorioGrupos } from "./build-relatorio";

const groups = [
  { id: "g1", ordem: 1, nome: "Pneus" },
  { id: "g2", ordem: 2, nome: "Sem resposta nenhuma" },
];

const items = [
  { id: "i1", group_id: "g1", subcategoria: "Rodas", nome: "Pneu dianteiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i2", group_id: "g1", subcategoria: "Rodas", nome: "Pneu traseiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i3", group_id: "g1", subcategoria: "Travões", nome: "Espessura pastilha", tipo: "medicao" as const, conjunto_opcao_id: null },
  { id: "i4", group_id: "g1", subcategoria: "Rodas", nome: "Cor da jante", tipo: "texto" as const, conjunto_opcao_id: null },
  { id: "i5", group_id: "g2", subcategoria: null, nome: "Item nunca respondido", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i6", group_id: "g1", subcategoria: "Rodas", nome: "Pneu sobressalente", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
];

const opcoes = [
  { id: "o1", conjunto_id: "c1", label: "Ótimo", ordem: 1, exige_foto: false },
  { id: "o2", conjunto_id: "c1", label: "Médio", ordem: 2, exige_foto: false },
  { id: "o3", conjunto_id: "c1", label: "Mau", ordem: 3, exige_foto: true },
];

const responses = [
  { id: "r1", item_template_id: "i1", opcao_id: "o1", resposta_texto: null, resposta_data: null, observacao: null },
  { id: "r2", item_template_id: "i2", opcao_id: "o3", resposta_texto: null, resposta_data: null, observacao: "Risco fundo na lateral" },
  { id: "r3", item_template_id: "i3", opcao_id: null, resposta_texto: null, resposta_data: null, observacao: null },
  { id: "r4", item_template_id: "i4", opcao_id: null, resposta_texto: "Preto", resposta_data: null, observacao: "Cor repintada" },
  { id: "r6", item_template_id: "i6", opcao_id: "o2", resposta_texto: null, resposta_data: null, observacao: null },
];

const medicaoResultados = [{ item_response_id: "r3", resultado: "critico" as const }];

const photos = [{ id: "p1", url: "https://example.com/a.jpg", item_response_id: "r2" }];

describe("buildRelatorioGrupos", () => {
  it("só inclui grupos com pelo menos um item respondido (RF-46)", () => {
    const result = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    expect(result.map((g) => g.id)).toEqual(["g1"]);
  });

  it("classifica escolha pela posição da opção (ótimo/ruim)", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const pneuDianteiro = grupo.items.find((i) => i.id === "i1")!;
    const pneuTraseiro = grupo.items.find((i) => i.id === "i2")!;
    expect(pneuDianteiro.status).toBe("otimo");
    expect(pneuTraseiro.status).toBe("ruim");
    expect(pneuDianteiro.respostaLabel).toBe("Ótimo");
    expect(pneuTraseiro.respostaLabel).toBe("Mau");
  });

  it("classifica medição por medicoes_resultado.resultado", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const medicao = grupo.items.find((i) => i.id === "i3")!;
    expect(medicao.status).toBe("ruim");
    expect(medicao.respostaLabel).toBe("Crítico");
  });

  it("texto/data nunca são destacados (status info)", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const texto = grupo.items.find((i) => i.id === "i4")!;
    expect(texto.status).toBe("info");
    expect(texto.respostaLabel).toBe("Preto");
  });

  it("conta OK/atenção/ruim por grupo separando as 3 severidades", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    expect(grupo.ok).toBe(2); // i1 (ótimo) + i4 (info)
    expect(grupo.medio).toBe(1); // i6 (médio)
    expect(grupo.ruim).toBe(2); // i2 (ruim) + i3 (crítico -> ruim)
  });

  it("anexa fotos ao item pela resposta correspondente", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const pneuTraseiro = grupo.items.find((i) => i.id === "i2")!;
    expect(pneuTraseiro.fotos).toEqual([{ id: "p1", url: "https://example.com/a.jpg" }]);
    expect(grupo.items.find((i) => i.id === "i1")!.fotos).toEqual([]);
  });

  it("pisca o comentário só quando o item também está 'ruim' (RF-48 + regra do piscar)", () => {
    const [grupo] = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
    const pneuTraseiro = grupo.items.find((i) => i.id === "i2")!; // ruim + comentário
    const textoComComentario = grupo.items.find((i) => i.id === "i4")!; // info + comentário
    expect(pneuTraseiro.piscaComentario).toBe(true);
    expect(textoComComentario.piscaComentario).toBe(false);
  });
});
