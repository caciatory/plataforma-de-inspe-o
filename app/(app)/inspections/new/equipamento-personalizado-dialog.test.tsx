import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EquipamentoPersonalizadoDialog } from "./equipamento-personalizado-dialog";

describe("EquipamentoPersonalizadoDialog", () => {
  it("requires a nome and a condição before confirming", () => {
    const onConfirm = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={onConfirm} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with the typed nome and selected condição", () => {
    const onConfirm = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={onConfirm} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Nome do equipamento"), { target: { value: "Bagageira de teto" } });
    fireEvent.click(screen.getByLabelText("⚠️ Atenção"));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(onConfirm).toHaveBeenCalledWith("Bagageira de teto", "atencao");
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const onCancel = vi.fn();
    render(<EquipamentoPersonalizadoDialog categoriaLabel="Outros Equipamentos" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
