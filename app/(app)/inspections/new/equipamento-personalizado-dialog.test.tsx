import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EquipamentoPersonalizadoDialog } from "./equipamento-personalizado-dialog";

describe("EquipamentoPersonalizadoDialog", () => {
  it("does not confirm when nome is blank", () => {
    const onConfirm = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={onConfirm} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with the typed nome (no condição collected — Fix 3)", () => {
    const onConfirm = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={onConfirm} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Nome do equipamento"), { target: { value: "Bagageira de teto" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onConfirm).toHaveBeenCalledWith("Bagageira de teto");
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const onCancel = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("does not render condição radios (Fix 3: condição is picked once, on the row itself)", () => {
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByLabelText("✓ Bom")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("⚠️ Atenção")).not.toBeInTheDocument();
  });
});
