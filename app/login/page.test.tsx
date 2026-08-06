import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "./page";

const signInWithPassword = vi.fn();
const usersQuery: any = { select: vi.fn(() => usersQuery), eq: vi.fn(() => usersQuery), single: vi.fn() };
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword }, from: () => usersQuery }),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  signInWithPassword.mockReset();
  push.mockReset();
  usersQuery.single.mockReset();
});

describe("LoginPage", () => {
  it("shows an error message on invalid credentials", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Email ou palavra-passe inválidos.");
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects a técnico to /inspections on success", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    usersQuery.single.mockResolvedValue({ data: { role: "tecnico" } });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/inspections"));
  });

  it("redirects an admin to /admin on success", async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: "user-2" } }, error: null });
    usersQuery.single.mockResolvedValue({ data: { role: "admin" } });
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@b.com" } });
    fireEvent.change(screen.getByLabelText("Palavra-passe"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: /entrar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin"));
  });
});
