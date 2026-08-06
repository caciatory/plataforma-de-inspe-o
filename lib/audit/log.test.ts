import { describe, it, expect, vi } from "vitest";
import { recordAdminEdit } from "./log";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function buildSupabase(itemNome: string | null) {
  const itemQuery: any = { select: vi.fn(() => itemQuery), eq: vi.fn(() => itemQuery), single: vi.fn() };
  itemQuery.single.mockResolvedValue({ data: itemNome ? { nome: itemNome } : null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => (table === "checklist_item_templates" ? itemQuery : { insert }));
  return { supabase: { from } as unknown as SupabaseServerClient, insert };
}

describe("recordAdminEdit", () => {
  it("inserts an audit_log_entries row naming the edited item", async () => {
    const { supabase, insert } = buildSupabase("Pneu dianteiro esquerdo");

    await recordAdminEdit(supabase, { inspectionId: "insp-1", itemTemplateId: "item-1", adminId: "admin-1" });

    expect(insert).toHaveBeenCalledWith({
      inspection_id: "insp-1",
      admin_id: "admin-1",
      descricao: 'Editou "Pneu dianteiro esquerdo"',
    });
  });

  it("falls back to the item id when the name can't be resolved", async () => {
    const { supabase, insert } = buildSupabase(null);

    await recordAdminEdit(supabase, { inspectionId: "insp-1", itemTemplateId: "item-404", adminId: "admin-1" });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ descricao: 'Editou "item-404"' }));
  });
});
