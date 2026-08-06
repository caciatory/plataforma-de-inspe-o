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

const from = vi.fn((table: string) => {
  if (table === "inspections") return inspectionQuery;
  if (table === "checklist_group_templates") return groupsQuery;
  if (table === "checklist_item_templates") return itemsQuery;
  if (table === "checklist_item_status") return statusQuery;
  throw new Error(`unexpected table ${table}`);
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

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
