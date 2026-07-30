import { describe, it, expect } from "vitest";
import { TAB_IDS, resolveTabForField } from "./tabs";

describe("TAB_IDS", () => {
  it("has the 5 tabs in display order", () => {
    expect(TAB_IDS).toEqual(["cliente", "identificacao", "historico", "especificacoes", "equipamentos"]);
  });
});

describe("resolveTabForField", () => {
  it("maps every Cliente field to the cliente tab", () => {
    expect(resolveTabForField("tipoCliente")).toBe("cliente");
    expect(resolveTabForField("objetivo")).toBe("cliente");
    expect(resolveTabForField("nomeSolicitante")).toBe("cliente");
    expect(resolveTabForField("contacto")).toBe("cliente");
    expect(resolveTabForField("email")).toBe("cliente");
    expect(resolveTabForField("responsavelPresente")).toBe("cliente");
  });

  it("maps every Identificação field to the identificacao tab", () => {
    expect(resolveTabForField("matricula")).toBe("identificacao");
    expect(resolveTabForField("marca")).toBe("identificacao");
    expect(resolveTabForField("modelo")).toBe("identificacao");
    expect(resolveTabForField("versaoTrim")).toBe("identificacao");
    expect(resolveTabForField("anoFabrico")).toBe("identificacao");
    expect(resolveTabForField("anoModelo")).toBe("identificacao");
    expect(resolveTabForField("cor")).toBe("identificacao");
    expect(resolveTabForField("vin")).toBe("identificacao");
  });

  it("maps every Especificações field to the especificacoes tab", () => {
    expect(resolveTabForField("numeroMotor")).toBe("especificacoes");
    expect(resolveTabForField("numeroPortas")).toBe("especificacoes");
    expect(resolveTabForField("combustivel")).toBe("especificacoes");
    expect(resolveTabForField("caixaVelocidades")).toBe("especificacoes");
    expect(resolveTabForField("tracao")).toBe("especificacoes");
    expect(resolveTabForField("potenciaCv")).toBe("especificacoes");
    expect(resolveTabForField("torqueNm")).toBe("especificacoes");
  });

  it("maps quilometragem to historico, not identificacao", () => {
    expect(resolveTabForField("quilometragem")).toBe("historico");
  });

  it("maps every historico field to the historico tab", () => {
    for (const field of [
      "indiciosAdulteracaoKm",
      "numeroProprietariosAnteriores",
      "registoAcidentesAnteriores",
      "historicoManutencao",
      "inspecoesPeriodicasIpoNotas",
      "inspecoesPeriodicasIpoData",
      "situacaoFiscalRegular",
      "situacaoFiscalObservacoes",
    ]) {
      expect(resolveTabForField(field)).toBe("historico");
    }
  });

  it("returns null for a field with no known tab", () => {
    expect(resolveTabForField("campoInexistente")).toBeNull();
  });

  it("returns null when field is undefined", () => {
    expect(resolveTabForField(undefined)).toBeNull();
  });
});
