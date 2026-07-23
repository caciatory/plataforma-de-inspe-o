import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BatchApplyPanel } from "./batch-apply-panel";

const applyOpcoesBatchAction = vi.fn();
vi.mock("./actions", () => ({
  applyOpcoesBatchAction: (...args: unknown[]) => applyOpcoesBatchAction(...args),
  attachPhotoAction: vi.fn(),
  deletePhotoAction: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) } }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  applyOpcoesBatchAction.mockReset();
  push.mockClear();
});

const opcoes = [
  { id: "opt-otimo", label: "Ótimo", exige_foto: false },
  { id: "opt-medio", label: "Médio", exige_foto: false },
  { id: "opt-ruim", label: "Ruim", exige_foto: true },
  { id: "opt-na", label: "N.A.", exige_foto: false },
];

const rowA = { itemTemplateId: "item-1", nome: "Pneu A", opcao_id: "opt-otimo", observacao: "Sem avarias", photos: [] };
const rowB = { itemTemplateId: "item-2", nome: "Pneu B", opcao_id: "opt-otimo", observacao: "Sem avarias", photos: [] };

describe("BatchApplyPanel", () => {
  it("renders one fieldset per row, pre-filled", () => {
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA, rowB]} onCancel={() => {}} />
    );

    expect(screen.getByText("Pneu A")).toBeInTheDocument();
    expect(screen.getByText("Pneu B")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Sem avarias")).toHaveLength(2);
  });

  it("blocks confirmation and names the row when a row whose opcao exige_foto has no photo, without calling the action", () => {
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getAllByLabelText("Ruim")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Pneu A/);
    expect(applyOpcoesBatchAction).not.toHaveBeenCalled();
  });

  it("submits the batch and navigates to groupListUrl on success", async () => {
    applyOpcoesBatchAction.mockResolvedValue({});

    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA, rowB]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() =>
      expect(applyOpcoesBatchAction).toHaveBeenCalledWith("insp-1", [
        { itemTemplateId: "item-1", opcaoId: "opt-otimo", observacao: "Sem avarias" },
        { itemTemplateId: "item-2", opcaoId: "opt-otimo", observacao: "Sem avarias" },
      ])
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/x"));
  });

  it("shows the action's error message and does not navigate on failure", async () => {
    applyOpcoesBatchAction.mockResolvedValue({ error: "Não foi possível guardar." });

    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA]} onCancel={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível guardar."));
    expect(push).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const onCancel = vi.fn();
    render(
      <BatchApplyPanel inspectionId="insp-1" groupListUrl="/x" opcoes={opcoes} initialRows={[rowA]} onCancel={onCancel} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
