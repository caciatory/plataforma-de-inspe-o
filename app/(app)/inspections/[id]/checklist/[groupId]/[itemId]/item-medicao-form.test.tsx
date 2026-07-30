import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemMedicaoForm } from "./item-medicao-form";

const saveMeasurementAction = vi.fn();
vi.mock("./actions", () => ({
  saveMeasurementAction: (...args: unknown[]) => saveMeasurementAction(...args),
}));

vi.mock("./photo-manager", () => ({
  PhotoManager: () => <div data-testid="photo-manager" />,
}));

describe("ItemMedicaoForm", () => {
  it("calls onSuccess when the save action returns status success", async () => {
    saveMeasurementAction.mockResolvedValue({ status: "success" });
    const onSuccess = vi.fn();
    const { container } = render(
      <ItemMedicaoForm
        inspectionId="insp-1"
        itemTemplateId="item-1"
        qtdPontos={1}
        unidadeMedicao="µm"
        initialValores={[]}
        initialObservacao={null}
        initialPhotos={[]}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText("Ponto 1"), { target: { value: "120" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  });

  it("does not call onSuccess when the save action returns an error", async () => {
    saveMeasurementAction.mockResolvedValue({ status: "error", message: "Preencha todos os valores." });
    const onSuccess = vi.fn();
    const { container } = render(
      <ItemMedicaoForm
        inspectionId="insp-1"
        itemTemplateId="item-1"
        qtdPontos={1}
        unidadeMedicao="µm"
        initialValores={[]}
        initialObservacao={null}
        initialPhotos={[]}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText("Ponto 1"), { target: { value: "120" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Preencha todos os valores."));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not re-fire onSuccess when the parent re-renders with a new onSuccess identity after success", async () => {
    saveMeasurementAction.mockResolvedValue({ status: "success" });
    const onSuccessCalls: number[] = [];
    let renderCount = 0;

    function Wrapper() {
      renderCount++;
      return (
        <ItemMedicaoForm
          inspectionId="insp-1"
          itemTemplateId="item-1"
          qtdPontos={1}
          unidadeMedicao="µm"
          initialValores={[]}
          initialObservacao={null}
          initialPhotos={[]}
          onSuccess={() => onSuccessCalls.push(renderCount)}
        />
      );
    }

    const { container, rerender } = render(<Wrapper />);
    fireEvent.change(screen.getByLabelText("Ponto 1"), { target: { value: "120" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => expect(onSuccessCalls.length).toBe(1));

    // Simulates the parent (MedicaoCell) re-rendering — e.g. after the
    // router.refresh() onSuccess itself triggered — with a brand new onSuccess
    // closure each time, while state stays "success". This must not re-fire.
    rerender(<Wrapper />);
    rerender(<Wrapper />);

    expect(onSuccessCalls.length).toBe(1);
  });

  it("no longer renders a nextUrl hidden input", () => {
    const { container } = render(
      <ItemMedicaoForm
        inspectionId="insp-1"
        itemTemplateId="item-1"
        qtdPontos={1}
        unidadeMedicao={null}
        initialValores={[]}
        initialObservacao={null}
        initialPhotos={[]}
      />
    );
    expect(container.querySelector('input[name="nextUrl"]')).not.toBeInTheDocument();
  });
});
