import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const usersQuery: any = { select: vi.fn(() => usersQuery), eq: vi.fn(() => usersQuery), single: vi.fn() };
const from = vi.fn((table: string) => {
  if (table === "users") return usersQuery;
  throw new Error(`unexpected table ${table}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));

beforeEach(() => {
  getUser.mockReset();
  usersQuery.select.mockClear();
  usersQuery.eq.mockClear();
  usersQuery.single.mockReset();
});

describe("getCurrentUser", () => {
  it("returns null when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { getCurrentUser } = await import("./session");

    expect(await getCurrentUser()).toBeNull();
  });

  it("returns id + role for an authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    usersQuery.single.mockResolvedValue({ data: { role: "admin" } });
    const { getCurrentUser } = await import("./session");

    expect(await getCurrentUser()).toEqual({ id: "user-1", role: "admin" });
    expect(usersQuery.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("returns null when the auth user has no matching users row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-2" } } });
    usersQuery.single.mockResolvedValue({ data: null });
    const { getCurrentUser } = await import("./session");

    expect(await getCurrentUser()).toBeNull();
  });
});
