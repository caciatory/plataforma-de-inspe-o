import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubmitInspectionPanel } from "./submit-inspection-panel";

const submitInspectionAction = vi.fn();
vi.mock("./actions", () => ({
  submitInspectionAction: (...args: unknown[]) => submitInspectionAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  submitInspectionAction.mockReset();
  refresh.mockClear();
});

describe("SubmitInspectionPanel", () => {
  it("shows pendências per group and a disabled button when there are pending items", () => {
    render(
      <SubmitInspectionPanel
        inspectionId="insp-1"
        label="Finalizar inspeção"
        progress={[
          { id: "g1", ordem: 1, nome: "Pneus", pendentes: 3, total: 5 },
          { id: "g2", ordem: 2, nome: "Travões", pendentes: 0, total: 2 },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Finalizar inspeção" })).toBeDisabled();
    expect(screen.getByText("Pneus: 3 pendentes")).toBeInTheDocument();
    expect(screen.queryByText(/Travões/)).not.toBeInTheDocument();
  });

  it("asks for confirmation before submitting when there are no pending items", () => {
    render(
      <SubmitInspectionPanel
        inspectionId="insp-1"
        label="Finalizar inspeção"
        progress={[{ id: "g1", ordem: 1, nome: "Pneus", pendentes: 0, total: 5 }]}
      />
    );

    const trigger = screen.getByRole("button", { name: "Finalizar inspeção" });
    expect(trigger).not.toBeDisabled();
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "Confirmar envio" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Confirmar envio" })).not.toBeInTheDocument();
  });

  it("shows the action's error message after a failed submit", async () => {
    submitInspectionAction.mockResolvedValue({ status: "error", message: "Ainda há itens pendentes na checklist." });
    render(
      <SubmitInspectionPanel
        inspectionId="insp-1"
        label="Finalizar inspeção"
        progress={[{ id: "g1", ordem: 1, nome: "Pneus", pendentes: 0, total: 5 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Finalizar inspeção" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ainda há itens pendentes na checklist.");
  });
});
