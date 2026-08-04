import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BatchApplyPanel } from "./batch-apply-panel";

const saveEscolhaAction = vi.fn();
vi.mock("./actions", () => ({
  saveEscolhaAction: (...args: unknown[]) => saveEscolhaAction(...args),
  attachPhotoAction: vi.fn(),
  deletePhotoAction: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) } }),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  saveEscolhaAction.mockReset();
  refresh.mockClear();
});

const opcoes = [
  { id: "opt-otimo", label: "Ótimo", exige_foto: false, ordem: 1 },
  { id: "opt-medio", label: "Médio", exige_foto: false, ordem: 2 },
  { id: "opt-ruim", label: "Ruim", exige_foto: true, ordem: 3 },
  { id: "opt-na", label: "N.A.", exige_foto: false, ordem: 4 },
];

const rowA = {
  itemTemplateId: "item-1",
  nome: "Pneu A",
  opcao_id: "opt-otimo",
  observacao: "Sem avarias",
  photos: [],
  included: true,
  isCurrent: true,
  alreadyAnsweredLabel: null,
};
const rowB = {
  itemTemplateId: "item-2",
  nome: "Pneu B",
  opcao_id: "opt-otimo",
  observacao: "Sem avarias",
  photos: [],
  included: true,
  isCurrent: false,
  alreadyAnsweredLabel: null,
};
const rowAlreadyAnswered = {
  itemTemplateId: "item-3",
  nome: "Pneu C",
  opcao_id: "opt-otimo",
  observacao: "",
  photos: [],
  included: false,
  isCurrent: false,
  alreadyAnsweredLabel: "Médio",
};
const rowC = {
  itemTemplateId: "item-4",
  nome: "Pneu D",
  opcao_id: "opt-otimo",
  observacao: "Sem avarias",
  photos: [],
  included: true,
  isCurrent: false,
  alreadyAnsweredLabel: null,
};

describe("BatchApplyPanel", () => {
  it("renders one fieldset per row, pre-filled", () => {
    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA, rowB]} onCancel={() => {}} />);

    expect(screen.getByText("Pneu A")).toBeInTheDocument();
    expect(screen.getByText(/Pneu B/)).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Sem avarias")).toHaveLength(2);
  });

  it("shows already-answered siblings unchecked with their previous answer noted, and hides their fields", () => {
    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA, rowAlreadyAnswered]} onCancel={() => {}} />);

    expect(screen.getByText(/Pneu C.*já respondido: Médio/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Observação", { selector: `#observacao-${rowAlreadyAnswered.itemTemplateId}` })).not.toBeInTheDocument();
  });

  it("re-includes an already-answered sibling when its checkbox is checked, revealing its fields", () => {
    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA, rowAlreadyAnswered]} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getAllByLabelText("Ótimo")).toHaveLength(2);
  });

  it("blocks confirmation and names the row when a row whose opcao exige_foto has no photo, without calling the action", () => {
    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA]} onCancel={() => {}} />);

    fireEvent.click(screen.getAllByLabelText("Ruim")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Pneu A/);
    expect(saveEscolhaAction).not.toHaveBeenCalled();
  });

  it("calls saveEscolhaAction once per included row, in order, then refreshes the router", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "idle" });

    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA, rowB, rowAlreadyAnswered]} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(saveEscolhaAction).toHaveBeenCalledTimes(2));

    expect(saveEscolhaAction.mock.calls[0][1].get("itemTemplateId")).toBe("item-1");
    expect(saveEscolhaAction.mock.calls[0][1].get("opcao_id")).toBe("opt-otimo");
    expect(saveEscolhaAction.mock.calls[0][1].get("observacao")).toBe("Sem avarias");
    expect(saveEscolhaAction.mock.calls[1][1].get("itemTemplateId")).toBe("item-2");

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("stops at the first failing row without saving the rest, but refreshes to reflect any rows saved before the failure", async () => {
    saveEscolhaAction
      .mockResolvedValueOnce({ status: "idle" })
      .mockResolvedValueOnce({ status: "error", message: "Não foi possível guardar." });

    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA, rowB, rowC]} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Pneu B.*Não foi possível guardar\./));
    expect(saveEscolhaAction).toHaveBeenCalledTimes(2);
    expect(saveEscolhaAction.mock.calls.every((call) => call[1].get("itemTemplateId") !== rowC.itemTemplateId)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the action's error message, naming the failing row", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "error", message: "Não foi possível guardar." });

    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA]} onCancel={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar aplicação" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Pneu A.*Não foi possível guardar\./));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancelar is clicked", () => {
    const onCancel = vi.fn();
    render(<BatchApplyPanel inspectionId="insp-1" opcoes={opcoes} initialRows={[rowA]} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
