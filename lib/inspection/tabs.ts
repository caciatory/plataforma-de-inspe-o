export const TAB_IDS = ["cliente", "identificacao", "historico", "especificacoes", "equipamentos"] as const;

export type TabId = (typeof TAB_IDS)[number];

const FIELD_TO_TAB: Record<string, TabId> = {
  tipoCliente: "cliente",
  objetivo: "cliente",
  nomeSolicitante: "cliente",
  contacto: "cliente",
  email: "cliente",
  responsavelPresente: "cliente",
  matricula: "identificacao",
  marca: "identificacao",
  modelo: "identificacao",
  versaoTrim: "identificacao",
  anoFabrico: "identificacao",
  anoModelo: "identificacao",
  cor: "identificacao",
  vin: "identificacao",
  quilometragem: "identificacao",
  numeroMotor: "especificacoes",
  numeroPortas: "especificacoes",
  combustivel: "especificacoes",
  caixaVelocidades: "especificacoes",
  tracao: "especificacoes",
  potenciaCv: "especificacoes",
  torqueNm: "especificacoes",
};

export function resolveTabForField(field: string | undefined): TabId | null {
  if (!field) return null;
  return FIELD_TO_TAB[field] ?? null;
}
