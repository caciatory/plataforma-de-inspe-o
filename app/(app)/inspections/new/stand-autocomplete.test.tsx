import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StandAutocomplete } from "./stand-autocomplete";

vi.mock("./actions", () => ({
  searchStandContactsAction: vi.fn(async (query: string) =>
    query === "Stand"
      ? [{ nome_solicitante: "Stand Central", contacto: "910000000", email: "s@c.pt" }]
      : []
  ),
}));

describe("StandAutocomplete", () => {
  it("shows matching stands and calls onSelect with the chosen contact", async () => {
    const onSelect = vi.fn();
    render(<StandAutocomplete onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText("Procurar stand existente"), {
      target: { value: "Stand" },
    });

    const option = await screen.findByText(/Stand Central/);
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith({
      nome_solicitante: "Stand Central",
      contacto: "910000000",
      email: "s@c.pt",
    });
  });

  it("shows nothing for queries under 2 characters", async () => {
    render(<StandAutocomplete onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Procurar stand existente"), { target: { value: "S" } });
    await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
  });
});
