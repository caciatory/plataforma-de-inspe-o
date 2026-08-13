import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "admin-1", role: "admin" })),
}));

// next/font/google's SWC transform only runs inside a real Next.js build;
// under vitest it's just a plain import, so stub it the same way the module
// behaves at runtime (an object exposing a className).
vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ className: "mock-dm-sans" }),
}));

function buildQuery(result: unknown) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve({ data: result })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: result })),
    then: (resolve: (v: unknown) => void) => resolve({ data: result }),
  };
  return query;
}

let inspectionsQuery: ReturnType<typeof buildQuery> | undefined;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "inspections") {
        inspectionsQuery = buildQuery({
          id: "insp-1",
          status: "aprovada",
          codigo_certificado: "CK7X29QP",
          certificado_emitido_em: "2026-08-12T10:00:00Z",
          parceiro_nome: null,
          parceiro_logo_url: null,
          parceiro_telefone: null,
          vehicle_data: {
            matricula: "AA-00-XX",
            marca: "Toyota",
            modelo: "Corolla",
            versao_trim: "1.8",
            ano_fabrico: 2020,
            ano_modelo: 2020,
            cor: "Prata",
            vin: "JTDKP5C1XL0012345",
            numero_motor: "2ZR-FE",
            numero_portas: 4,
            combustivel: "Gasolina",
            caixa_velocidades: "Manual",
            quilometragem: 45000
          },
          users: { nome: "Técnico Teste", credencial_interna: null },
        });
        return inspectionsQuery;
      }
      if (table === "inspection_score") return buildQuery({ nota_geral: 8.5, classificacao: "A" });
      if (table === "photos") return buildQuery([]);
      if (table === "checklist_group_templates") return buildQuery([]);
      if (table === "checklist_item_templates") return buildQuery([]);
      if (table === "checklist_item_responses") return buildQuery([]);
      if (table === "opcoes") return buildQuery([]);
      if (table === "medicoes_resultado") return buildQuery([]);
      if (table === "equipamento_inspecao") return buildQuery([]);
      if (table === "equipamento_fotos") return buildQuery([]);
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

describe("RelatorioPage — RF-50", () => {
  it("nunca renderiza dados do solicitante (client_data), só dados técnicos do veículo", async () => {
    const { default: RelatorioPage } = await import("./page");
    const jsx = await RelatorioPage({ params: Promise.resolve({ id: "insp-1" }) });
    const { container } = render(jsx);

    // Verify that solicitante-like content is not present
    expect(container.textContent).not.toMatch(/Cliente Sensível|solicitante|email|telefone do cliente/i);

    // Verify that vehicle technical data IS present
    expect(container.textContent).toContain("AA-00-XX");
    expect(container.textContent).toContain("Toyota");
    expect(container.textContent).toContain("Corolla");

    // Regressao: <dialog> (do CertificadoInfoButton) nunca pode ficar
    // aninhado dentro de um <p> -- HTML invalido, causa mismatch de hidratacao.
    expect(container.querySelector("p dialog")).toBeNull();

    // Regressao: ninguem pode adicionar um embed client_data(*) na mesma
    // query de "inspections" (o throw genérico só pegaria uma tabela nova).
    const selectArg = inspectionsQuery?.select.mock.calls[0][0];
    expect(selectArg).not.toContain("client_data");
  });
});
