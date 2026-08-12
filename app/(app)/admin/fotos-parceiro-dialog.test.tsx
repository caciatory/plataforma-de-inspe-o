import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FotosParceiroDialog } from "./fotos-parceiro-dialog";

const saveParceiroAction = vi.fn();
const attachCapaPhotoAction = vi.fn();
const deleteCapaPhotoAction = vi.fn();
vi.mock("./actions", () => ({
  saveParceiroAction: (...args: unknown[]) => saveParceiroAction(...args),
  attachCapaPhotoAction: (...args: unknown[]) => attachCapaPhotoAction(...args),
  deleteCapaPhotoAction: (...args: unknown[]) => deleteCapaPhotoAction(...args),
}));

const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload, getPublicUrl }) } }),
}));

beforeEach(() => {
  saveParceiroAction.mockReset();
  attachCapaPhotoAction.mockReset();
  deleteCapaPhotoAction.mockReset();
  upload.mockReset();
  getPublicUrl.mockReset();
});

describe("FotosParceiroDialog", () => {
  it("abre o diálogo ao clicar no botão gatilho", () => {
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: null, parceiro_logo_url: null, parceiro_telefone: null }}
        initialFotos={[]}
      />
    );

    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));

    expect(dialog.open).toBe(true);
  });

  it("pré-preenche os campos do parceiro quando já existem", () => {
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: "Stand Central", parceiro_logo_url: null, parceiro_telefone: "351912345678" }}
        initialFotos={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));

    expect(screen.getByLabelText("Nome do parceiro")).toHaveValue("Stand Central");
    expect(screen.getByLabelText("Telefone (WhatsApp)")).toHaveValue("351912345678");
  });

  it("envia os campos do parceiro via saveParceiroAction ao guardar", async () => {
    saveParceiroAction.mockResolvedValue({});
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: null, parceiro_logo_url: null, parceiro_telefone: null }}
        initialFotos={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));
    fireEvent.change(screen.getByLabelText("Nome do parceiro"), { target: { value: "Stand Novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar parceiro" }));

    expect(saveParceiroAction).toHaveBeenCalledWith("insp-1", expect.any(FormData));
  });

  it("lista as fotos de capa já existentes com botão de excluir cada uma", () => {
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: null, parceiro_logo_url: null, parceiro_telefone: null }}
        initialFotos={[{ id: "p1", url: "https://example.com/a.jpg" }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));

    expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(1);
  });

  it("mostra pré-visualização do logo já existente ao abrir o diálogo", () => {
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{
          parceiro_nome: "Stand Central",
          parceiro_logo_url: "https://example.com/logo-atual.png",
          parceiro_telefone: null,
        }}
        initialFotos={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));

    expect(screen.getByAltText("Logo do parceiro")).toHaveAttribute("src", "https://example.com/logo-atual.png");
  });

  it("faz upload do logo do parceiro e atualiza a pré-visualização", async () => {
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/logo-novo.png" } });
    render(
      <FotosParceiroDialog
        inspectionId="insp-1"
        initialParceiro={{ parceiro_nome: null, parceiro_logo_url: null, parceiro_telefone: null }}
        initialFotos={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Fotos & Parceiro" }));

    const file = new File(["logo"], "logo.png", { type: "image/png" });
    const input = document.getElementById("parceiro-logo-input") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByAltText("Logo do parceiro")).toHaveAttribute(
      "src",
      "https://example.com/logo-novo.png"
    );
    expect(attachCapaPhotoAction).not.toHaveBeenCalled();
  });
});
