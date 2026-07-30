import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SimNaoRadio } from "./sim-nao-radio";

describe("SimNaoRadio", () => {
  it("renders the label and both options unchecked when value is blank", () => {
    render(<SimNaoRadio name="veiculoImportado" label="Veículo importado?" value="" onChange={() => {}} />);
    expect(screen.getByText("Veículo importado?")).toBeInTheDocument();
    expect((screen.getByLabelText("Sim (Veículo importado?)") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Não (Veículo importado?)") as HTMLInputElement).checked).toBe(false);
  });

  it("reflects value='sim' as the checked option", () => {
    render(<SimNaoRadio name="veiculoImportado" label="Veículo importado?" value="sim" onChange={() => {}} />);
    expect((screen.getByLabelText("Sim (Veículo importado?)") as HTMLInputElement).checked).toBe(true);
  });

  it("calls onChange with 'nao' when the Não option is picked", () => {
    let picked: "sim" | "nao" | null = null;
    render(<SimNaoRadio name="veiculoImportado" label="Veículo importado?" value="" onChange={(v) => (picked = v)} />);
    fireEvent.click(screen.getByLabelText("Não (Veículo importado?)"));
    expect(picked).toBe("nao");
  });

  it("shares the same name attribute across both options", () => {
    render(<SimNaoRadio name="veiculoImportado" label="Veículo importado?" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Sim (Veículo importado?)")).toHaveAttribute("name", "veiculoImportado");
    expect(screen.getByLabelText("Não (Veículo importado?)")).toHaveAttribute("name", "veiculoImportado");
  });
});
