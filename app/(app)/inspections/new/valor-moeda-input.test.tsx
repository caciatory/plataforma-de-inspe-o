import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ValorMoedaInput } from "./valor-moeda-input";

describe("ValorMoedaInput", () => {
  it("shows the raw value while focused", () => {
    render(
      <ValorMoedaInput id="valorBaseIucAnual" name="valorBaseIucAnual" label="Valor base IUC anual (€)" value="145.5" onChange={() => {}} />
    );
    const input = screen.getByLabelText("Valor base IUC anual (€)") as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.value).toBe("145.5");
  });

  it("formats as pt-PT currency once blurred", () => {
    render(
      <ValorMoedaInput id="valorBaseIucAnual" name="valorBaseIucAnual" label="Valor base IUC anual (€)" value="145.5" onChange={() => {}} />
    );
    const input = screen.getByLabelText("Valor base IUC anual (€)") as HTMLInputElement;
    fireEvent.blur(input);
    expect(input.value).toContain("145,50");
    expect(input.value).toContain("€");
  });

  it("strips non-numeric characters on change and calls onChange with the raw string", () => {
    let raw = "";
    render(
      <ValorMoedaInput id="valorBaseIucAnual" name="valorBaseIucAnual" label="Valor base IUC anual (€)" value="" onChange={(v) => (raw = v)} />
    );
    fireEvent.change(screen.getByLabelText("Valor base IUC anual (€)"), { target: { value: "1a4b5" } });
    expect(raw).toBe("145");
  });

  it("submits the raw numeric value via a hidden input, not the formatted display", () => {
    const { container } = render(
      <ValorMoedaInput id="valorBaseIucAnual" name="valorBaseIucAnual" label="Valor base IUC anual (€)" value="145.5" onChange={() => {}} />
    );
    const hidden = container.querySelector('input[type="hidden"][name="valorBaseIucAnual"]') as HTMLInputElement;
    expect(hidden.value).toBe("145.5");
  });
});
