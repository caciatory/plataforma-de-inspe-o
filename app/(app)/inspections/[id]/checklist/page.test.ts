import { describe, it, expect, vi, beforeEach } from "vitest";

const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  order: vi.fn(() => query),
  limit: vi.fn(() => query),
  maybeSingle: vi.fn(),
};
const from = vi.fn(() => query);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from }),
}));

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({ redirect, notFound }));

beforeEach(() => {
  from.mockClear();
  query.select.mockClear();
  query.eq.mockClear();
  query.order.mockClear();
  query.limit.mockClear();
  query.maybeSingle.mockReset();
  redirect.mockClear();
  notFound.mockClear();
});

describe("ChecklistIndexPage", () => {
  it("redirects to the first active group by ordem", async () => {
    query.maybeSingle.mockResolvedValue({
      data: { id: "22222222-2222-2222-2222-222222222222" },
      error: null,
    });
    const { default: ChecklistIndexPage } = await import("./page");

    await expect(
      ChecklistIndexPage({ params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) })
    ).rejects.toThrow(
      "REDIRECT:/inspections/11111111-1111-1111-1111-111111111111/checklist/22222222-2222-2222-2222-222222222222"
    );
    expect(query.eq).toHaveBeenCalledWith("ativo", true);
    expect(query.order).toHaveBeenCalledWith("ordem");
  });

  it("calls notFound when there is no active group", async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { default: ChecklistIndexPage } = await import("./page");

    await expect(
      ChecklistIndexPage({ params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) })
    ).rejects.toThrow("NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
  });
});
