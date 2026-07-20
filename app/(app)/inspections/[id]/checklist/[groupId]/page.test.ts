import { describe, it, expect, vi, beforeEach } from "vitest";

const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  single: vi.fn(),
};
const from = vi.fn(() => query);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound }));

beforeEach(() => {
  from.mockClear();
  query.select.mockClear();
  query.eq.mockClear();
  query.single.mockReset();
  notFound.mockClear();
});

describe("ChecklistGroupPage", () => {
  it("calls notFound when the group does not exist or is inactive", async () => {
    query.single.mockResolvedValue({ data: null, error: { message: "not found" } });
    const { default: ChecklistGroupPage } = await import("./page");

    await expect(
      ChecklistGroupPage({
        params: Promise.resolve({
          id: "11111111-1111-1111-1111-111111111111",
          groupId: "99999999-9999-9999-9999-999999999999",
        }),
      })
    ).rejects.toThrow("NOT_FOUND");
    expect(query.eq).toHaveBeenCalledWith("ativo", true);
  });
});
