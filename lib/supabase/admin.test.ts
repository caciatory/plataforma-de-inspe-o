import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAdminClient", () => {
  it("builds a client with the auth.admin API available", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    const { createAdminClient } = await import("./admin");

    const client = createAdminClient();

    expect(typeof client.auth.admin.createUser).toBe("function");
    expect(typeof client.auth.admin.updateUserById).toBe("function");
    expect(typeof client.auth.admin.listUsers).toBe("function");
  });
});
