import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminActionsPanel } from "./admin-actions-panel";

const approveInspectionAction = vi.fn();
const returnInspectionAction = vi.fn();
const cancelInspectionAction = vi.fn();
vi.mock("./actions", () => ({
  approveInspectionAction: (...args: unknown[]) => approveInspectionAction(...args),
  returnInspectionAction: (...args: unknown[]) => returnInspectionAction(...args),
  cancelInspectionAction: (...args: unknown[]) => cancelInspectionAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  approveInspectionAction.mockReset();
  returnInspectionAction.mockReset();
  cancelInspectionAction.mockReset();
  refresh.mockClear();
});

describe("AdminActionsPanel", () => {
  it("shows the cancel button for a rascunho (no approve/return buttons)", () => {
    render(<AdminActionsPanel inspectionId="insp-1" status="rascunho" />);
    expect(screen.getByRole("button", { name: "Cancelar inspeção" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  });

  it("cancels and refreshes on success", async () => {
    cancelInspectionAction.mockResolvedValue({ status: "success" });
    render(<AdminActionsPanel inspectionId="insp-1" status="devolvida" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar inspeção" }));
    fireEvent.change(screen.getByLabelText("Motivo do cancelamento"), { target: { value: "Cliente desistiu" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the error message when cancelling fails validation", async () => {
    cancelInspectionAction.mockResolvedValue({ status: "error", message: "Informe o motivo do cancelamento." });
    render(<AdminActionsPanel inspectionId="insp-1" status="rascunho" />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar inspeção" }));
    // Same jsdom constraint-validation caveat as the "returning fails validation" test below:
    // fireEvent.click on the submit button is blocked by the required `motivo` field before
    // the action runs, so dispatch a raw submit event to reach the server-error display path.
    const form = screen.getByLabelText("Motivo do cancelamento").closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Informe o motivo do cancelamento."));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders nothing for aprovada or cancelada", () => {
    const { container: c1 } = render(<AdminActionsPanel inspectionId="insp-1" status="aprovada" />);
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(<AdminActionsPanel inspectionId="insp-1" status="cancelada" />);
    expect(c2).toBeEmptyDOMElement();
  });

  it("shows Cancelar inspeção alongside Aprovar/Devolver for aguardando_aprovacao", () => {
    render(<AdminActionsPanel inspectionId="insp-1" status="aguardando_aprovacao" />);
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Devolver" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar inspeção" })).toBeInTheDocument();
  });

  it("approves and refreshes on success", async () => {
    approveInspectionAction.mockResolvedValue({ status: "success" });
    render(<AdminActionsPanel inspectionId="insp-1" status="aguardando_aprovacao" />);

    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the error message when returning fails validation", async () => {
    returnInspectionAction.mockResolvedValue({ status: "error", message: "Informe o motivo da devolução." });
    render(<AdminActionsPanel inspectionId="insp-1" status="aguardando_aprovacao" />);

    fireEvent.click(screen.getByRole("button", { name: "Devolver" }));
    // fireEvent.click on the submit button goes through native requestSubmit()/constraint
    // validation, which blocks submission on the empty required `motivo` field before the
    // action ever runs. Dispatch a raw submit event instead, as item-medicao-form.test.tsx
    // does for the same Server-Action + required-field combination, to exercise the
    // server-side error-display path.
    const form = screen.getByLabelText("Motivo da devolução").closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Informe o motivo da devolução."));
    expect(refresh).not.toHaveBeenCalled();
  });
});
