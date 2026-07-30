import { describe, it, expect } from "vitest";
import { PAISES_ORIGEM_COMUNS } from "./paises";

describe("PAISES_ORIGEM_COMUNS", () => {
  it("has a short curated list of common origin countries", () => {
    expect(PAISES_ORIGEM_COMUNS.length).toBeGreaterThan(0);
    expect(PAISES_ORIGEM_COMUNS).toContain("Alemanha");
  });

  it("has no duplicate entries", () => {
    expect(new Set(PAISES_ORIGEM_COMUNS).size).toBe(PAISES_ORIGEM_COMUNS.length);
  });
});
