import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { RelatorioConteudo, type RelatorioDados } from "./relatorio-conteudo";

// next/font/google's SWC transform only runs inside a real Next.js build;
// under vitest it's just a plain import, so stub it the same way the module
// behaves at runtime (an object exposing a className).
vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ className: "mock-dm-sans" }),
}));

const dadosBase: RelatorioDados = {
  vehicle: {
    marca: "Toyota",
    modelo: "Corolla",
    versao_trim: "1.8",
    ano_fabrico: 2020,
    ano_modelo: 2020,
    cor: "Prata",
    vin: "JTDKP5C1XL0012345",
    numero_motor: "2ZR-FE",
    numero_portas: 4,
    combustivel: "Gasolina",
    caixa_velocidades: "Manual",
    quilometragem: 45000,
    codigo_cor: null,
    tracao: null,
    potencia_cv: null,
    torque_nm: null,
    matricula: "AA-00-XX",
    situacao_fiscal_regular: null,
    numero_proprietarios_anteriores: null,
    indicios_adulteracao_presentes: false,
    indicios_adulteracao_km: null,
    registo_acidentes_anteriores: null,
    historico_manutencao: null,
    inspecoes_periodicas_ipo_data: null,
    inspecoes_periodicas_ipo_notas: null,
    data_primeira_matricula: null,
    valor_base_iuc_anual: null,
    veiculo_importado: false,
    pais_origem: null,
    matricula_origem: null,
    data_importacao: null,
    possui_coc: null,
    isencao_isv_aplicada: null,
    numero_dav: null,
  },
  score: { nota_geral: 8.5, classificacao: "A" },
  fotosCapa: [],
  codigoCertificado: "CK7X29QP",
  certificadoEmitidoEm: "2026-08-12T10:00:00Z",
  parceiroNome: null,
  parceiroLogoUrl: null,
  parceiroTelefone: null,
  dataInspecao: "12/08/2026",
  tecnicoNome: "Técnico Teste",
  tecnicoCredencial: null,
  groups: [],
  items: [],
  responses: [],
  opcoes: [],
  medicaoResultados: [],
  photos: [],
  equipamentos: [],
  equipamentoFotos: [],
};

describe("RelatorioConteudo", () => {
  it("renderiza os dados técnicos do veículo e o código de certificado", () => {
    const { container } = render(<RelatorioConteudo dados={dadosBase} />);
    expect(container.textContent).toContain("Toyota");
    expect(container.textContent).toContain("Corolla");
    expect(container.textContent).toContain("AA-00-XX");
    expect(container.textContent).toContain("CK7X29QP");
  });

  it("nunca aninha <dialog> dentro de <p> (regressão de hidratação, RF-50-adjacente)", () => {
    const { container } = render(<RelatorioConteudo dados={dadosBase} />);
    expect(container.querySelector("p dialog")).toBeNull();
  });

  it("renderiza o nome do parceiro quando presente", () => {
    const { container } = render(
      <RelatorioConteudo dados={{ ...dadosBase, parceiroNome: "Stand Central" }} />
    );
    expect(container.textContent).toContain("Stand Central");
  });

  it("mostra o botão 'Ver fotos' junto da Data da inspeção só quando há fotos de capa", () => {
    const { container: semFotos } = render(<RelatorioConteudo dados={dadosBase} />);
    expect(semFotos.querySelector('[aria-label="Ver fotos"]')).toBeNull();

    const { container: comFotos } = render(
      <RelatorioConteudo dados={{ ...dadosBase, fotosCapa: [{ id: "f1", url: "https://example.com/1.jpg" }] }} />
    );
    expect(comFotos.querySelector('[aria-label="Ver fotos"]')).not.toBeNull();
  });
});
