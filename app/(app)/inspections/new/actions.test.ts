import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const clientDataQuery = {
  select: vi.fn(() => clientDataQuery),
  eq: vi.fn(() => clientDataQuery),
  ilike: vi.fn(() => clientDataQuery),
  order: vi.fn(() => clientDataQuery),
  limit: vi.fn(),
};
const from = vi.fn((_table: string) => clientDataQuery);

const storageUpload = vi.fn(async () => ({ error: null }));
const storageGetPublicUrl = vi.fn(() => ({ data: { publicUrl: "https://example.test/foto.jpg" } }));
const equipamentoInspecaoQuery = {
  select: vi.fn(() => equipamentoInspecaoQuery),
  eq: vi.fn(() => equipamentoInspecaoQuery),
  order: vi.fn(async () => ({
    data: [{ id: "equip-id-0", ordem: 0 }],
    error: null,
  })),
};
const equipamentoFotosInsert = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: (table: string) => {
      if (table === "equipamento_inspecao") return equipamentoInspecaoQuery;
      if (table === "equipamento_fotos") return { insert: equipamentoFotosInsert };
      return from(table);
    },
    storage: { from: () => ({ upload: storageUpload, getPublicUrl: storageGetPublicUrl }) },
  }),
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
  storageUpload.mockClear();
  storageGetPublicUrl.mockClear();
  equipamentoInspecaoQuery.select.mockClear();
  equipamentoInspecaoQuery.eq.mockClear();
  equipamentoInspecaoQuery.order.mockClear();
  equipamentoFotosInsert.mockClear();
});

describe("createInspectionAction", () => {
  it("returns a validation error (with the failing field) without calling the RPC when required fields are missing", async () => {
    const { createInspectionAction } = await import("./actions");
    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    // matricula/marca/modelo/nomeSolicitante/quilometragem missing

    const result = await createInspectionAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
    if (result.status === "error") {
      expect(result.field).toBe("nomeSolicitante");
    }
  });

  it("returns a validation error (with field=quilometragem) when quilometragem is missing", async () => {
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
    if (result.status === "error") {
      expect(result.field).toBe("quilometragem");
    }
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
    formData.set("numeroProprietariosAnteriores", "3");
    formData.set("situacaoFiscalRegular", "IUC em dia");

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
        p_numero_proprietarios_anteriores: 3,
        p_situacao_fiscal_regular: "IUC em dia",
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

  it("builds p_equipamentos from equip__ FormData fields and uploads pending photos", async () => {
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

    formData.set("equip__seguranca--0__selecionado", "on");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");
    formData.set("equip__seguranca--0__condicao", "atencao");
    formData.set("equip__seguranca--0__comentario", "Luz acesa");
    formData.set("equip__seguranca--0__foto1", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/11111111-1111-1111-1111-111111111111"
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_inspection",
      expect.objectContaining({
        p_equipamentos: [
          {
            ordem: 0,
            categoria: "seguranca",
            nome_equipamento: "Sistema ABS/ESP",
            condicao: "atencao",
            comentario: "Luz acesa",
            personalizado: false,
          },
        ],
      })
    );
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(equipamentoFotosInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        equipamento_inspecao_id: "equip-id-0",
        inspection_id: "11111111-1111-1111-1111-111111111111",
        // Fix 6 (final-review): ordem within the item's [foto1, foto2] pair.
        ordem: 0,
      })
    );
  });

  it("Fix 6: writes ordem=1 for foto2 when both photos are present", async () => {
    rpc.mockResolvedValue({ data: "55555555-5555-5555-5555-555555555555", error: null });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");
    formData.set("equip__seguranca--0__selecionado", "on");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");
    formData.set("equip__seguranca--0__condicao", "atencao");
    formData.set("equip__seguranca--0__foto1", new File(["x"], "foto1.jpg", { type: "image/jpeg" }));
    formData.set("equip__seguranca--0__foto2", new File(["y"], "foto2.jpg", { type: "image/jpeg" }));

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/55555555-5555-5555-5555-555555555555"
    );

    expect(equipamentoFotosInsert).toHaveBeenCalledTimes(2);
    expect(equipamentoFotosInsert).toHaveBeenNthCalledWith(1, expect.objectContaining({ ordem: 0 }));
    expect(equipamentoFotosInsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ ordem: 1 }));
  });

  it("Fix 1: does not choke on a multi-MB photo (regression for the 1MB Server Action body limit)", async () => {
    rpc.mockResolvedValue({ data: "66666666-6666-6666-6666-666666666666", error: null });
    const { createInspectionAction } = await import("./actions");

    const bigBytes = new Uint8Array(3 * 1024 * 1024); // ~3MB, well past Next's 1MB default
    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");
    formData.set("equip__seguranca--0__selecionado", "on");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");
    formData.set("equip__seguranca--0__condicao", "atencao");
    formData.set("equip__seguranca--0__foto1", new File([bigBytes], "foto-grande.png", { type: "image/png" }));

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/66666666-6666-6666-6666-666666666666"
    );

    expect(storageUpload).toHaveBeenCalledTimes(1);
    const uploadedFile = (storageUpload.mock.calls[0] as unknown as [string, File])[1];
    expect(uploadedFile.size).toBe(bigBytes.length);
  });

  it("Fix 4: drops an equip__ row with an invalid condição before calling the RPC (guard bypassed)", async () => {
    rpc.mockResolvedValue({ data: "77777777-7777-7777-7777-777777777777", error: null });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");
    // selecionado, mas sem condição válida (ex.: validação nativa contornada)
    formData.set("equip__seguranca--0__selecionado", "on");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/77777777-7777-7777-7777-777777777777"
    );

    expect(rpc).toHaveBeenCalledWith("create_inspection", expect.objectContaining({ p_equipamentos: [] }));
  });

  it("ignores equip__ rows whose selecionado checkbox is unchecked", async () => {
    rpc.mockResolvedValue({ data: "22222222-2222-2222-2222-222222222222", error: null });
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");
    // sem __selecionado

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(/REDIRECT/);

    expect(rpc).toHaveBeenCalledWith("create_inspection", expect.objectContaining({ p_equipamentos: [] }));
  });

  it("still redirects when the photo upload throws (not just returns an error) — the inspection already exists and must not appear to fail", async () => {
    rpc.mockResolvedValue({ data: "33333333-3333-3333-3333-333333333333", error: null });
    storageUpload.mockRejectedValueOnce(new Error("network down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");
    formData.set("equip__seguranca--0__selecionado", "on");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");
    formData.set("equip__seguranca--0__condicao", "atencao");
    formData.set("equip__seguranca--0__foto1", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/33333333-3333-3333-3333-333333333333"
    );

    expect(consoleError).toHaveBeenCalled();
    expect(equipamentoFotosInsert).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("still redirects and logs when the equipamento_fotos insert returns an error", async () => {
    rpc.mockResolvedValue({ data: "44444444-4444-4444-4444-444444444444", error: null });
    equipamentoFotosInsert.mockResolvedValueOnce({ error: { message: "RLS denied" } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { createInspectionAction } = await import("./actions");

    const formData = new FormData();
    formData.set("tipoCliente", "particular");
    formData.set("objetivo", "compra");
    formData.set("nomeSolicitante", "Cliente Teste");
    formData.set("matricula", "AA-00-BB");
    formData.set("marca", "Toyota");
    formData.set("modelo", "Corolla");
    formData.set("quilometragem", "45000");
    formData.set("equip__seguranca--0__selecionado", "on");
    formData.set("equip__seguranca--0__categoria", "seguranca");
    formData.set("equip__seguranca--0__nome", "Sistema ABS/ESP");
    formData.set("equip__seguranca--0__personalizado", "0");
    formData.set("equip__seguranca--0__condicao", "atencao");
    formData.set("equip__seguranca--0__foto1", new File(["x"], "foto.jpg", { type: "image/jpeg" }));

    await expect(createInspectionAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/44444444-4444-4444-4444-444444444444"
    );

    expect(consoleError).toHaveBeenCalledWith("insert de equipamento_fotos falhou", { message: "RLS denied" });
    consoleError.mockRestore();
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
