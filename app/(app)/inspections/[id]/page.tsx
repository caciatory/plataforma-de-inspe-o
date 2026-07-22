import { notFound } from "next/navigation";
import Link from "next/link";
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
    <main className="page">
      <h1>Inspeção criada</h1>
      <div className="panel stack">
        <dl className="summary-grid">
          <div className="summary-grid__row">
            <dt className="label">Matrícula</dt>
            <dd>{inspection.vehicle_data?.matricula}</dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Veículo</dt>
            <dd>
              {inspection.vehicle_data?.marca} {inspection.vehicle_data?.modelo}
            </dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Cliente</dt>
            <dd>
              {inspection.client_data?.nome_solicitante} ({inspection.tipo_cliente})
            </dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Objetivo</dt>
            <dd>{inspection.objetivo}</dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Estado</dt>
            <dd>{inspection.status}</dd>
          </div>
        </dl>

        {validity.status === "valida" && (
          <p className="validity-note validity-note--valid">
            Válida até {validity.validoAte!.toLocaleDateString("pt-PT")} (até {validity.kmLimite} km)
          </p>
        )}
        {validity.status === "expirada" && (
          <p className="validity-note validity-note--expired">
            Expirada em {validity.validoAte!.toLocaleDateString("pt-PT")} (válida para até 100km rodados desde a
            inspeção)
          </p>
        )}
      </div>

      <Link href={`/inspections/${id}/checklist`} className="btn btn-primary summary-cta">
        Ir para a checklist
      </Link>
    </main>
  );
}
