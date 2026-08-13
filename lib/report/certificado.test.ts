import { describe, it, expect } from "vitest";
import { gerarCodigoCertificado } from "./certificado";

describe("gerarCodigoCertificado", () => {
  it("gera um código de 8 caracteres maiúsculos/numéricos", () => {
    const codigo = gerarCodigoCertificado();
    expect(codigo).toMatch(/^[A-Z0-9]{8}$/);
  });

  it("gera códigos diferentes em chamadas sucessivas", () => {
    const codigos = new Set(Array.from({ length: 20 }, () => gerarCodigoCertificado()));
    expect(codigos.size).toBeGreaterThan(1);
  });
});
