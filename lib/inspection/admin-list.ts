import type { InspectionStatus } from "./status";

export type AdminInspectionRow = {
  id: string;
  matricula: string;
  marcaModelo: string;
  tecnicoNome: string;
  status: InspectionStatus;
  tipoCliente: "particular" | "stand";
  nota: number | null;
  classificacao: string | null;
  dataAbertura: string;
  atrasada: boolean;
  parceiroNome: string | null;
  parceiroLogoUrl: string | null;
  parceiroTelefone: string | null;
  fotosCapa: { id: string; url: string }[];
};

export function buildAdminInspectionRows(
  inspections: {
    id: string;
    status: InspectionStatus;
    tipo_cliente: "particular" | "stand";
    data_abertura: string;
    atrasada: boolean;
    parceiro_nome: string | null;
    parceiro_logo_url: string | null;
    parceiro_telefone: string | null;
    vehicle_data: { matricula: string; marca: string; modelo: string } | null;
    users: { nome: string } | null;
  }[],
  scores: { inspection_id: string; nota_geral: number; classificacao: string }[],
  fotosCapa: { id: string; url: string; inspection_id: string }[] = []
): AdminInspectionRow[] {
  const scoreByInspectionId = new Map(scores.map((s) => [s.inspection_id, s]));
  const fotosByInspectionId = new Map<string, { id: string; url: string }[]>();
  for (const foto of fotosCapa) {
    const lista = fotosByInspectionId.get(foto.inspection_id) ?? [];
    lista.push({ id: foto.id, url: foto.url });
    fotosByInspectionId.set(foto.inspection_id, lista);
  }

  return inspections.map((i) => {
    const score = scoreByInspectionId.get(i.id);
    return {
      id: i.id,
      matricula: i.vehicle_data?.matricula ?? "—",
      marcaModelo: `${i.vehicle_data?.marca ?? ""} ${i.vehicle_data?.modelo ?? ""}`.trim() || "—",
      tecnicoNome: i.users?.nome ?? "—",
      status: i.status,
      tipoCliente: i.tipo_cliente,
      nota: score?.nota_geral ?? null,
      classificacao: score?.classificacao ?? null,
      dataAbertura: i.data_abertura,
      atrasada: i.atrasada,
      parceiroNome: i.parceiro_nome,
      parceiroLogoUrl: i.parceiro_logo_url,
      parceiroTelefone: i.parceiro_telefone,
      fotosCapa: fotosByInspectionId.get(i.id) ?? [],
    };
  });
}
