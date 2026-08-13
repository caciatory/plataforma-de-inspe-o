import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CertificadoInfoButton } from "./certificado-info";

describe("CertificadoInfoButton", () => {
  it("abre o diálogo explicando o código de certificado ao clicar", () => {
    render(<CertificadoInfoButton />);
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "O que é o código de certificado?" }));

    expect(dialog.open).toBe(true);
    expect(screen.getByText(/checkauto\.pt/)).toBeInTheDocument();
  });

  it("fecha o diálogo ao clicar em Fechar", () => {
    render(<CertificadoInfoButton />);
    fireEvent.click(screen.getByRole("button", { name: "O que é o código de certificado?" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(dialog.open).toBe(false);
  });

  it("pisca até o cliente clicar, depois fica normal", () => {
    render(<CertificadoInfoButton />);
    const botao = screen.getByRole("button", { name: "O que é o código de certificado?" });
    expect(botao.className).toContain("relatorio-info-icon--pisca");

    fireEvent.click(botao);

    expect(botao.className).not.toContain("relatorio-info-icon--pisca");
  });
});
