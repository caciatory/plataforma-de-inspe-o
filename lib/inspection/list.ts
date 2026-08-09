import type { InspectionStatus } from "./status";

export type TecnicoInspectionRow = {
  id: string;
  matricula: string;
  marcaModelo: string;
  cor: string | null;
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
    vehicle_data: { matricula: string; marca: string | null; modelo: string | null; cor: string | null } | null;
  }[],
  latestDevolucaoByInspectionId: Map<string, string>
): TecnicoInspectionRow[] {
  return inspections.map((i) => ({
    id: i.id,
    matricula: i.vehicle_data?.matricula ?? "—",
    marcaModelo: [i.vehicle_data?.marca, i.vehicle_data?.modelo].filter(Boolean).join(" ") || "—",
    cor: i.vehicle_data?.cor ?? null,
    status: i.status,
    dataAbertura: i.data_abertura,
    devolvida: i.status === "devolvida",
    motivo: i.status === "devolvida" ? (latestDevolucaoByInspectionId.get(i.id) ?? null) : null,
  }));
}
