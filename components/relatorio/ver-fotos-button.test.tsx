import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VerFotosButton } from "./ver-fotos-button";

describe("VerFotosButton", () => {
  it("abre o dialog #relatorio-hero-lightbox existente na página ao clicar", () => {
    render(
      <>
        <dialog id="relatorio-hero-lightbox">conteúdo</dialog>
        <VerFotosButton />
      </>
    );
    const dialog = document.getElementById("relatorio-hero-lightbox") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Ver fotos" }));
    expect(dialog.open).toBe(true);
  });
});
