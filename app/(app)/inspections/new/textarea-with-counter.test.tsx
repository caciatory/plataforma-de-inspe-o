import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextareaWithCounter } from "./textarea-with-counter";

describe("TextareaWithCounter", () => {
  it("does not show a counter under the soft limit", () => {
    render(
      <TextareaWithCounter id="notas" name="notas" label="Notas" value="pouco texto" onChange={() => {}} maxSoft={500} />
    );
    expect(screen.queryByText(/caracteres/)).not.toBeInTheDocument();
  });

  it("shows a character count once the value passes the soft limit", () => {
    const longValue = "a".repeat(501);
    render(
      <TextareaWithCounter id="notas" name="notas" label="Notas" value={longValue} onChange={() => {}} maxSoft={500} />
    );
    expect(screen.getByText("501 caracteres")).toBeInTheDocument();
  });

  it("calls onChange with the new value", () => {
    let value = "";
    const { rerender } = render(
      <TextareaWithCounter id="notas" name="notas" label="Notas" value={value} onChange={(v) => (value = v)} maxSoft={500} />
    );
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "novo texto" } });
    expect(value).toBe("novo texto");
  });
});
