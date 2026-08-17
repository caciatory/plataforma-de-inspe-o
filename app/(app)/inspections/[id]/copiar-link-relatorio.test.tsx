import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopiarLinkRelatorioButton } from "./copiar-link-relatorio";

const writeText = vi.fn(async () => {});

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
  vi.stubGlobal("location", { origin: "https://checkauto.pt" });
});

describe("CopiarLinkRelatorioButton", () => {
  it("copia o link público com o código do certificado e mostra feedback", async () => {
    render(<CopiarLinkRelatorioButton codigo="CK7X29QP" />);

    fireEvent.click(screen.getByText("Copiar link do relatório"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://checkauto.pt/relatorio/CK7X29QP"));
    expect(screen.getByText("Copiado!")).toBeInTheDocument();
  });
});
