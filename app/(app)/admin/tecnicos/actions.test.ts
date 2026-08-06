import { describe, it, expect, vi, beforeEach } from "vitest";

const createUser = vi.fn();
const updateUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { createUser, updateUserById } } }),
}));

const usersInsert = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ insert: usersInsert }) }),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/session";

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  createUser.mockReset();
  updateUserById.mockReset();
  usersInsert.mockReset();
  vi.mocked(getCurrentUser).mockReset();
});

describe("createTecnicoAction", () => {
  it("rejects when the caller is not admin", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "tec-1", role: "tecnico" });
    const { createTecnicoAction } = await import("./actions");

    const result = await createTecnicoAction(
      { status: "idle" },
      formDataWith({ nome: "Novo Técnico", email: "novo@checkauto.pt", senha: "senha1234" })
    );

    expect(result.status).toBe("error");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects a senha shorter than 8 characters", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    const { createTecnicoAction } = await import("./actions");

    const result = await createTecnicoAction(
      { status: "idle" },
      formDataWith({ nome: "Novo Técnico", email: "novo@checkauto.pt", senha: "abc" })
    );

    expect(result.status).toBe("error");
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates the auth user then the public.users row", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    createUser.mockResolvedValue({ data: { user: { id: "new-tec-id" } }, error: null });
    usersInsert.mockResolvedValue({ error: null });
    const { createTecnicoAction } = await import("./actions");

    const result = await createTecnicoAction(
      { status: "idle" },
      formDataWith({ nome: "Novo Técnico", email: "novo@checkauto.pt", senha: "senha1234" })
    );

    expect(result.status).toBe("success");
    expect(createUser).toHaveBeenCalledWith({ email: "novo@checkauto.pt", password: "senha1234", email_confirm: true });
    expect(usersInsert).toHaveBeenCalledWith({
      id: "new-tec-id",
      nome: "Novo Técnico",
      email: "novo@checkauto.pt",
      role: "tecnico",
    });
  });
});

describe("toggleTecnicoBanAction", () => {
  it("bans with a ~100-year duration when deactivating", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    updateUserById.mockResolvedValue({ error: null });
    const { toggleTecnicoBanAction } = await import("./actions");

    const result = await toggleTecnicoBanAction({ status: "idle" }, formDataWith({ tecnicoId: "tec-1", ban: "true" }));

    expect(result.status).toBe("success");
    expect(updateUserById).toHaveBeenCalledWith("tec-1", { ban_duration: "876000h" });
  });

  it("clears the ban when reactivating", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", role: "admin" });
    updateUserById.mockResolvedValue({ error: null });
    const { toggleTecnicoBanAction } = await import("./actions");

    await toggleTecnicoBanAction({ status: "idle" }, formDataWith({ tecnicoId: "tec-1", ban: "false" }));

    expect(updateUserById).toHaveBeenCalledWith("tec-1", { ban_duration: "none" });
  });
});
