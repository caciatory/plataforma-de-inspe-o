import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaisOrigemSelect } from "./pais-origem-select";

describe("PaisOrigemSelect", () => {
  it("renders a select with the common countries and an Outro option", () => {
    render(<PaisOrigemSelect id="paisOrigem" value="" onChange={() => {}} />);
    const select = screen.getByLabelText("País de origem / importação") as HTMLSelectElement;
    expect(select).toHaveAttribute("name", "paisOrigem");
    expect(screen.getByRole("option", { name: "Alemanha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Outro" })).toBeInTheDocument();
  });

  it("calls onChange with the picked country", () => {
    let picked = "";
    render(<PaisOrigemSelect id="paisOrigem" value="" onChange={(v) => (picked = v)} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "Alemanha" } });
    expect(picked).toBe("Alemanha");
  });

  it("switches to a free-text input named paisOrigem when Outro is picked", () => {
    render(<PaisOrigemSelect id="paisOrigem" value="" onChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "__outro__" } });

    const input = screen.getByLabelText("País de origem / importação") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("name", "paisOrigem");
  });

  it("lets typing in the Outro input drive onChange", () => {
    let value = "";
    const { rerender } = render(<PaisOrigemSelect id="paisOrigem" value={value} onChange={(v) => (value = v)} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "__outro__" } });
    rerender(<PaisOrigemSelect id="paisOrigem" value={value} onChange={(v) => (value = v)} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "Andorra" } });
    expect(value).toBe("Andorra");
  });

  it("returns to select mode when 'Escolher da lista' is clicked", () => {
    render(<PaisOrigemSelect id="paisOrigem" value="" onChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("País de origem / importação"), { target: { value: "__outro__" } });
    fireEvent.click(screen.getByText("Escolher da lista"));
    expect((screen.getByLabelText("País de origem / importação") as HTMLSelectElement).tagName).toBe("SELECT");
  });
});
