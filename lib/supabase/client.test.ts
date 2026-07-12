import { describe, it, expect } from "vitest";
import { createClient } from "./client";

describe("createClient", () => {
  it("is a function", () => {
    expect(typeof createClient).toBe("function");
  });
});
