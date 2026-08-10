import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const rpc = vi.fn();
const insertAudit = vi.fn(() => ({ error: null }));
const storageUpload = vi.fn(() => Promise.resolve({ error: null }));
const storageGetPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://example.com/foto.jpg" } }));
const equipRowsQuery: any = {
  select: vi.fn(() => equipRowsQuery),
  eq: vi.fn(() => equipRowsQuery),
  order: vi.fn(() => Promise.resolve({ data: [] })),
};
const from = vi.fn((table: string) => {
  if (table === "equipamento_inspecao") return equipRowsQuery;
  if (table === "equipamento_fotos") return { insert: insertAudit };
  if (table === "audit_log_entries") return { insert: insertAudit };
  throw new Error(`unexpected table ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from,
    storage: { from: () => ({ upload: storageUpload, getPublicUrl: storageGetPublicUrl }) },
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));

// Same pattern as app/(app)/inspections/new/actions.test.ts: next/navigation's
// redirect() throws in the real runtime, so success is asserted via
// .rejects.toThrow(), never via a returned status.
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    inspectionId: "insp-1",
    tipoCliente: "particular",
    objetivo: "compra",
    nomeSolicitante: "Cliente Teste",
    matricula: "AA-11-BB",
    marca: "Toyota",
    modelo: "Corolla",
    quilometragem: "10000",
    equipamentosRemovidos: "",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  getCurrentUser.mockReset();
  rpc.mockReset();
  insertAudit.mockClear();
  storageUpload.mockClear();
  redirect.mockClear();
  equipRowsQuery.order.mockResolvedValue({ data: [] });
});

describe("updateInspectionAction", () => {
  it("returns a validation error without calling the RPC when required fields are missing", async () => {
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    const { updateInspectionAction } = await import("./actions");

    const result = await updateInspectionAction({ status: "idle" }, buildFormData({ matricula: "" }));

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls update_inspection with the parsed fields and redirects to the summary page on success", async () => {
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    rpc.mockResolvedValue({ error: null });
    const { updateInspectionAction } = await import("./actions");

    await expect(updateInspectionAction({ status: "idle" }, buildFormData())).rejects.toThrow(
      "REDIRECT:/inspections/insp-1"
    );
    expect(rpc).toHaveBeenCalledWith(
      "update_inspection",
      expect.objectContaining({ p_inspection_id: "insp-1", p_matricula: "AA-11-BB", p_quilometragem: 10000 })
    );
  });

  it("returns an error when the RPC fails, without redirecting", async () => {
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    rpc.mockResolvedValue({ error: { message: "db error" } });
    const { updateInspectionAction } = await import("./actions");

    const result = await updateInspectionAction({ status: "idle" }, buildFormData());

    expect(result.status).toBe("error");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("logs an audit entry when the caller is admin, not when técnico", async () => {
    rpc.mockResolvedValue({ error: null });
    const { updateInspectionAction } = await import("./actions");

    getCurrentUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    await expect(updateInspectionAction({ status: "idle" }, buildFormData())).rejects.toThrow("REDIRECT:");
    expect(insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ inspection_id: "insp-1", admin_id: "admin-1" })
    );

    insertAudit.mockClear();
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    await expect(updateInspectionAction({ status: "idle" }, buildFormData())).rejects.toThrow("REDIRECT:");
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("passes equipamentosRemovidos through to the RPC as an array", async () => {
    getCurrentUser.mockResolvedValue({ id: "tec-1", role: "tecnico" });
    rpc.mockResolvedValue({ error: null });
    const { updateInspectionAction } = await import("./actions");

    await expect(
      updateInspectionAction({ status: "idle" }, buildFormData({ equipamentosRemovidos: "equip-1,equip-2" }))
    ).rejects.toThrow("REDIRECT:");

    expect(rpc).toHaveBeenCalledWith(
      "update_inspection",
      expect.objectContaining({ p_equipamentos_removidos: ["equip-1", "equip-2"] })
    );
  });
});
