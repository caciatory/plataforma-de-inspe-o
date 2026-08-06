import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TecnicosTable } from "./tecnicos-table";

const createTecnicoAction = vi.fn();
const toggleTecnicoBanAction = vi.fn();
vi.mock("./actions", () => ({
  createTecnicoAction: (...args: unknown[]) => createTecnicoAction(...args),
  toggleTecnicoBanAction: (...args: unknown[]) => toggleTecnicoBanAction(...args),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const rows = [
  { id: "tec-1", nome: "Técnico Ativo", email: "ativo@checkauto.pt", ativo: true },
  { id: "tec-2", nome: "Técnico Desativado", email: "des@checkauto.pt", ativo: false },
];

beforeEach(() => {
  createTecnicoAction.mockReset();
  toggleTecnicoBanAction.mockReset();
  refresh.mockClear();
});

describe("TecnicosTable", () => {
  it("shows Desativar for an active técnico and Reativar for an inactive one", () => {
    render(<TecnicosTable rows={rows} />);
    expect(screen.getAllByRole("button", { name: "Desativar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Reativar" })).toHaveLength(1);
  });

  it("closes the create dialog and refreshes on success", async () => {
    createTecnicoAction.mockResolvedValue({ status: "success" });
    render(<TecnicosTable rows={rows} />);

    fireEvent.click(screen.getByRole("button", { name: "Criar técnico" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Novo Técnico" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "novo@checkauto.pt" } });
    fireEvent.change(screen.getByLabelText("Senha temporária"), { target: { value: "senha1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows the error message when creation fails", async () => {
    createTecnicoAction.mockResolvedValue({ status: "error", message: "Já existe um utilizador com este email." });
    render(<TecnicosTable rows={rows} />);

    fireEvent.click(screen.getByRole("button", { name: "Criar técnico" }));
    // fireEvent.click on the submit button goes through native requestSubmit()/constraint
    // validation, which blocks submission on the empty required nome/email/senha fields
    // before the action ever runs (same jsdom caveat as admin-actions-panel.test.tsx).
    // Dispatch a raw submit event instead to exercise the server-error display path.
    const form = screen.getByLabelText("Nome").closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Já existe um utilizador com este email.")
    );
  });
});
