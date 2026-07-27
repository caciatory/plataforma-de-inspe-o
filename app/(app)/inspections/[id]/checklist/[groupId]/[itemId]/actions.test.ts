import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertQuery = { select: vi.fn(() => upsertQuery), single: vi.fn() };
const upsert = vi.fn(() => upsertQuery);

const insertQuery = { select: vi.fn(() => insertQuery), single: vi.fn() };
const insert = vi.fn(() => insertQuery);

const deleteQuery = { eq: vi.fn() };
const del = vi.fn(() => deleteQuery);

const templateQuery: { eq: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn> } = {
  eq: vi.fn(() => templateQuery),
  single: vi.fn(),
  in: vi.fn(),
};
const templateSelect = vi.fn(() => templateQuery);

const opcoesQuery: { eq: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn>; in: ReturnType<typeof vi.fn> } = {
  eq: vi.fn(() => opcoesQuery),
  maybeSingle: vi.fn(),
  in: vi.fn(),
};
const opcoesSelect = vi.fn(() => opcoesQuery);

const rpc = vi.fn();

const from = vi.fn((table: string) => {
  if (table === "checklist_item_templates") return { select: templateSelect };
  if (table === "opcoes") return { select: opcoesSelect };
  return { upsert, insert, delete: del };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from, rpc }),
}));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  from.mockClear();
  upsert.mockClear();
  upsertQuery.select.mockClear();
  upsertQuery.single.mockReset();
  insert.mockClear();
  insertQuery.select.mockClear();
  insertQuery.single.mockReset();
  del.mockClear();
  deleteQuery.eq.mockReset();
  templateSelect.mockClear();
  templateQuery.eq.mockClear();
  templateQuery.single.mockReset();
  templateQuery.in.mockReset();
  opcoesSelect.mockClear();
  opcoesQuery.eq.mockClear();
  opcoesQuery.maybeSingle.mockReset();
  opcoesQuery.in.mockReset();
  rpc.mockReset();
  redirect.mockClear();
});

describe("saveEscolhaAction", () => {
  it("returns a validation error without writing when opcao_id is missing", async () => {
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns an error without writing when the opcao does not belong to the item's conjunto", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("opcao_id", "opt-de-outro-conjunto");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the response and redirects to nextUrl on success", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: { id: "opt-medio" }, error: null });
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");
    formData.set("opcao_id", "opt-medio");
    formData.set("observacao", "Desgaste leve");

    await expect(saveEscolhaAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1/item-2"
    );

    expect(upsert).toHaveBeenCalledWith(
      { inspection_id: "insp-1", item_template_id: "item-1", opcao_id: "opt-medio", observacao: "Desgaste leve" },
      { onConflict: "inspection_id,item_template_id" }
    );
  });

  it("returns a friendly message when the DB rejects a response that exige foto without a photo (check_violation)", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: { id: "opt-ruim" }, error: null });
    upsertQuery.single.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("opcao_id", "opt-ruim");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});

describe("attachPhotoAction", () => {
  it("upserts the response then inserts the photo, returning its id", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    insertQuery.single.mockResolvedValue({ data: { id: "photo-1" }, error: null });
    const { attachPhotoAction } = await import("./actions");

    const result = await attachPhotoAction("insp-1", "item-1", "https://example.com/foto.jpg");

    expect(result).toEqual({ photoId: "photo-1" });
    expect(insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      item_response_id: "resp-1",
      contexto: "item",
      url: "https://example.com/foto.jpg",
    });
  });

  it("returns an error when the response upsert fails", async () => {
    upsertQuery.single.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { attachPhotoAction } = await import("./actions");

    const result = await attachPhotoAction("insp-1", "item-1", "https://example.com/foto.jpg");

    expect(result.error).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("deletePhotoAction", () => {
  it("deletes the photo row", async () => {
    deleteQuery.eq.mockResolvedValue({ error: null });
    const { deletePhotoAction } = await import("./actions");

    const result = await deletePhotoAction("photo-1");

    expect(result).toEqual({});
    expect(deleteQuery.eq).toHaveBeenCalledWith("id", "photo-1");
  });

  it("returns an error when the delete fails", async () => {
    deleteQuery.eq.mockResolvedValue({ error: { message: "db error" } });
    const { deletePhotoAction } = await import("./actions");

    const result = await deletePhotoAction("photo-1");

    expect(result.error).toBeTruthy();
  });
});

describe("saveMeasurementAction", () => {
  it("returns a validation error without calling the RPC when a value is not a number", async () => {
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.append("valor", "100");
    formData.append("valor", "abc");

    const result = await saveMeasurementAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with numeric values and redirects on success", async () => {
    rpc.mockResolvedValue({ data: [{ item_response_id: "resp-1", resultado: "ok" }], error: null });
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");
    formData.append("valor", "100");
    formData.append("valor", "110");
    formData.append("valor", "120");
    formData.set("observacao", "Desgaste leve");

    await expect(saveMeasurementAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1/item-2"
    );

    expect(rpc).toHaveBeenCalledWith("save_medicao", {
      p_inspection_id: "insp-1",
      p_item_template_id: "item-1",
      p_valores: [100, 110, 120],
      p_observacao: "Desgaste leve",
    });
  });

  it("returns a friendly message when the DB rejects a critical measurement without a photo", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.append("valor", "300");
    formData.append("valor", "300");
    formData.append("valor", "300");

    const result = await saveMeasurementAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});

describe("applyOpcoesBatchAction", () => {
  it("returns an error without calling the RPC when an item has no opcao_id", async () => {
    const { applyOpcoesBatchAction } = await import("./actions");

    const result = await applyOpcoesBatchAction("insp-1", [
      { itemTemplateId: "item-1", opcaoId: "opt-otimo", observacao: null },
      { itemTemplateId: "item-2", opcaoId: "", observacao: null },
    ]);

    expect(result.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns an error without calling the RPC when an opcao doesn't belong to its item's conjunto", async () => {
    templateQuery.in.mockResolvedValue({
      data: [
        { id: "item-1", conjunto_opcao_id: "conj-1" },
        { id: "item-2", conjunto_opcao_id: "conj-1" },
      ],
      error: null,
    });
    opcoesQuery.in.mockResolvedValue({
      data: [
        { id: "opt-otimo", conjunto_id: "conj-1" },
        { id: "opt-de-outro-conjunto", conjunto_id: "conj-2" },
      ],
      error: null,
    });
    const { applyOpcoesBatchAction } = await import("./actions");

    const result = await applyOpcoesBatchAction("insp-1", [
      { itemTemplateId: "item-1", opcaoId: "opt-otimo", observacao: null },
      { itemTemplateId: "item-2", opcaoId: "opt-de-outro-conjunto", observacao: null },
    ]);

    expect(result.error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with the mapped batch payload on success", async () => {
    templateQuery.in.mockResolvedValue({
      data: [
        { id: "item-1", conjunto_opcao_id: "conj-1" },
        { id: "item-2", conjunto_opcao_id: "conj-1" },
      ],
      error: null,
    });
    opcoesQuery.in.mockResolvedValue({
      data: [
        { id: "opt-otimo", conjunto_id: "conj-1" },
        { id: "opt-medio", conjunto_id: "conj-1" },
      ],
      error: null,
    });
    rpc.mockResolvedValue({ data: null, error: null });
    const { applyOpcoesBatchAction } = await import("./actions");

    const result = await applyOpcoesBatchAction("insp-1", [
      { itemTemplateId: "item-1", opcaoId: "opt-otimo", observacao: "Sem avarias" },
      { itemTemplateId: "item-2", opcaoId: "opt-medio", observacao: null },
    ]);

    expect(result).toEqual({});
    expect(rpc).toHaveBeenCalledWith("apply_opcoes_batch", {
      p_inspection_id: "insp-1",
      p_items: [
        { item_template_id: "item-1", opcao_id: "opt-otimo", observacao: "Sem avarias" },
        { item_template_id: "item-2", opcao_id: "opt-medio", observacao: null },
      ],
    });
  });

  it("returns a friendly message when the DB rejects an item that exige foto without a photo", async () => {
    templateQuery.in.mockResolvedValue({ data: [{ id: "item-1", conjunto_opcao_id: "conj-1" }], error: null });
    opcoesQuery.in.mockResolvedValue({ data: [{ id: "opt-ruim", conjunto_id: "conj-1" }], error: null });
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { applyOpcoesBatchAction } = await import("./actions");

    const result = await applyOpcoesBatchAction("insp-1", [
      { itemTemplateId: "item-1", opcaoId: "opt-ruim", observacao: null },
    ]);

    expect(result.error).toMatch(/foto/i);
  });
});

describe("saveTextoAction", () => {
  it("returns a validation error without writing when resposta_texto is empty", async () => {
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");

    const result = await saveTextoAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts resposta_texto and redirects to nextUrl on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1?sub=motor");
    formData.set("resposta_texto", "Chassi OK, sem avarias visíveis");
    formData.set("observacao", "Verificado às 10h");

    await expect(saveTextoAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1?sub=motor"
    );

    expect(upsert).toHaveBeenCalledWith(
      {
        inspection_id: "insp-1",
        item_template_id: "item-1",
        resposta_texto: "Chassi OK, sem avarias visíveis",
        observacao: "Verificado às 10h",
      },
      { onConflict: "inspection_id,item_template_id" }
    );
  });

  it("returns a friendly message when the DB rejects the write (check_violation)", async () => {
    upsertQuery.single.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("resposta_texto", "Texto qualquer");

    const result = await saveTextoAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});

describe("saveDataAction", () => {
  it("returns a validation error without writing when resposta_data is missing", async () => {
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns a validation error without writing when resposta_data is not in yyyy-mm-dd format", async () => {
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("resposta_data", "21/07/2026");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts resposta_data and redirects to nextUrl on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1?sub=motor");
    formData.set("resposta_data", "2026-07-21");
    formData.set("observacao", "");

    await expect(saveDataAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1?sub=motor"
    );

    expect(upsert).toHaveBeenCalledWith(
      { inspection_id: "insp-1", item_template_id: "item-1", resposta_data: "2026-07-21", observacao: null },
      { onConflict: "inspection_id,item_template_id" }
    );
  });

  it("returns a friendly message when the DB rejects the write (check_violation)", async () => {
    upsertQuery.single.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("resposta_data", "2026-07-21");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});
