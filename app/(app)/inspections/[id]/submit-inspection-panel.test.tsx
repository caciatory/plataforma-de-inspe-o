import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  it("opens a dialog with pendências per group, not the confirm form, when there are pending items", () => {
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

    const trigger = screen.getByRole("button", { name: "Finalizar inspeção" });
    expect(trigger).not.toBeDisabled();

    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    fireEvent.click(trigger);

    expect(dialog.open).toBe(true);
    expect(screen.getByText("Pneus: 3 pendentes")).toBeInTheDocument();
    expect(screen.queryByText(/Travões/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar envio" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(dialog.open).toBe(false);
  });

  it("opens a dialog with the send confirmation when there are no pending items", () => {
    render(
      <SubmitInspectionPanel
        inspectionId="insp-1"
        label="Finalizar inspeção"
        progress={[{ id: "g1", ordem: 1, nome: "Pneus", pendentes: 0, total: 5 }]}
      />
    );

    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(screen.getByRole("button", { name: "Finalizar inspeção" }));

    expect(dialog.open).toBe(true);
    expect(screen.getByRole("button", { name: "Confirmar envio" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(dialog.open).toBe(false);
  });

  it("shows the action's error message inside the dialog after a failed submit", async () => {
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

  it("closes the dialog and refreshes the router after a successful submit", async () => {
    submitInspectionAction.mockResolvedValue({ status: "success" });
    render(
      <SubmitInspectionPanel
        inspectionId="insp-1"
        label="Finalizar inspeção"
        progress={[{ id: "g1", ordem: 1, nome: "Pneus", pendentes: 0, total: 5 }]}
      />
    );

    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(screen.getByRole("button", { name: "Finalizar inspeção" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar envio" }));

    await waitFor(() => expect(dialog.open).toBe(false));
    expect(refresh).toHaveBeenCalled();
  });
});
