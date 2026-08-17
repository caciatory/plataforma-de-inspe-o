import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EquipamentoCategoria } from "./equipamento-categoria";

const compressImage = vi.fn();
vi.mock("@/lib/upload/compress-image", () => ({
  compressImage: (...args: unknown[]) => compressImage(...args),
}));

// jsdom não implementa DataTransfer (é uma API real de navegador, usada aqui
// pra substituir o arquivo de um <input type="file"> depois de comprimir) --
// stub mínimo só com o que handleFotoChange usa.
class FakeDataTransfer {
  private _files: File[] = [];
  items = {
    add: (file: File) => {
      this._files.push(file);
    },
  };
  get files() {
    return this._files as unknown as FileList;
  }
}

beforeEach(() => {
  compressImage.mockReset();
  vi.stubGlobal("DataTransfer", FakeDataTransfer);
});

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
  it("starts the category accordion closed", () => {
    const { container } = renderCategoria();
    const details = container.querySelector("details");
    expect(details?.open).toBe(false);
  });

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

  it("shows up to 2 file inputs only when condição is Atenção", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));

    const fileInputs = screen.getAllByLabelText(/^Foto \d \(Sistema ABS\/ESP\)$/);
    expect(fileInputs).toHaveLength(2);
    fileInputs.forEach((input) => expect(input).toHaveAttribute("type", "file"));
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

  it("compacts the item on blur after choosing condição Bom", () => {
    renderCategoria();
    fireEvent.click(screen.getByText("Segurança")); // abre o acordeão da categoria
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));

    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.blur(item, { relatedTarget: null });

    expect(screen.getByLabelText("Sistema ABS/ESP")).not.toBeVisible();
    expect(screen.getByText("Sistema ABS/ESP — ✓ Bom")).toBeVisible();
  });

  it("compacts the item on blur after choosing condição Atenção", () => {
    renderCategoria();
    fireEvent.click(screen.getByText("Segurança")); // abre o acordeão da categoria
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));
    fireEvent.change(screen.getByLabelText("Comentário (Sistema ABS/ESP)"), {
      target: { value: "Ruído no arranque" },
    });

    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.blur(item, { relatedTarget: null });

    expect(screen.getByText("Sistema ABS/ESP — ⚠️ Atenção")).toBeVisible();
  });

  it("does not compact when focus moves between fields inside the same item", () => {
    renderCategoria();
    fireEvent.click(screen.getByText("Segurança")); // abre o acordeão da categoria
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));

    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    const condicaoBom = screen.getByLabelText("✓ Bom (Sistema ABS/ESP)");
    fireEvent.blur(item, { relatedTarget: condicaoBom });

    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeVisible();
  });

  it("does not compact a selected item before a condição is chosen", () => {
    renderCategoria();
    fireEvent.click(screen.getByText("Segurança")); // abre o acordeão da categoria
    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.blur(item, { relatedTarget: null });

    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeVisible();
  });

  it("reopens a compacted item when its summary is clicked", () => {
    renderCategoria();
    fireEvent.click(screen.getByText("Segurança")); // abre o acordeão da categoria
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));
    const item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.blur(item, { relatedTarget: null });

    fireEvent.click(screen.getByText("Sistema ABS/ESP — ✓ Bom"));

    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeVisible();
    expect(screen.queryByText("Sistema ABS/ESP — ✓ Bom")).not.toBeInTheDocument();
  });

  it("shows no badge when nothing is verified", () => {
    renderCategoria();
    expect(screen.queryByText(/verificados/)).not.toBeInTheDocument();
  });

  it("shows a verificados/total badge that updates as items get a condição", () => {
    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));
    expect(screen.getByText("✓ 1/2 verificados")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Airbags (frontais, laterais e de cortina)"));
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Airbags (frontais, laterais e de cortina))"));
    expect(screen.getByText("✓ 2/2 verificados")).toBeInTheDocument();
  });

  it("removes an item from the badge count when it's unchecked", () => {
    renderCategoria();
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));
    expect(screen.getByText("✓ 1/2 verificados")).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(screen.queryByText(/verificados/)).not.toBeInTheDocument();
  });

  it("counts personalizado items in the badge total", () => {
    renderCategoria(["Bagageira de teto"]);
    fireEvent.click(screen.getByLabelText("Bagageira de teto"));
    fireEvent.click(screen.getByLabelText("✓ Bom (Bagageira de teto)"));
    expect(screen.getByText("✓ 1/3 verificados")).toBeInTheDocument();
  });

  it("Fix (final-review): does not show a compacted resumo for an item that was unchecked after being compacted", () => {
    renderCategoria();
    fireEvent.click(screen.getByText("Segurança")); // abre o acordeão da categoria
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));

    let item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.blur(item, { relatedTarget: null }); // compacta

    fireEvent.click(screen.getByText("Sistema ABS/ESP — ✓ Bom")); // reabre pelo resumo
    fireEvent.click(checkbox); // desmarca (condição interna continua "bom")

    item = screen.getByLabelText("Sistema ABS/ESP").closest("li") as HTMLLIElement;
    fireEvent.blur(item, { relatedTarget: null });

    expect(screen.queryByText("Sistema ABS/ESP — ✓ Bom")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Sistema ABS/ESP")).toBeVisible();
  });

  it("re-counts the item in the badge after unchecking and rechecking with a condição already set", () => {
    renderCategoria();
    const checkbox = screen.getByLabelText("Sistema ABS/ESP") as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByLabelText("✓ Bom (Sistema ABS/ESP)"));
    expect(screen.getByText("✓ 1/2 verificados")).toBeInTheDocument();

    fireEvent.click(checkbox); // desmarca
    expect(screen.queryByText(/verificados/)).not.toBeInTheDocument();

    fireEvent.click(checkbox); // remarca
    expect(screen.getByText("✓ 1/2 verificados")).toBeInTheDocument();
  });
});

describe("EquipamentoCategoria in edit mode", () => {
  const initial = {
    "Ar condicionado": { id: "equip-1", condicao: "bom" as const, comentario: null, foto1Url: null, foto2Url: null },
  };

  it("pre-checks and pre-fills condição for an item present in initialSelecionados", () => {
    render(
      <EquipamentoCategoria
        categoriaId="conforto"
        label="Conforto"
        itensPreDefinidos={["Ar condicionado"]}
        itensPersonalizados={[]}
        onAddPersonalizado={() => {}}
        initialSelecionados={initial}
      />
    );

    expect(screen.getByRole("checkbox", { name: "Ar condicionado" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Bom \(Ar condicionado\)/ })).toBeChecked();
  });

  it("asks for confirmation before unchecking a previously-selected item, and only calls onRemovido after confirming", () => {
    const onRemovido = vi.fn();
    render(
      <EquipamentoCategoria
        categoriaId="conforto"
        label="Conforto"
        itensPreDefinidos={["Ar condicionado"]}
        itensPersonalizados={[]}
        onAddPersonalizado={() => {}}
        initialSelecionados={initial}
        onRemovido={onRemovido}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Ar condicionado" }));

    // Still checked — unchecking is pending confirmation, not applied yet.
    expect(screen.getByRole("checkbox", { name: "Ar condicionado" })).toBeChecked();
    expect(onRemovido).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /confirmar remo/i }));

    expect(screen.getByRole("checkbox", { name: "Ar condicionado" })).not.toBeChecked();
    expect(onRemovido).toHaveBeenCalledWith("equip-1");
  });

  it("does not show a confirmation dialog for a freshly-checked item with no initial data", () => {
    render(
      <EquipamentoCategoria
        categoriaId="conforto"
        label="Conforto"
        itensPreDefinidos={["Ar condicionado"]}
        itensPersonalizados={[]}
        onAddPersonalizado={() => {}}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: "Ar condicionado" });
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /confirmar remo/i })).not.toBeInTheDocument();
  });

  it("comprime a foto escolhida e substitui o arquivo do input antes do envio do form", async () => {
    const originalFile = new File(["conteudo-grande"], "foto.png", { type: "image/png" });
    const compressedFile = new File(["conteudo-pequeno"], "foto.jpg", { type: "image/jpeg" });
    compressImage.mockResolvedValue(compressedFile);

    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));

    const input = screen.getByLabelText("Foto 1 (Sistema ABS/ESP)") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [originalFile] } });

    expect(compressImage).toHaveBeenCalledWith(originalFile);
    await waitFor(() => expect(input.files?.[0]).toBe(compressedFile));
  });

  it("não mexe no input quando a compressão devolve o mesmo arquivo (não era imagem, ou falhou)", async () => {
    const originalFile = new File(["conteudo"], "foto.jpg", { type: "image/jpeg" });
    compressImage.mockResolvedValue(originalFile);

    renderCategoria();
    fireEvent.click(screen.getByLabelText("Sistema ABS/ESP"));
    fireEvent.click(screen.getByLabelText("⚠️ Atenção (Sistema ABS/ESP)"));

    const input = screen.getByLabelText("Foto 1 (Sistema ABS/ESP)") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [originalFile] } });

    await waitFor(() => expect(compressImage).toHaveBeenCalled());
    expect(input.files?.[0]).toBe(originalFile);
  });
});
