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
};

export function buildAdminInspectionRows(
  inspections: {
    id: string;
    status: InspectionStatus;
    tipo_cliente: "particular" | "stand";
    data_abertura: string;
    vehicle_data: { matricula: string; marca: string; modelo: string } | null;
    users: { nome: string } | null;
  }[],
  scores: { inspection_id: string; nota_geral: number; classificacao: string }[],
  today: string
): AdminInspectionRow[] {
  const scoreByInspectionId = new Map(scores.map((s) => [s.inspection_id, s]));

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
      atrasada: i.data_abertura < today && i.status !== "aprovada" && i.status !== "cancelada",
    };
  });
}
