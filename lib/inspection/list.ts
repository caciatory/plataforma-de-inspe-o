import type { InspectionStatus } from "./status";

export type TecnicoInspectionRow = {
  id: string;
  matricula: string;
  status: InspectionStatus;
  dataAbertura: string;
  devolvida: boolean;
  motivo: string | null;
};

export function buildTecnicoInspectionRows(
  inspections: {
    id: string;
    status: InspectionStatus;
    data_abertura: string;
    vehicle_data: { matricula: string } | null;
  }[],
  latestDevolucaoByInspectionId: Map<string, string>
): TecnicoInspectionRow[] {
  return inspections.map((i) => ({
    id: i.id,
    matricula: i.vehicle_data?.matricula ?? "—",
    status: i.status,
    dataAbertura: i.data_abertura,
    devolvida: i.status === "devolvida",
    motivo: i.status === "devolvida" ? (latestDevolucaoByInspectionId.get(i.id) ?? null) : null,
  }));
}
