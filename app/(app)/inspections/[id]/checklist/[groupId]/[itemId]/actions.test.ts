import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertQuery = { select: vi.fn(() => upsertQuery), single: vi.fn() };
const upsert = vi.fn(() => upsertQuery);

const insertQuery = { select: vi.fn(() => insertQuery), single: vi.fn() };
const insert = vi.fn(() => insertQuery);

const deleteQuery = { eq: vi.fn() };
const del = vi.fn(() => deleteQuery);

const rpc = vi.fn();

const from = vi.fn(() => ({ upsert, insert, delete: del }));
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
  rpc.mockReset();
  redirect.mockClear();
});

describe("saveClassificacaoAction", () => {
  it("returns a validation error without writing when classificacao is missing", async () => {
    const { saveClassificacaoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");

    const result = await saveClassificacaoAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the response and redirects to nextUrl on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveClassificacaoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");
    formData.set("classificacao", "medio");
    formData.set("observacao", "Desgaste leve");

    await expect(saveClassificacaoAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1/item-2"
    );

    expect(upsert).toHaveBeenCalledWith(
      { inspection_id: "insp-1", item_template_id: "item-1", classificacao: "medio", observacao: "Desgaste leve" },
      { onConflict: "inspection_id,item_template_id" }
    );
  });

  it("returns a friendly message when the DB rejects 'ruim' without a photo (check_violation)", async () => {
    upsertQuery.single.mockResolvedValue({ data: null, error: { code: "23514", message: "RF-16" } });
    const { saveClassificacaoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/x");
    formData.set("classificacao", "ruim");

    const result = await saveClassificacaoAction({ status: "idle" }, formData);

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
    rpc.mockResolvedValue({ data: [{ item_response_id: "resp-1" }], error: null });
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("nextUrl", "/inspections/insp-1/checklist/group-1/item-2");
    formData.append("valor", "100");
    formData.append("valor", "110");
    formData.append("valor", "120");

    await expect(saveMeasurementAction({ status: "idle" }, formData)).rejects.toThrow(
      "REDIRECT:/inspections/insp-1/checklist/group-1/item-2"
    );

    expect(rpc).toHaveBeenCalledWith("save_paint_measurement", {
      p_inspection_id: "insp-1",
      p_item_template_id: "item-1",
      p_valores_um: [100, 110, 120],
    });
  });

  it("returns a friendly message when the DB rejects reparacao_colisao without a photo", async () => {
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
