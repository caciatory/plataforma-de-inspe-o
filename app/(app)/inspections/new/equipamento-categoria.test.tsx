import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EquipamentoCategoria } from "./equipamento-categoria";

function renderCategoria(itensPersonalizados: string[] = []) {
  return render(
    <form>
      <EquipamentoCategoria
        categoriaId="seguranca"
        label="Segurança"
        itensPreDefinidos={["Airbags (frontais, laterais e de cortina)", "Sistema ABS/ESP"]}
        itensPersonalizados={itensPersonalizados}
        onAddPersonalizado={() => {}}
      />
    </form>
  );
}

describe("EquipamentoCategoria", () => {
  it("renders the category as a collapsible section with its predefined items", () => {
    renderCategoria();
    expect(screen.getByText("Segurança")).toBeInTheDocument();
    expect(screen.getByLabelText("Airbags (frontais, laterais e de cortina)")).toBeInTheDocument();
    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeInTheDocument();
  });

  it("hides the condição fields until the item is checked", () => {
    renderCategoria();
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    const condicaoBom = screen.getByLabelText("✓ Bom (Sistema ABS/ESP)") as HTMLInputElement;

    expect(condicaoBom.closest("[hidden]")).not.toBeNull();
    fireEvent.click(checkbox);
    expect(condicaoBom.closest("[hidden]")).toBeNull();
  });

  it("keeps condição and comentário filled after unchecking and rechecking", () => {
    renderCategoria();
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));
    fireEvent.change(screen.getByLabelText("Comentário (Sistema ABS/ESP)"), {
      target: { value: "Luz acesa no painel" },
    });

    fireEvent.click(checkbox); // desmarca
    fireEvent.click(checkbox); // remarca

    expect((screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Comentário (Sistema ABS/ESP)") as HTMLTextAreaElement).value).toBe(
      "Luz acesa no painel"
    );
  });

  it("shows comentário only when condição is Atenção", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    const comentarioField = screen.getByLabelText("Comentário (Sistema ABS/ESP)");

    expect(comentarioField.closest("[hidden]")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));
    expect(comentarioField.closest("[hidden]")).toBeNull();
  });

  it("renders personalizado items passed in, alongside predefined ones", () => {
    renderCategoria(["Bagageira de teto"]);
    expect(screen.getByLabelText("Bagageira de teto")).toBeInTheDocument();
  });

  it("marks the condição radios required only while the item is selecionado", () => {
    // Direct check on the DOM property itself (not form-submission behavior,
    // which jsdom doesn't fully implement — see new-inspection-form.test.tsx's
    // "blocks advancing past Equipamentos..." test for that discussion). This
    // is what actually guarantees the required-on-select contract Task 7's
    // server-side parser and the form-level test both rely on.
    renderCategoria();
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    const condicaoBom = screen.getByLabelText("✓ Bom (Sistema ABS/ESP)") as HTMLInputElement;
    const condicaoAtencao = screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)") as HTMLInputElement;

    expect(condicaoBom.required).toBe(false);
    expect(condicaoAtencao.required).toBe(false);

    fireEvent.click(checkbox);
    expect(condicaoBom.required).toBe(true);
    expect(condicaoAtencao.required).toBe(true);

    fireEvent.click(checkbox);
    expect(condicaoBom.required).toBe(false);
    expect(condicaoAtencao.required).toBe(false);
  });
});
