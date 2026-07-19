import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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
      <p>
        <Link href={`/inspections/${id}/checklist`}>Ir para a checklist</Link>
      </p>
    </main>
  );
}
