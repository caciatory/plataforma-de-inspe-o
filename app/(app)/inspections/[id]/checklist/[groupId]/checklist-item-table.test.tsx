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
  ItemMedicaoForm: ({ itemTemplateId }: { itemTemplateId: string }) => (
    <div data-testid="item-medicao-form">Medição de {itemTemplateId}</div>
  ),
}));

vi.mock("./[itemId]/batch-apply-panel", () => ({
  BatchApplyPanel: ({ initialRows }: { initialRows: { itemTemplateId: string }[] }) => (
    <div data-testid="batch-apply-panel">{initialRows.map((r) => r.itemTemplateId).join(",")}</div>
  ),
}));

beforeEach(() => {
  saveEscolhaAction.mockReset();
  saveTextoAction.mockReset();
  saveDataAction.mockReset();
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
  { id: "opt-bom", conjunto_id: "conj-1", label: "Bom", exige_foto: false },
  { id: "opt-mau", conjunto_id: "conj-1", label: "Mau", exige_foto: true },
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
        pageUrl="/x"
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
        pageUrl="/x"
      />
    );

    fireEvent.click(screen.getByLabelText("Mau"));

    await waitFor(() => expect(saveEscolhaAction).toHaveBeenCalledWith({ status: "idle" }, expect.any(FormData)));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/foto/i));
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
        pageUrl="/x"
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
        pageUrl="/x"
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
        pageUrl="/x"
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
        pageUrl="/x"
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
        pageUrl="/x"
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
        pageUrl="/x"
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
        pageUrl="/x"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Aplicar aos itens semelhantes/ }));

    expect(screen.getByTestId("batch-apply-panel")).toHaveTextContent("item-escolha,item-sibling");
  });
});
