import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeInspectionValidity } from "@/lib/inspection/validity";

export default async function InspectionSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: inspection } = await supabase
    .from("inspections")
    .select("*, vehicle_data(*), client_data(*)")
    .eq("id", id)
    .single();

  if (!inspection) notFound();

  const validity = computeInspectionValidity(
    inspection.certificado_emitido_em,
    inspection.vehicle_data?.quilometragem ?? 0
  );

  return (
    <main>
      <h1>Inspeção criada</h1>
      <p>Matrícula: {inspection.vehicle_data?.matricula}</p>
      <p>
        Veículo: {inspection.vehicle_data?.marca} {inspection.vehicle_data?.modelo}
      </p>
      <p>
        Cliente: {inspection.client_data?.nome_solicitante} ({inspection.tipo_cliente})
      </p>
      <p>Objetivo: {inspection.objetivo}</p>
      <p>Estado: {inspection.status}</p>
      {validity.status === "valida" && (
        <p>
          ✅ Válida até {validity.validoAte!.toLocaleDateString("pt-PT")} (até {validity.kmLimite} km)
        </p>
      )}
      {validity.status === "expirada" && (
        <p>
          ⚠️ Expirada em {validity.validoAte!.toLocaleDateString("pt-PT")} (válida para até 100km rodados desde a
          inspeção)
        </p>
      )}
      <p>
        <em>A checklist será implementada numa fase seguinte.</em>
      </p>
    </main>
  );
}
