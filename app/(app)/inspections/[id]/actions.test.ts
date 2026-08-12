import { describe, it, expect, vi, beforeEach } from "vitest";

const inspectionQuery: any = {
  select: vi.fn(() => inspectionQuery),
  eq: vi.fn(() => inspectionQuery),
  single: vi.fn(),
  update: vi.fn(() => updateQuery),
};
const updateQuery: any = { eq: vi.fn() };

const groupsQuery: any = { select: vi.fn(() => groupsQuery), eq: vi.fn(() => groupsQuery), order: vi.fn() };
const itemsQuery: any = { select: vi.fn(() => itemsQuery) };
const statusQuery: any = { select: vi.fn(() => statusQuery), eq: vi.fn() };
const reviewEventsQuery: any = { insert: vi.fn() };

const from = vi.fn((table: string) => {
  if (table === "inspections") return inspectionQuery;
  if (table === "checklist_group_templates") return groupsQuery;
  if (table === "checklist_item_templates") return itemsQuery;
  if (table === "checklist_item_status") return statusQuery;
  if (table === "review_events") return reviewEventsQuery;
  throw new Error(`unexpected table ${table}`);
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/session";

function formDataWith(inspectionId: string): FormData {
  const fd = new FormData();
  fd.set("inspectionId", inspectionId);
  return fd;
}

beforeEach(() => {
  from.mockClear();
  inspectionQuery.select.mockClear();
  inspectionQuery.eq.mockClear();
  inspectionQuery.single.mockReset();
  inspectionQuery.update.mockClear();
  updateQuery.eq.mockReset();
  groupsQuery.select.mockClear();
  groupsQuery.eq.mockClear();
  groupsQuery.order.mockReset();
  itemsQuery.select.mockReset();
  statusQuery.select.mockClear();
  statusQuery.eq.mockReset();
  reviewEventsQuery.insert.mockClear();
  vi.mocked(getCurrentUser).mockReset();
});

describe("submitInspectionAction", () => {
  it("returns an error without updating when the inspection is not editable", async () => {
    inspectionQuery.single.mockResolvedValue({ data: { status: "aprovada" }, error: null });
    const { submitInspectionAction } = await import("./actions");

    const result = await submitInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("returns an error without updating when there are pending items", async () => {
    inspectionQuery.single.mockResolvedValue({ data: { status: "rascunho" }, error: null });
    groupsQuery.order.mockResolvedValue({
      data: [{ id: "g1", ordem: 1, nome: "Pneus" }],
      error: null,
    });
    itemsQuery.select.mockResolvedValue({ data: [{ id: "i1", group_id: "g1" }], error: null });
    statusQuery.eq.mockResolvedValue({ data: [{ item_template_id: "i1", respondido: false }], error: null });
    const { submitInspectionAction } = await import("./actions");

    const result = await submitInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("returns an error without updating when no active checklist groups are found", async () => {
    inspectionQuery.single.mockResolvedValue({ data: { status: "rascunho" }, error: null });
    groupsQuery.order.mockResolvedValue({ data: [], error: null });
    itemsQuery.select.mockResolvedValue({ data: [], error: null });
    statusQuery.eq.mockResolvedValue({ data: [], error: null });
    const { submitInspectionAction } = await import("./actions");

    const result = await submitInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("updates status to aguardando_aprovacao when there are no pending items", async () => {
    inspectionQuery.single.mockResolvedValue({ data: { status: "devolvida" }, error: null });
    groupsQuery.order.mockResolvedValue({
      data: [{ id: "g1", ordem: 1, nome: "Pneus" }],
      error: null,
    });
    itemsQuery.select.mockResolvedValue({ data: [{ id: "i1", group_id: "g1" }], error: null });
    statusQuery.eq.mockResolvedValue({ data: [{ item_template_id: "i1", respondido: true }], error: null });
    updateQuery.eq.mockResolvedValue({ error: null });
    const { submitInspectionAction } = await import("./actions");

    const result = await submitInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("success");
    expect(inspectionQuery.update).toHaveBeenCalledWith({ status: "aguardando_aprovacao" });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "insp-1");
  });
});

describe("approveInspectionAction", () => {
  it("rejects when the caller is not admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" });
    const { approveInspectionAction } = await import("./actions");

    const result = await approveInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("rejects when the inspection is not aguardando_aprovacao", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "rascunho" }, error: null });
    const { approveInspectionAction } = await import("./actions");

    const result = await approveInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("inserts an aprovacao review_event and updates status to aprovada", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "aguardando_aprovacao" }, error: null });
    reviewEventsQuery.insert.mockResolvedValue({ error: null });
    updateQuery.eq.mockResolvedValue({ error: null });
    const { approveInspectionAction } = await import("./actions");

    const result = await approveInspectionAction({ status: "idle" }, formDataWith("insp-1"));

    expect(result.status).toBe("success");
    expect(reviewEventsQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      tipo: "aprovacao",
      autor_id: "admin-1",
    });
    const updateArgs = inspectionQuery.update.mock.calls[0][0];
    expect(updateArgs.status).toBe("aprovada");
    expect(updateArgs.codigo_certificado).toMatch(/^[A-Z0-9]{8}$/);
    expect(typeof updateArgs.certificado_emitido_em).toBe("string");
  });
});

describe("returnInspectionAction", () => {
  it("rejects an empty motivo", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    const fd = formDataWith("insp-1");
    const { returnInspectionAction } = await import("./actions");

    const result = await returnInspectionAction({ status: "idle" }, fd);

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("inserts a devolucao review_event with motivo and updates status to devolvida", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "aguardando_aprovacao" }, error: null });
    reviewEventsQuery.insert.mockResolvedValue({ error: null });
    updateQuery.eq.mockResolvedValue({ error: null });
    const fd = formDataWith("insp-1");
    fd.set("motivo", "Faltou foto do pneu traseiro");
    const { returnInspectionAction } = await import("./actions");

    const result = await returnInspectionAction({ status: "idle" }, fd);

    expect(result.status).toBe("success");
    expect(reviewEventsQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      tipo: "devolucao",
      autor_id: "admin-1",
      motivo: "Faltou foto do pneu traseiro",
    });
    expect(inspectionQuery.update).toHaveBeenCalledWith({ status: "devolvida" });
  });
});

describe("cancelInspectionAction", () => {
  it("rejects when status is already aprovada", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "aprovada" }, error: null });
    const fd = formDataWith("insp-1");
    fd.set("motivo", "Motivo qualquer");
    const { cancelInspectionAction } = await import("./actions");

    const result = await cancelInspectionAction({ status: "idle" }, fd);

    expect(result.status).toBe("error");
    expect(updateQuery.eq).not.toHaveBeenCalled();
  });

  it("cancels a rascunho with a motivo, inserting review_events and updating status", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    inspectionQuery.single.mockResolvedValue({ data: { status: "rascunho" }, error: null });
    reviewEventsQuery.insert.mockResolvedValue({ error: null });
    updateQuery.eq.mockResolvedValue({ error: null });
    const fd = formDataWith("insp-1");
    fd.set("motivo", "Cliente desistiu");
    const { cancelInspectionAction } = await import("./actions");

    const result = await cancelInspectionAction({ status: "idle" }, fd);

    expect(result.status).toBe("success");
    expect(reviewEventsQuery.insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      tipo: "cancelamento",
      autor_id: "admin-1",
      motivo: "Cliente desistiu",
    });
    expect(inspectionQuery.update).toHaveBeenCalledWith({ status: "cancelada" });
  });
});
