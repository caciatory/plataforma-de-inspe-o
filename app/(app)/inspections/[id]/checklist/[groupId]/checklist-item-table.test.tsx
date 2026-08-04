import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChecklistItemTable, type TableItem, type TableResponse, type TableOpcao } from "./checklist-item-table";

const saveEscolhaAction = vi.fn();
const saveTextoAction = vi.fn();
const saveDataAction = vi.fn();
vi.mock("./[itemId]/actions", () => ({
  saveEscolhaAction: (...args: unknown[]) => saveEscolhaAction(...args),
  saveTextoAction: (...args: unknown[]) => saveTextoAction(...args),
  saveDataAction: (...args: unknown[]) => saveDataAction(...args),
}));

vi.mock("./[itemId]/item-medicao-form", () => ({
  ItemMedicaoForm: ({ itemTemplateId, onSuccess }: { itemTemplateId: string; onSuccess?: () => void }) => (
    <div data-testid="item-medicao-form">
      Medição de {itemTemplateId}
      <button onClick={() => onSuccess?.()}>Simular sucesso</button>
    </div>
  ),
}));

vi.mock("./[itemId]/batch-apply-panel", () => ({
  BatchApplyPanel: ({ initialRows }: { initialRows: { itemTemplateId: string }[] }) => (
    <div data-testid="batch-apply-panel">{initialRows.map((r) => r.itemTemplateId).join(",")}</div>
  ),
}));

vi.mock("./[itemId]/photo-manager", () => ({
  PhotoManager: ({ itemTemplateId }: { itemTemplateId: string }) => (
    <div data-testid="photo-manager">Fotos de {itemTemplateId}</div>
  ),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  saveEscolhaAction.mockReset();
  saveTextoAction.mockReset();
  saveDataAction.mockReset();
  refresh.mockClear();
});

const escolhaItem: TableItem = {
  id: "item-escolha",
  nome: "Pneu dianteiro esquerdo",
  tipo: "escolha",
  conjunto_opcao_id: "conj-1",
  unidade_medicao: null,
  qtd_pontos_medicao: null,
  grupo_replicacao: "pneus-estado-geral",
};
const textoItem: TableItem = {
  id: "item-texto",
  nome: "Número de chassi",
  tipo: "texto",
  conjunto_opcao_id: null,
  unidade_medicao: null,
  qtd_pontos_medicao: null,
  grupo_replicacao: null,
};
const dataItem: TableItem = {
  id: "item-data",
  nome: "Data da última revisão",
  tipo: "data",
  conjunto_opcao_id: null,
  unidade_medicao: null,
  qtd_pontos_medicao: null,
  grupo_replicacao: null,
};
const medicaoItem: TableItem = {
  id: "item-medicao",
  nome: "Espessura de tinta — capô",
  tipo: "medicao",
  conjunto_opcao_id: null,
  unidade_medicao: "µm",
  qtd_pontos_medicao: 3,
  grupo_replicacao: null,
};

const opcoes: TableOpcao[] = [
  { id: "opt-bom", conjunto_id: "conj-1", label: "Bom", exige_foto: false, ordem: 1 },
  { id: "opt-mau", conjunto_id: "conj-1", label: "Mau", exige_foto: true, ordem: 2 },
];

describe("ChecklistItemTable", () => {
  it("renders an escolha row as a segmented control scoped to the item's conjunto", () => {
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    expect(screen.getByText("Bom")).toBeInTheDocument();
    expect(screen.getByText("Mau")).toBeInTheDocument();
  });

  it("saves the selected escolha option and shows the DB's error inline", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "error", message: "Esta resposta exige pelo menos 1 foto anexada." });
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    fireEvent.click(screen.getByLabelText("Mau"));

    await waitFor(() => expect(saveEscolhaAction).toHaveBeenCalledWith({ status: "idle" }, expect.any(FormData)));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/foto/i));
  });

  it("shows the photo uploader once an option requiring a photo is selected, and lets the técnico retry the save", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "error", message: "Esta resposta exige pelo menos 1 foto anexada." });
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    expect(screen.queryByTestId("photo-manager")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Mau"));

    expect(screen.getByTestId("photo-manager")).toHaveTextContent("item-escolha");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    saveEscolhaAction.mockResolvedValue({ status: "idle" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(saveEscolhaAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("shows the photo uploader on initial render when the already-saved option requires a photo", () => {
    const response: TableResponse = {
      id: "resp-mau",
      item_template_id: "item-escolha",
      opcao_id: "opt-mau",
      resposta_texto: null,
      resposta_data: null,
      observacao: null,
      respondido: true,
    };
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[response]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    expect(screen.getByTestId("photo-manager")).toHaveTextContent("item-escolha");
  });

  it("renders a texto row and saves resposta_texto on blur", async () => {
    saveTextoAction.mockResolvedValue({ status: "idle" });
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[textoItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "9BWZZZ377VT004251" } });
    fireEvent.blur(input);

    await waitFor(() => expect(saveTextoAction).toHaveBeenCalled());
    const formData = saveTextoAction.mock.calls[0][1] as FormData;
    expect(formData.get("resposta_texto")).toBe("9BWZZZ377VT004251");
    expect(formData.get("itemTemplateId")).toBe("item-texto");
  });

  it("renders a data row and saves resposta_data on blur", async () => {
    saveDataAction.mockResolvedValue({ status: "idle" });
    const { container } = render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[dataItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-21" } });
    fireEvent.blur(input);

    await waitFor(() => expect(saveDataAction).toHaveBeenCalled());
    const formData = saveDataAction.mock.calls[0][1] as FormData;
    expect(formData.get("resposta_data")).toBe("2026-07-21");
  });

  it("renders a medicao row as a 'Medir' badge when unanswered, opening the reused ItemMedicaoForm in a dialog", () => {
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[medicaoItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Medir" }));
    expect(screen.getByTestId("item-medicao-form")).toHaveTextContent("item-medicao");
  });

  it("renders the medicao result as a badge when answered", () => {
    const response: TableResponse = {
      id: "resp-medicao",
      item_template_id: "item-medicao",
      opcao_id: null,
      resposta_texto: null,
      resposta_data: null,
      observacao: null,
      respondido: true,
    };
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[medicaoItem]}
        allGroupItems={[]}
        responses={[response]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[{ item_response_id: "resp-medicao", resultado: "critico" }]}
        medicaoValores={[{ item_response_id: "resp-medicao", valores: [310, 320, 305] }]}
      />
    );

    expect(screen.getByRole("button", { name: "Crítico" })).toBeInTheDocument();
  });

  it("shows the família icon only when the item has grupo_replicacao and is respondido", () => {
    const respondido: TableResponse = {
      id: "resp-1",
      item_template_id: "item-escolha",
      opcao_id: "opt-bom",
      resposta_texto: null,
      resposta_data: null,
      observacao: null,
      respondido: true,
    };
    const pendente: TableResponse = { ...respondido, item_template_id: "item-texto", respondido: false };

    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem, textoItem]}
        allGroupItems={[]}
        responses={[respondido, pendente]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    expect(screen.getByRole("button", { name: /Aplicar aos itens semelhantes/ })).toBeInTheDocument();
  });

  it("does not show the família icon for an item with no grupo_replicacao even if respondido", () => {
    const respondido: TableResponse = {
      id: "resp-2",
      item_template_id: "item-texto",
      opcao_id: null,
      resposta_texto: "algo",
      resposta_data: null,
      observacao: null,
      respondido: true,
    };

    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[textoItem]}
        allGroupItems={[]}
        responses={[respondido]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    expect(screen.queryByRole("button", { name: /Aplicar aos itens semelhantes/ })).not.toBeInTheDocument();
  });

  it("opens the família dialog with siblings computed from grupo_replicacao, excluding the current item", () => {
    const allGroupItems = [
      { id: "item-escolha", nome: "Pneu dianteiro esquerdo", grupo_replicacao: "pneus-estado-geral" },
      { id: "item-sibling", nome: "Pneu dianteiro direito", grupo_replicacao: "pneus-estado-geral" },
    ];
    const response: TableResponse = {
      id: "resp-1",
      item_template_id: "item-escolha",
      opcao_id: "opt-bom",
      resposta_texto: null,
      resposta_data: null,
      observacao: null,
      respondido: true,
    };

    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={allGroupItems}
        responses={[response]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Aplicar aos itens semelhantes/ }));

    expect(screen.getByTestId("batch-apply-panel")).toHaveTextContent("item-escolha,item-sibling");
  });

  it("calls router.refresh() after saving an escolha option successfully", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "idle" });
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    fireEvent.click(screen.getByLabelText("Bom"));

    await waitFor(() => expect(saveEscolhaAction).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not call router.refresh() when saving escolha fails", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "error", message: "Falhou" });
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    fireEvent.click(screen.getByLabelText("Bom"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a Tentar novamente button for texto and calls router.refresh() once the retry succeeds", async () => {
    saveTextoAction.mockResolvedValue({ status: "error", message: "Falhou" });
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[textoItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "9BWZZZ377VT004251" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();

    saveTextoAction.mockResolvedValue({ status: "idle" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(saveTextoAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("shows a Tentar novamente button for data and calls router.refresh() once the retry succeeds", async () => {
    saveDataAction.mockResolvedValue({ status: "error", message: "Falhou" });
    const { container } = render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[dataItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-21" } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    saveDataAction.mockResolvedValue({ status: "idle" });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(saveDataAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("resyncs the escolha pill and row state when the response prop changes externally (regression: batch-apply on a sibling never touches this item's own save(), so its local opcaoId state went stale)", () => {
    const { rerender } = render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    const row = () => document.querySelector("tbody tr") as HTMLElement;
    expect(row()).toHaveClass("item-table__row--pendente");
    expect(screen.getByLabelText("Bom")).not.toBeChecked();

    const batchAppliedResponse: TableResponse = {
      id: "resp-batch",
      item_template_id: "item-escolha",
      opcao_id: "opt-bom",
      resposta_texto: null,
      resposta_data: null,
      observacao: null,
      respondido: true,
    };
    rerender(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[batchAppliedResponse]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    expect(row()).toHaveClass("item-table__row--respondido");
    expect(screen.getByLabelText("Bom")).toBeChecked();
  });

  it("marks the row as respondido optimistically, before the save round-trip resolves", async () => {
    let resolveSave: (value: { status: string }) => void = () => {};
    saveEscolhaAction.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)));
    const { container } = render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    const row = container.querySelector("tbody tr") as HTMLElement;
    expect(row).toHaveClass("item-table__row--pendente");

    fireEvent.click(screen.getByLabelText("Bom"));

    expect(row).toHaveClass("item-table__row--respondido");

    resolveSave({ status: "idle" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("rolls back the optimistic respondido state when the save fails", async () => {
    saveEscolhaAction.mockResolvedValue({ status: "error", message: "Falhou" });
    const { container } = render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[escolhaItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={opcoes}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    const row = container.querySelector("tbody tr") as HTMLElement;
    fireEvent.click(screen.getByLabelText("Bom"));
    expect(row).toHaveClass("item-table__row--respondido");

    await waitFor(() => expect(row).toHaveClass("item-table__row--pendente"));
  });

  it("refreshes and closes the medição dialog when ItemMedicaoForm reports success", () => {
    render(
      <ChecklistItemTable
        inspectionId="insp-1"
        items={[medicaoItem]}
        allGroupItems={[]}
        responses={[]}
        opcoes={[]}
        photos={[]}
        medicaoResultados={[]}
        medicaoValores={[]}
      />
    );

    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(screen.getByRole("button", { name: "Medir" }));
    expect(dialog.open).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Simular sucesso" }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
  });
});
