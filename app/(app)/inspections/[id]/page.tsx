import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeInspectionValidity } from "@/lib/inspection/validity";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { computeGroupProgress, type GroupProgress } from "@/lib/checklist/progress";
import { SubmitInspectionPanel } from "./submit-inspection-panel";

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

  const status = inspection.status as InspectionStatus;
  const editable = isInspectionEditable(status);
  let progress: GroupProgress[] = [];
  let motivoDevolucao: string | null = null;

  if (editable) {
    const [
      { data: groups, error: groupsError },
      { data: items, error: itemsError },
      { data: statuses, error: statusesError },
    ] = await Promise.all([
      supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
      supabase.from("checklist_item_templates").select("id, group_id"),
      supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
    ]);

    if (groupsError || itemsError || statusesError) {
      console.error("inspection summary progress fetch failed", { groupsError, itemsError, statusesError });
    }

    progress = computeGroupProgress(groups ?? [], items ?? [], statuses ?? []);

    if (status === "devolvida") {
      const { data: devolucao } = await supabase
        .from("review_events")
        .select("motivo")
        .eq("inspection_id", id)
        .eq("tipo", "devolucao")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      motivoDevolucao = devolucao?.motivo ?? null;
    }
  }

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

        {motivoDevolucao && (
          <p className="status-banner status-banner--warning">Motivo da devolução: {motivoDevolucao}</p>
        )}
      </div>

      <Link href={`/inspections/${id}/checklist`} className="btn btn-primary summary-cta">
        Ir para a checklist
      </Link>

      {editable && (
        <SubmitInspectionPanel
          inspectionId={id}
          label={status === "devolvida" ? "Reenviar para aprovação" : "Finalizar inspeção"}
          progress={progress}
        />
      )}
    </main>
  );
}
