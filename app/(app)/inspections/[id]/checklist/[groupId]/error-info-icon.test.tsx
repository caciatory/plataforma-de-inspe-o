import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorInfoIcon } from "./error-info-icon";

describe("ErrorInfoIcon", () => {
  it("anuncia a mensagem completa imediatamente pra leitor de tela (sr-only), mesmo escondida visualmente", () => {
    render(<ErrorInfoIcon message="Esta resposta exige pelo menos 1 foto anexada." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Esta resposta exige pelo menos 1 foto anexada.");
    expect(screen.queryByText("Esta resposta exige pelo menos 1 foto anexada.", { selector: ".error-info__text" })).toBeNull();
  });

  it("mostra a mensagem no title do botão (tooltip nativo ao passar o mouse)", () => {
    render(<ErrorInfoIcon message="Esta resposta exige pelo menos 1 foto anexada." />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "Esta resposta exige pelo menos 1 foto anexada.");
  });

  it("clicar expande o texto visível, clicar de novo esconde", () => {
    render(<ErrorInfoIcon message="Esta resposta exige pelo menos 1 foto anexada." />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Esta resposta exige pelo menos 1 foto anexada.", { selector: ".error-info__text" })).toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Esta resposta exige pelo menos 1 foto anexada.", { selector: ".error-info__text" })).toBeNull();
  });
});
