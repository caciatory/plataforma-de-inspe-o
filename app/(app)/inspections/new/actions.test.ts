import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const clientDataQuery = {
  select: vi.fn(() => clientDataQuery),
  eq: vi.fn(() => clientDataQuery),
  ilike: vi.fn(() => clientDataQuery),
  order: vi.fn(() => clientDataQuery),
  limit: vi.fn(),
};
const from = vi.fn(() => clientDataQuery);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, from }),
}));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  rpc.mockReset();
  from.mockClear();
  clientDataQuery.select.mockClear();
  clientDataQuery.eq.mockClear();
  clientDataQuery.ilike.mockClear();
  clientDataQuery.order.mockClear();
  clientDataQuery.limit.mockReset();
  redirect.mockClear();
});

describe("createInspectionAction", () => {
  it("returns a validation error without calling the RPC when required fields are missing", async () => {
    const { createInspectionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    // matricula/marca/modelo/nomeSolicitante/quilometragem missing

    const result = await createInspectionAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a validation error when quilometragem is missing", async () => {
    const { createInspectionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    // quilometragem missing

    const result = await createInspectionAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls create_inspection with mapped params and redirects on success", async () => {
    rpc.mockResolvedValue({ data: "11111111-1111-1111-1111-111111111111", error: null });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/11111111-1111-1111-1111-111111111111"
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_inspection",
      expect.objectContaining({
        p_tipo_cliente: "particular",
        p_objetivo: "compra",
        p_matricula: "AA-00-BB",
        p_marca: "Toyota",
        p_modelo: "Corolla",
        p_nome_solicitante: "Cliente Teste",
        p_quilometragem: 45000,
      })
    );
  });

  it("returns an error when the RPC fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");

    const result = await createInspectionAction({ status: "idle" }, formData);
    expect(result).toEqual({
      status: "error",
      message: "Não foi possível guardar a inspeção. Tente novamente.",
    });
  });
});

describe("searchStandContactsAction", () => {
  it("returns [] for queries under 2 characters without touching the database", async () => {
    const { searchStandContactsAction } = await import("./actions");
    const result = await searchStandContactsAction("S");
    expect(result).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("queries client_data filtered by tipo=stand and the search term (RF-05)", async () => {
    clientDataQuery.limit.mockResolvedValue({
      data: [{ nome_solicitante: "Stand Central", contacto: "910000000", email: "s@c.pt" }],
      error: null,
    });
    const { searchStandContactsAction } = await import("./actions");

    const result = await searchStandContactsAction("Stand");

    expect(from).toHaveBeenCalledWith("client_data");
    expect(clientDataQuery.eq).toHaveBeenCalledWith("tipo", "stand");
    expect(clientDataQuery.ilike).toHaveBeenCalledWith("nome_solicitante", "%Stand%");
    expect(result).toEqual([
      { nome_solicitante: "Stand Central", contacto: "910000000", email: "s@c.pt" },
    ]);
  });

  it("returns [] when the query errors", async () => {
    clientDataQuery.limit.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { searchStandContactsAction } = await import("./actions");
    const result = await searchStandContactsAction("Stand");
    expect(result).toEqual([]);
  });
});
