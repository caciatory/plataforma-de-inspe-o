import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewInspectionForm } from "./new-inspection-form";

vi.mock("./actions", () => ({
  createInspectionAction: vi.fn(async (_prevState: unknown) => ({ status: "idle" })),
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
    const { createInspectionAction } = await import("./actions");
    const mockAction = createInspectionAction as unknown as ReturnType<typeof vi.fn>;
    mockAction.mockClear();

    const { container } = render(<NewInspectionForm />);
    const tipoCliente = screen.getByLabelText("Tipo de cliente") as HTMLSelectElement;
    const nomeSolicitante = screen.getByLabelText("Nome do solicitante") as HTMLInputElement;

    fireEvent.change(tipoCliente, { target: { value: "stand" } });
    fireEvent.change(nomeSolicitante, { target: { value: "Cliente Teste" } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await vi.waitFor(() => expect(mockAction).toHaveBeenCalled());

    const formData = mockAction.mock.calls[0][1] as FormData;
    expect(formData.get("objetivo")).toBe("venda");
  });
});
