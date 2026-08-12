import { describe, it, expect, vi, beforeEach } from "vitest";

const inspectionsQuery: any = { update: vi.fn(() => updateQuery) };
const updateQuery: any = { eq: vi.fn() };
const photosInsertQuery: any = { insert: vi.fn(() => photosSelectQuery) };
const photosSelectQuery: any = { select: vi.fn(() => photosSingleQuery) };
const photosSingleQuery: any = { single: vi.fn() };
const photosDeleteQuery: any = { delete: vi.fn(() => photosDeleteEqQuery) };
const photosDeleteEqQuery: any = { eq: vi.fn(() => photosDeleteEqQuery2) };
const photosDeleteEqQuery2: any = { eq: vi.fn() };

const from = vi.fn((table: string) => {
  if (table === "inspections") return inspectionsQuery;
  if (table === "photos") return { insert: photosInsertQuery.insert, delete: photosDeleteQuery.delete };
  throw new Error(`unexpected table ${table}`);
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/session";

beforeEach(() => {
  from.mockClear();
  inspectionsQuery.update.mockClear();
  updateQuery.eq.mockReset();
  photosInsertQuery.insert.mockClear();
  photosSelectQuery.select.mockClear();
  photosSingleQuery.single.mockReset();
  photosDeleteQuery.delete.mockClear();
  photosDeleteEqQuery.eq.mockClear();
  photosDeleteEqQuery2.eq.mockReset();
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" } as any);
});

describe("saveParceiroAction", () => {
  it("faz update dos 3 campos de parceiro na inspeção", async () => {
    updateQuery.eq.mockResolvedValue({ error: null });
    const { saveParceiroAction } = await import("./actions");

    const formData = new FormData();
    formData.set("parceiro_nome", "Stand Central");
    formData.set("parceiro_logo_url", "https://example.com/logo.png");
    formData.set("parceiro_telefone", "351912345678");

    const result = await saveParceiroAction("insp-1", formData);

    expect(result.error).toBeUndefined();
    expect(inspectionsQuery.update).toHaveBeenCalledWith({
      parceiro_nome: "Stand Central",
      parceiro_logo_url: "https://example.com/logo.png",
      parceiro_telefone: "351912345678",
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "insp-1");
  });

  it("retorna erro amigável quando o update falha", async () => {
    updateQuery.eq.mockResolvedValue({ error: { message: "boom" } });
    const { saveParceiroAction } = await import("./actions");

    const result = await saveParceiroAction("insp-1", new FormData());

    expect(result.error).toBe("Não foi possível guardar os dados do parceiro. Tente novamente.");
  });

  it("bloqueia quem não é admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" } as any);
    const { saveParceiroAction } = await import("./actions");

    const result = await saveParceiroAction("insp-1", new FormData());

    expect(result.error).toBe("Apenas administradores podem editar dados do parceiro.");
    expect(inspectionsQuery.update).not.toHaveBeenCalled();
  });
});

describe("attachCapaPhotoAction", () => {
  it("insere a foto com contexto='capa' e item_response_id null", async () => {
    photosSingleQuery.single.mockResolvedValue({ data: { id: "photo-1" }, error: null });
    const { attachCapaPhotoAction } = await import("./actions");

    const result = await attachCapaPhotoAction("insp-1", "https://example.com/capa.jpg");

    expect(result.photoId).toBe("photo-1");
    expect(photosInsertQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      contexto: "capa",
      item_response_id: null,
      url: "https://example.com/capa.jpg",
    });
  });

  it("bloqueia quem não é admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" } as any);
    const { attachCapaPhotoAction } = await import("./actions");

    const result = await attachCapaPhotoAction("insp-1", "https://example.com/capa.jpg");

    expect(result.error).toBe("Apenas administradores podem anexar fotos de capa.");
    expect(photosInsertQuery.insert).not.toHaveBeenCalled();
  });
});

describe("deleteCapaPhotoAction", () => {
  it("remove a foto pelo id, filtrando por contexto='capa'", async () => {
    photosDeleteEqQuery2.eq.mockResolvedValue({ error: null });
    const { deleteCapaPhotoAction } = await import("./actions");

    const result = await deleteCapaPhotoAction("photo-1");

    expect(result.error).toBeUndefined();
    expect(photosDeleteEqQuery.eq).toHaveBeenCalledWith("id", "photo-1");
    expect(photosDeleteEqQuery2.eq).toHaveBeenCalledWith("contexto", "capa");
  });

  it("bloqueia quem não é admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" } as any);
    const { deleteCapaPhotoAction } = await import("./actions");

    const result = await deleteCapaPhotoAction("photo-1");

    expect(result.error).toBe("Apenas administradores podem remover fotos de capa.");
    expect(photosDeleteQuery.delete).not.toHaveBeenCalled();
  });
});
