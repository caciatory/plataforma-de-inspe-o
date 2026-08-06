import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertQuery = { select: vi.fn(() => upsertQuery), single: vi.fn() };
const upsert = vi.fn(() => upsertQuery);

const insertQuery = { select: vi.fn(() => insertQuery), single: vi.fn() };
const insert = vi.fn(() => insertQuery);

const deleteSingleQuery = { single: vi.fn() };
const deleteSelectQuery = { select: vi.fn(() => deleteSingleQuery) };
const deleteQuery = { eq: vi.fn(() => deleteSelectQuery) };
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

const responseQuery: { eq: ReturnType<typeof vi.fn>; single: ReturnType<typeof vi.fn> } = {
  eq: vi.fn(() => responseQuery),
  single: vi.fn(),
};
const responseSelect = vi.fn(() => responseQuery);

const auditInsert = vi.fn();

const rpc = vi.fn();

const from = vi.fn((table: string) => {
  if (table === "checklist_item_templates") return { select: templateSelect };
  if (table === "opcoes") return { select: opcoesSelect };
  if (table === "audit_log_entries") return { insert: auditInsert };
  if (table === "checklist_item_responses") return { upsert, select: responseSelect };
  if (table === "photos") return { insert, delete: del };
  return {};
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from, rpc }),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/session";

beforeEach(() => {
  from.mockClear();
  upsert.mockClear();
  upsertQuery.select.mockClear();
  upsertQuery.single.mockReset();
  insert.mockClear();
  insertQuery.select.mockClear();
  insertQuery.single.mockReset();
  del.mockClear();
  deleteQuery.eq.mockClear();
  deleteSelectQuery.select.mockClear();
  deleteSingleQuery.single.mockReset();
  templateSelect.mockClear();
  templateQuery.eq.mockClear();
  templateQuery.single.mockReset();
  templateQuery.in.mockReset();
  opcoesSelect.mockClear();
  opcoesQuery.eq.mockClear();
  opcoesQuery.maybeSingle.mockReset();
  opcoesQuery.in.mockReset();
  responseSelect.mockClear();
  responseQuery.eq.mockClear();
  responseQuery.single.mockReset();
  auditInsert.mockReset();
  auditInsert.mockResolvedValue({ error: null });
  rpc.mockReset();
  vi.mocked(getCurrentUser).mockReset();
});

describe("saveEscolhaAction", () => {
  it("returns a validation error without writing when opcao_id is missing", async () => {
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");

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
    formData.set("opcao_id", "opt-de-outro-conjunto");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts the response and returns idle on success", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: { id: "opt-medio" }, error: null });
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("opcao_id", "opt-medio");
    formData.set("observacao", "Desgaste leve");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result).toEqual({ status: "idle" });
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
    formData.set("opcao_id", "opt-ruim");

    const result = await saveEscolhaAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });

  it("logs an audit entry when the caller is admin", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: { id: "opt-medio" }, error: null });
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("opcao_id", "opt-medio");

    await saveEscolhaAction({ status: "idle" }, formData);

    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ admin_id: "admin-1", inspection_id: "insp-1" })
    );
  });

  it("does not log an audit entry when the caller is técnico", async () => {
    templateQuery.single.mockResolvedValue({ data: { conjunto_opcao_id: "conj-1" }, error: null });
    opcoesQuery.maybeSingle.mockResolvedValue({ data: { id: "opt-medio" }, error: null });
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" });
    const { saveEscolhaAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("opcao_id", "opt-medio");

    await saveEscolhaAction({ status: "idle" }, formData);

    expect(auditInsert).not.toHaveBeenCalled();
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
    deleteSingleQuery.single.mockResolvedValue({
      data: { inspection_id: "insp-1", item_response_id: "resp-1" },
      error: null,
    });
    const { deletePhotoAction } = await import("./actions");

    const result = await deletePhotoAction("photo-1");

    expect(result).toEqual({});
    expect(deleteQuery.eq).toHaveBeenCalledWith("id", "photo-1");
  });

  it("returns an error when the delete fails", async () => {
    deleteSingleQuery.single.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { deletePhotoAction } = await import("./actions");

    const result = await deletePhotoAction("photo-1");

    expect(result.error).toBeTruthy();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("logs an audit entry naming the deleted photo's item when the caller is admin", async () => {
    deleteSingleQuery.single.mockResolvedValue({
      data: { inspection_id: "insp-1", item_response_id: "resp-1" },
      error: null,
    });
    responseQuery.single.mockResolvedValue({ data: { item_template_id: "item-1" }, error: null });
    templateQuery.single.mockResolvedValue({ data: { nome: "Foto qualquer" }, error: null });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    const { deletePhotoAction } = await import("./actions");

    const result = await deletePhotoAction("photo-1");

    expect(result).toEqual({});
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ admin_id: "admin-1", inspection_id: "insp-1" })
    );
  });

  it("does not log an audit entry when the caller is técnico", async () => {
    deleteSingleQuery.single.mockResolvedValue({
      data: { inspection_id: "insp-1", item_response_id: "resp-1" },
      error: null,
    });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" });
    const { deletePhotoAction } = await import("./actions");

    await deletePhotoAction("photo-1");

    expect(auditInsert).not.toHaveBeenCalled();
  });
});

describe("saveMeasurementAction", () => {
  it("returns a validation error without calling the RPC when a value is not a number", async () => {
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.append("valor", "100");
    formData.append("valor", "abc");

    const result = await saveMeasurementAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls the RPC with numeric values and returns success", async () => {
    rpc.mockResolvedValue({ data: [{ item_response_id: "resp-1", resultado: "ok" }], error: null });
    const { saveMeasurementAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.append("valor", "100");
    formData.append("valor", "110");
    formData.append("valor", "120");
    formData.set("observacao", "Desgaste leve");

    const result = await saveMeasurementAction({ status: "idle" }, formData);

    expect(result).toEqual({ status: "success" });
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

describe("saveTextoAction", () => {
  it("returns a validation error without writing when resposta_texto is empty", async () => {
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");

    const result = await saveTextoAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts resposta_texto and returns idle on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveTextoAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("resposta_texto", "Chassi OK, sem avarias visíveis");
    formData.set("observacao", "Verificado às 10h");

    const result = await saveTextoAction({ status: "idle" }, formData);

    expect(result).toEqual({ status: "idle" });
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

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns a validation error without writing when resposta_data is not in yyyy-mm-dd format", async () => {
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("resposta_data", "21/07/2026");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upserts resposta_data and returns idle on success", async () => {
    upsertQuery.single.mockResolvedValue({ data: { id: "resp-1" }, error: null });
    const { saveDataAction } = await import("./actions");
    const formData = new FormData();
    formData.set("inspectionId", "insp-1");
    formData.set("itemTemplateId", "item-1");
    formData.set("resposta_data", "2026-07-21");
    formData.set("observacao", "");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result).toEqual({ status: "idle" });
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
    formData.set("resposta_data", "2026-07-21");

    const result = await saveDataAction({ status: "idle" }, formData);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toMatch(/foto/i);
    }
  });
});
