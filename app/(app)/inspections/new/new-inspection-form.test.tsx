import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewInspectionForm } from "./new-inspection-form";
import type { CreateInspectionState } from "./actions";

const createInspectionAction = vi.fn<
  (prevState: CreateInspectionState, formData: FormData) => Promise<CreateInspectionState>
>(async () => ({ status: "idle" }));
vi.mock("./actions", () => ({
  createInspectionAction: (...args: Parameters<typeof createInspectionAction>) => createInspectionAction(...args),
  searchStandContactsAction: vi.fn(async () => []),
}));

describe("NewInspectionForm", () => {
  it("locks objetivo to venda when tipoCliente is stand", () => {
    render(<NewInspectionForm />);

    const tipoCliente = screen.getByLabelText("Tipo de cliente") as HTMLSelectElement;
    const objetivo = screen.getByLabelText("Objetivo") as HTMLSelectElement;

    expect(objetivo.disabled).toBe(false);

    fireEvent.change(tipoCliente, { target: { value: "stand" } });

    expect(objetivo.value).toBe("venda");
    expect(objetivo.disabled).toBe(true);
  });

  it("re-enables objetivo when switching back to particular", () => {
    render(<NewInspectionForm />);
    const tipoCliente = screen.getByLabelText("Tipo de cliente") as HTMLSelectElement;
    const objetivo = screen.getByLabelText("Objetivo") as HTMLSelectElement;

    fireEvent.change(tipoCliente, { target: { value: "stand" } });
    fireEvent.change(tipoCliente, { target: { value: "particular" } });

    expect(objetivo.disabled).toBe(false);
  });

  it("submits objetivo=venda via a hidden input when the select is disabled for stand (regression)", async () => {
    createInspectionAction.mockClear();

    const { container } = render(<NewInspectionForm />);
    const tipoCliente = screen.getByLabelText("Tipo de cliente") as HTMLSelectElement;
    const nomeSolicitante = screen.getByLabelText("Nome do solicitante") as HTMLInputElement;

    fireEvent.change(tipoCliente, { target: { value: "stand" } });
    fireEvent.change(nomeSolicitante, { target: { value: "Cliente Teste" } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(createInspectionAction).toHaveBeenCalled());

    const formData = createInspectionAction.mock.calls[0][1] as FormData;
    expect(formData.get("objetivo")).toBe("venda");
  });

  it("shows only the active tab's fields, keeping the others mounted", () => {
    render(<NewInspectionForm />);

    expect(screen.getByLabelText("Nome do solicitante")).toBeVisible();
    expect(screen.queryByLabelText("Matrícula")).not.toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));

    expect(screen.getByLabelText("Matrícula")).toBeVisible();
    expect(screen.queryByLabelText("Nome do solicitante")).not.toBeVisible();
  });

  it("keeps a previously typed value on a hidden tab after switching away and back", () => {
    render(<NewInspectionForm />);

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));
    fireEvent.change(screen.getByLabelText("Matrícula"), { target: { value: "AA-00-BB" } });

    fireEvent.click(screen.getByRole("tab", { name: "Cliente" }));
    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));

    expect((screen.getByLabelText("Matrícula") as HTMLInputElement).value).toBe("AA-00-BB");
  });

  it("keeps a typed value after the server returns a validation error (regression: React resets uncontrolled fields after a Server Action)", async () => {
    createInspectionAction.mockResolvedValueOnce({
      status: "error",
      message: "Matrícula é obrigatória",
      field: "matricula",
    });

    const { container } = render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Toyota" } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Matrícula é obrigatória"));

    expect((screen.getByLabelText("Marca") as HTMLInputElement).value).toBe("Toyota");
  });

  it("does not advance from the Cliente tab when nomeSolicitante is empty, advances once filled", () => {
    render(<NewInspectionForm />);

    const nextButton = screen.getByRole("button", { name: "Próximo" });
    fireEvent.click(nextButton);

    expect(screen.getByLabelText("Nome do solicitante")).toBeVisible();
    expect(screen.queryByLabelText("Matrícula")).not.toBeVisible();

    fireEvent.change(screen.getByLabelText("Nome do solicitante"), { target: { value: "Cliente Teste" } });
    fireEvent.click(nextButton);

    expect(screen.getByLabelText("Matrícula")).toBeVisible();
  });

  it("shows a submit button labeled Guardar only on the last tab (Equipamentos)", () => {
    render(<NewInspectionForm />);

    fireEvent.change(screen.getByLabelText("Nome do solicitante"), { target: { value: "Cliente Teste" } });
    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));

    const saveButton = screen.getByRole("button", { name: "Guardar" });
    expect(saveButton).toHaveAttribute("type", "submit");
  });

  it("switches to the tab containing the field the server reported as invalid", async () => {
    createInspectionAction.mockResolvedValueOnce({
      status: "error",
      message: "Informe o combustível",
      field: "combustivel",
    });

    const { container } = render(<NewInspectionForm />);
    // active tab starts as "cliente"; the erroring field lives in "especificacoes"
    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByLabelText("Combustível")).toBeVisible());
    expect(screen.queryByLabelText("Nome do solicitante")).not.toBeVisible();
  });
});
