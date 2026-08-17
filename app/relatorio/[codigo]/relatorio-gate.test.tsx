import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RelatorioGate } from "./relatorio-gate";

const registrarAcessoAction = vi.fn();
vi.mock("./actions", () => ({
  registrarAcessoAction: (...args: unknown[]) => registrarAcessoAction(...args),
}));

vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ className: "mock-dm-sans" }),
}));

beforeEach(() => {
  registrarAcessoAction.mockReset();
});

describe("RelatorioGate", () => {
  it("mostra as 5 opções de origem antes de qualquer escolha", () => {
    render(<RelatorioGate codigo="CK7X29QP" />);
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Stand / Loja física")).toBeInTheDocument();
    expect(screen.getByText("Indicação")).toBeInTheDocument();
    expect(screen.getByText("Redes sociais")).toBeInTheDocument();
    expect(screen.getByText("Outro")).toBeInTheDocument();
  });

  it("troca pro relatório quando a origem é aceita", async () => {
    registrarAcessoAction.mockResolvedValue({
      status: "ok",
      dados: {
        vehicle: { marca: "Toyota", modelo: "Corolla" },
        score: null,
        fotosCapa: [],
        codigoCertificado: "CK7X29QP",
        certificadoEmitidoEm: null,
        parceiroNome: null,
        parceiroLogoUrl: null,
        parceiroTelefone: null,
        dataInspecao: null,
        tecnicoNome: null,
        tecnicoCredencial: null,
        groups: [],
        items: [],
        responses: [],
        opcoes: [],
        medicaoResultados: [],
        photos: [],
        equipamentos: [],
        equipamentoFotos: [],
      },
    });

    render(<RelatorioGate codigo="CK7X29QP" />);
    fireEvent.click(screen.getByText("WhatsApp"));

    await waitFor(() => expect(screen.getByText("CK7X29QP")).toBeInTheDocument());
    expect(registrarAcessoAction).toHaveBeenCalledWith("CK7X29QP", "whatsapp");
  });

  it("mostra erro genérico quando o código é inválido", async () => {
    registrarAcessoAction.mockResolvedValue({ status: "erro" });

    render(<RelatorioGate codigo="INVALIDO" />);
    fireEvent.click(screen.getByText("Outro"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Relatório não encontrado."));
  });

  it("sai do estado 'carregando' e mostra erro com opção de tentar de novo quando a action rejeita", async () => {
    registrarAcessoAction.mockRejectedValue(new Error("falha de rede"));

    render(<RelatorioGate codigo="CK7X29QP" />);
    fireEvent.click(screen.getByText("WhatsApp"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Relatório não encontrado."));
    const tentarNovamente = screen.getByText("Tentar novamente");
    expect(tentarNovamente).toBeInTheDocument();

    fireEvent.click(tentarNovamente);
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
