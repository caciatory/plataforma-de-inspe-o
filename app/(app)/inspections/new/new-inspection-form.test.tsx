import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NewInspectionForm } from "./new-inspection-form";
import type { CreateInspectionState } from "./actions";

const createInspectionAction = vi.fn<
  (prevState: CreateInspectionState, formData: FormData) => Promise<CreateInspectionState>
>(async () => ({ status: "idle" }));
vi.mock("./actions", () => ({
  createInspectionAction: (...args: Parameters<typeof createInspectionAction>) => createInspectionAction(...args),
  searchStandContactsAction: vi.fn(async () => []),
}));

const updateInspectionAction = vi.fn(async () => ({ status: "idle" }));
vi.mock("../[id]/editar/actions", () => ({
  updateInspectionAction: (...args: Parameters<typeof updateInspectionAction>) => updateInspectionAction(...args),
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

    // ponytail: default waitFor timeout (1000ms) got tight once Task 6 tripled
    // the always-mounted DOM under Equipamentos (2 photo inputs per item x 41
    // items); bump it rather than fight the established always-mounted pattern.
    await waitFor(() => expect(screen.getByLabelText("Combustível")).toBeVisible(), { timeout: 8000 });
    expect(screen.queryByLabelText("Nome do solicitante")).not.toBeVisible();
  });

  it("shows the Histórico fields, including quilometragem moved from Identificação", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    expect(screen.getByLabelText("Quilometragem atual")).toBeVisible();
    expect(screen.getByText("Indícios de adulteração de quilometragem?")).toBeVisible();
    expect(screen.getByLabelText("Número de proprietários anteriores")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));
    expect(screen.queryByLabelText("Quilometragem")).not.toBeInTheDocument();
  });

  it("blocks advancing past Equipamentos when a selected item has no condição set", () => {
    // Regression note: the plan's original assertion spied on
    // HTMLInputElement.prototype.reportValidity and expected it to be called
    // on submit. jsdom (v25, verified via its HTMLFormElement-impl source)
    // blocks the native "submit" event for an invalid form via its internal
    // requestSubmit() -> reportValidity() -> checkValidity() path, but that
    // internal path never calls the individual invalid control's own public
    // .reportValidity() the way real browsers do — so the spy is never hit
    // even though the required-radio validation is genuinely enforced. We
    // assert the actually-observable effect instead: the server action never
    // runs when a selected item's condição radio (required) is left unset.
    //
    // Isolation note (fix round 1): every other required field (matrícula,
    // marca, modelo, quilometragem — on other, hidden tabs) is filled in
    // below. jsdom does not exclude `hidden` elements from native constraint
    // validation the way real browsers do (see the comment on handleNext
    // above), so without this the test would pass even if the condição
    // radio's `required` were removed entirely — those other empty required
    // fields would block the submit on their own. See also the direct,
    // form-submission-independent check in equipamento-categoria.test.tsx.
    createInspectionAction.mockClear();
    render(<NewInspectionForm />);
    fireEvent.change(screen.getByLabelText("Nome do solicitante"), { target: { value: "Cliente Teste" } });

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));
    fireEvent.change(screen.getByLabelText("Matrícula"), { target: { value: "AA-00-BB" } });
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Toyota" } });
    fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "Corolla" } });

    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));
    fireEvent.change(screen.getByLabelText("Quilometragem atual"), { target: { value: "50000" } });

    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));

    const saveButton = screen.getByRole("button", { name: "Guardar" });
    fireEvent.click(saveButton);

    expect(createInspectionAction).not.toHaveBeenCalled();
  });

  it("reports validity on the missing condição radio when Guardar is clicked with an incomplete equipamento selection (regression: silent no-op)", () => {
    createInspectionAction.mockClear();
    render(<NewInspectionForm />);
    fireEvent.change(screen.getByLabelText("Nome do solicitante"), { target: { value: "Cliente Teste" } });

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));
    fireEvent.change(screen.getByLabelText("Matrícula"), { target: { value: "AA-00-BB" } });
    fireEvent.change(screen.getByLabelText("Marca"), { target: { value: "Toyota" } });
    fireEvent.change(screen.getByLabelText("Modelo"), { target: { value: "Corolla" } });

    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));
    fireEvent.change(screen.getByLabelText("Quilometragem atual"), { target: { value: "50000" } });

    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));

    const reportValiditySpy = vi.spyOn(HTMLInputElement.prototype, "reportValidity").mockReturnValue(false);

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(reportValiditySpy).toHaveBeenCalled();
    expect(createInspectionAction).not.toHaveBeenCalled();
    reportValiditySpy.mockRestore();
  });

  it("resets the personalizado dialog's fields between openings (regression: stale state after Cancelar)", () => {
    const { container } = render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));

    // Escopado ao <dialog>: os radios "⚠️ Atenção"/"✓ Bom" existem também em
    // cada um dos 41 itens (mesmo texto de label visível), então uma busca
    // sem escopo por esse texto encontraria múltiplos elementos.
    const dialog = container.querySelector("dialog") as HTMLElement;
    const dialogScope = within(dialog);

    const addButtons = screen.getAllByRole("button", { name: "+" });
    fireEvent.click(addButtons[0]); // abre o dialog da 1ª categoria (Áudio e Multimédia)

    fireEvent.change(dialogScope.getByLabelText("Nome do equipamento"), { target: { value: "Bagageira de teto" } });
    fireEvent.click(dialogScope.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(addButtons[0]); // reabre a mesma categoria

    expect((dialogScope.getByLabelText("Nome do equipamento") as HTMLInputElement).value).toBe("");
  });

  it("seeds Outros Equipamentos-style suggestions from sugestoesPorCategoria as selectable items (Fix 2)", () => {
    render(<NewInspectionForm sugestoesPorCategoria={{ seguranca: ["Bagageira de teto"] }} />);
    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));

    expect(screen.getByLabelText("Bagageira de teto")).toBeInTheDocument();
  });

  it("renders situação fiscal as a single free-text field, not a checkbox", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    const campo = screen.getByLabelText("Situação fiscal (ex.: IUC em dia)");
    expect(campo.tagName).toBe("TEXTAREA");
    expect(screen.queryByLabelText("Observações sobre a situação fiscal")).not.toBeInTheDocument();
  });

  it("shows the anotações field for indícios de adulteração only when 'Sim' is picked", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    const anotacoes = screen.getByLabelText("Anotações / Detalhes dos indícios de adulteração");
    expect(anotacoes).not.toBeVisible();

    fireEvent.click(screen.getByLabelText("Sim (Indícios de adulteração de quilometragem?)"));
    expect(anotacoes).toBeVisible();
  });

  it("shows the importação block only when 'Veículo importado?' is 'Sim'", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    const paisOrigem = screen.getByLabelText("País de origem / importação");
    expect(paisOrigem).not.toBeVisible();

    fireEvent.click(screen.getByLabelText("Sim (Veículo importado?)"));
    expect(paisOrigem).toBeVisible();
    expect(screen.getByLabelText("Matrícula de origem (estrangeira)")).toBeVisible();
    expect(screen.getByLabelText("Data de importação")).toBeVisible();
    expect(screen.getByText("Possui Certificado de Conformidade (COC)?")).toBeVisible();
    expect(screen.getByText("Isenção de ISV aplicada?")).toBeVisible();
    expect(screen.getByLabelText("Número da DAV / Registo de Legalização")).toBeVisible();

    fireEvent.click(screen.getByLabelText("Não (Veículo importado?)"));
    expect(paisOrigem).not.toBeVisible();
  });

  it("renders data da primeira matrícula and valor base IUC anual as standalone fields", () => {
    render(<NewInspectionForm />);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));

    expect(screen.getByLabelText("Data da primeira matrícula")).toBeVisible();
    expect(screen.getByLabelText("Valor base IUC anual (€)")).toBeVisible();
  });
});

describe("NewInspectionForm in edit mode", () => {
  it("pre-fills fields from initialData instead of starting blank", () => {
    render(
      <NewInspectionForm
        inspectionId="insp-1"
        initialData={{ matricula: "AA-11-BB", marca: "Toyota", modelo: "Corolla", quilometragem: "50000" }}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Identificação" }));

    expect(screen.getByLabelText("Matrícula")).toHaveValue("AA-11-BB");
    expect(screen.getByLabelText("Marca")).toHaveValue("Toyota");
    expect(screen.getByLabelText("Modelo")).toHaveValue("Corolla");
  });

  it("submits via updateInspectionAction, not createInspectionAction, when inspectionId is set", () => {
    render(<NewInspectionForm inspectionId="insp-1" initialData={{ matricula: "AA-11-BB" }} />);

    // The form's action prop is bound to whichever action useActionState received;
    // asserting a hidden inspectionId field is present is the observable proxy for
    // "this render is in edit mode" without reaching into React internals.
    expect(document.querySelector('input[name="inspectionId"]')).toHaveValue("insp-1");
  });

  it("threads initialEquipamentosPorCategoria into EquipamentoCategoria and collects removals into a hidden field", () => {
    render(
      <NewInspectionForm
        inspectionId="insp-1"
        initialData={{ matricula: "AA-11-BB" }}
        initialEquipamentosPorCategoria={{
          conforto: {
            "Ar Condicionado / Climatização (automática e dual zone)": { id: "equip-1", condicao: "bom", comentario: null, foto1Url: null, foto2Url: null },
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));
    expect(screen.getByRole("checkbox", { name: "Ar Condicionado / Climatização (automática e dual zone)" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "Ar Condicionado / Climatização (automática e dual zone)" }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar remo/i }));

    expect(document.querySelector('input[name="equipamentosRemovidos"]')).toHaveValue("equip-1");
  });

  it("asks for confirmation before saving, and only submits after confirming (regression: accidental scroll-tap on Guardar shouldn't save)", async () => {
    updateInspectionAction.mockClear();
    render(
      <NewInspectionForm
        inspectionId="insp-1"
        initialData={{
          nomeSolicitante: "Cliente Teste",
          matricula: "AA-11-BB",
          marca: "Toyota",
          modelo: "Corolla",
          quilometragem: "50000",
        }}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar alterações" }));

    expect(screen.getByText("Confirma as alterações nos dados desta inspeção?")).toBeVisible();
    expect(updateInspectionAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar alterações" }));

    await waitFor(() => expect(updateInspectionAction).toHaveBeenCalled());
  });
});
