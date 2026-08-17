import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrintButton } from "./print-button";

describe("PrintButton", () => {
  beforeEach(() => {
    vi.stubGlobal("print", vi.fn());
  });

  it("chama window.print() ao clicar", () => {
    render(<PrintButton />);
    fireEvent.click(screen.getByRole("button", { name: /Imprimir relatório/ }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
