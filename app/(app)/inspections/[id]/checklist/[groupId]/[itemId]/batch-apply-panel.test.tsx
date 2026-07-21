import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BatchApplyPanel } from "./batch-apply-panel";

const applyClassificacaoBatchAction = vi.fn();
vi.mock("./actions", () => ({
  applyClassificacaoBatchAction: (...args: unknown[]) => applyClassificacaoBatchAction(...args),
  attachPhotoAction: vi.fn(),
  deletePhotoAction: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) } }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  applyClassificacaoBatchAction.mockReset();
  push.mockClear();
});

const rowA = { itemTemplateId: "item-1", nome: "Pneu A", classificacao: "otimo", observacao: "Sem avarias", photos: [] };
const rowB = { itemTemplateId: "item-2", nome: "Pneu B", classificacao: "otimo", observacao: "Sem avarias", photos: [] };

describe("BatchApplyPanel", () => {
  it("renders one fieldset per row, pre-filled", () => {
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA, rowB]} onCancel={() => {}} />
    );

    expect(screen.getByText("Pneu A")).toBeInTheDocument();
    expect(screen.getByText("Pneu B")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Sem avarias")).toHaveLength(2);
  });

  it("blocks confirmation and names the row when a 'ruim' row has no photo, without calling the action", () => {
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByLabelText("Ruim"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Pneu A/);
    expect(applyClassificacaoBatchAction).not.toHaveBeenCalled();
  });

  it("submits the batch and navigates to groupListUrl on success", async () => {
    applyClassificacaoBatchAction.mockResolvedValue({});

    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA, rowB]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() =>
      expect(applyClassificacaoBatchAction).toHaveBeenCalledWith("insp-1", [
        { itemTemplateId: "item-1", classificacao: "otimo", observacao: "Sem avarias" },
        { itemTemplateId: "item-2", classificacao: "otimo", observacao: "Sem avarias" },
      ])
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/x"));
  });

  it("shows the action's error message and does not navigate on failure", async () => {
    applyClassificacaoBatchAction.mockResolvedValue({ error: "Não foi possível guardar." });

    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível guardar."));
    expect(push).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const onCancel = vi.fn();
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" initialRows={[rowA]} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
