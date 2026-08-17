import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const insert = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc,
    from: (table: string) => {
      if (table === "client_access_logs") return { insert };
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const rpcPayload = {
  inspection_id: "insp-1",
  inspection: {
    codigo_certificado: "CK7X29QP",
    certificado_emitido_em: "2026-08-12T10:00:00Z",
    parceiro_nome: null,
    parceiro_logo_url: null,
    parceiro_telefone: null,
    data_finalizacao: "2026-08-10T10:00:00Z",
    data_abertura: "2026-08-01T10:00:00Z",
    tecnico_nome: "Técnico Teste",
    tecnico_credencial: null,
  },
  vehicle: { marca: "Toyota", modelo: "Corolla" },
  score: { nota_geral: 8.5, classificacao: "A" },
  fotos_capa: [],
  groups: [],
  items: [],
  responses: [],
  opcoes: [],
  medicao_resultados: [],
  photos: [],
  equipamentos: [],
  equipamento_fotos: [],
};

beforeEach(() => {
  rpc.mockReset();
  insert.mockClear();
});

describe("registrarAcessoAction", () => {
  it("devolve status erro quando a RPC não encontra o código", async () => {
    const { registrarAcessoAction } = await import("./actions");
    rpc.mockResolvedValue({ data: null, error: null });

    const resultado = await registrarAcessoAction("CODIGOINVALIDO", "whatsapp");
    expect(resultado.status).toBe("erro");
    expect(insert).not.toHaveBeenCalled();
  });

  it("registra o acesso e devolve os dados mapeados quando a RPC encontra o código", async () => {
    const { registrarAcessoAction } = await import("./actions");
    rpc.mockResolvedValue({ data: rpcPayload, error: null });

    const resultado = await registrarAcessoAction("CK7X29QP", "whatsapp");
    expect(resultado.status).toBe("ok");
    if (resultado.status !== "ok") throw new Error("esperava ok");
    expect(resultado.dados.codigoCertificado).toBe("CK7X29QP");
    expect(resultado.dados.tecnicoNome).toBe("Técnico Teste");
    expect(insert).toHaveBeenCalledWith({ inspection_id: "insp-1", origem: "whatsapp" });
  });

  it("ainda devolve os dados quando o insert do log falha (best-effort, não bloqueia)", async () => {
    const { registrarAcessoAction } = await import("./actions");
    rpc.mockResolvedValue({ data: rpcPayload, error: null });
    insert.mockResolvedValueOnce({ error: { message: "boom" } });

    const resultado = await registrarAcessoAction("CK7X29QP", "outro");
    expect(resultado.status).toBe("ok");
  });
});
