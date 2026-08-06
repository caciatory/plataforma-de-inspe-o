import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminActionsPanel } from "./admin-actions-panel";

const approveInspectionAction = vi.fn();
const returnInspectionAction = vi.fn();
vi.mock("./actions", () => ({
  approveInspectionAction: (...args: unknown[]) => approveInspectionAction(...args),
  returnInspectionAction: (...args: unknown[]) => returnInspectionAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  approveInspectionAction.mockReset();
  returnInspectionAction.mockReset();
  refresh.mockClear();
});

describe("AdminActionsPanel", () => {
  it("renders nothing when status is not aguardando_aprovacao", () => {
    const { container } = render(<AdminActionsPanel inspectionId="insp-1" status="rascunho" />);
    expect(container).toBeEmptyDOMElement();
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
