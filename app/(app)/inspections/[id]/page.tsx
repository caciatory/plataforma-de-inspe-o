import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeInspectionValidity } from "@/lib/inspection/validity";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { getCurrentUser } from "@/lib/auth/session";
import { computeGroupProgress, type GroupProgress } from "@/lib/checklist/progress";
import { mergeHistorico } from "@/lib/inspection/historico";
import { SubmitInspectionPanel } from "./submit-inspection-panel";
import { AdminActionsPanel } from "./admin-actions-panel";

const STATUS_LABEL: Record<InspectionStatus, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  devolvida: "Devolvida",
  aprovada: "Aprovada",
  cancelada: "Cancelada",
};

const STATUS_PILL_CLASS: Record<InspectionStatus, string> = {
  rascunho: "status-pill status-pill--neutral",
  aguardando_aprovacao: "status-pill status-pill--warning",
  devolvida: "status-pill status-pill--warning",
  aprovada: "status-pill status-pill--success",
  cancelada: "status-pill status-pill--danger",
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function InspectionSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: inspection }, { data: score }] = await Promise.all([
    supabase.from("inspections").select("*, vehicle_data(*), client_data(*), users(nome)").eq("id", id).single(),
    supabase.from("inspection_score").select("nota_geral, classificacao").eq("inspection_id", id).maybeSingle(),
  ]);

  if (!inspection) notFound();

  const validity = computeInspectionValidity(
    inspection.certificado_emitido_em,
    inspection.vehicle_data?.quilometragem ?? 0
  );

  const status = inspection.status as InspectionStatus;
  const currentUser = await getCurrentUser();
  const editable = currentUser ? isInspectionEditable(status, currentUser.role) : false;
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

  let historico: ReturnType<typeof mergeHistorico> = [];
  if (currentUser?.role === "admin") {
    const [
      { data: reviewEvents, error: reviewEventsError },
      { data: auditEntries, error: auditEntriesError },
    ] = await Promise.all([
      supabase
        .from("review_events")
        .select("tipo, motivo, timestamp, users(nome)")
        .eq("inspection_id", id)
        .order("timestamp", { ascending: false }),
      supabase
        .from("audit_log_entries")
        .select("descricao, timestamp, users(nome)")
        .eq("inspection_id", id)
        .order("timestamp", { ascending: false }),
    ]);
    if (reviewEventsError || auditEntriesError) {
      console.error("inspection historico fetch failed", { reviewEventsError, auditEntriesError });
    }
    historico = mergeHistorico(
      (reviewEvents ?? []) as unknown as Parameters<typeof mergeHistorico>[0],
      (auditEntries ?? []) as unknown as Parameters<typeof mergeHistorico>[1]
    );
  }

  return (
    <main className="page">
      <Link href={currentUser?.role === "admin" ? "/admin" : "/inspections"} className="back-link">
        ← Voltar a {currentUser?.role === "admin" ? "todas as inspeções" : "minhas inspeções"}
      </Link>
      <h1>Resumo da inspeção</h1>
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
              {inspection.vehicle_data?.ano_fabrico ? ` (${inspection.vehicle_data.ano_fabrico})` : ""}
            </dd>
          </div>
          {inspection.vehicle_data?.cor && (
            <div className="summary-grid__row">
              <dt className="label">Cor</dt>
              <dd>{inspection.vehicle_data.cor}</dd>
            </div>
          )}
          <div className="summary-grid__row">
            <dt className="label">Cliente</dt>
            <dd>
              {inspection.client_data?.nome_solicitante} ({capitalize(inspection.tipo_cliente)})
            </dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Objetivo</dt>
            <dd>{capitalize(inspection.objetivo)}</dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Técnico</dt>
            <dd>{inspection.users?.nome ?? "—"}</dd>
          </div>
          <div className="summary-grid__row">
            <dt className="label">Data de abertura</dt>
            <dd>{new Date(inspection.data_abertura).toLocaleDateString("pt-PT")}</dd>
          </div>
          {inspection.data_finalizacao && (
            <div className="summary-grid__row">
              <dt className="label">Data de finalização</dt>
              <dd>{new Date(inspection.data_finalizacao).toLocaleDateString("pt-PT")}</dd>
            </div>
          )}
          {score && (
            <div className="summary-grid__row">
              <dt className="label">Nota</dt>
              <dd>
                {score.nota_geral.toFixed(1)} ({score.classificacao})
              </dd>
            </div>
          )}
          <div className="summary-grid__row">
            <dt className="label">Estado</dt>
            <dd>
              <span className={STATUS_PILL_CLASS[status]}>{STATUS_LABEL[status]}</span>
            </dd>
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

      <div className="summary-actions">
        <Link href={`/inspections/${id}/checklist`} className="btn btn-primary summary-cta">
          Ir para a checklist
        </Link>

        {editable && (
          <Link href={`/inspections/${id}/editar`} className="btn btn-secondary summary-cta">
            Editar dados básicos
          </Link>
        )}

        {editable && currentUser?.role === "tecnico" && (
          <SubmitInspectionPanel
            inspectionId={id}
            label={status === "devolvida" ? "Reenviar para aprovação" : "Finalizar inspeção"}
            progress={progress}
          />
        )}

        {currentUser?.role === "admin" && <AdminActionsPanel inspectionId={id} status={status} />}

        {status === "aprovada" && (
          <button type="button" className="btn btn-secondary" disabled title="Em breve">
            Gerar relatório
          </button>
        )}
      </div>

      {currentUser?.role === "admin" && historico.length > 0 && (
        <section className="panel stack">
          <h2>Histórico</h2>
          <ul className="item-list">
            {historico.map((h, i) => (
              <li key={i} className="item-list__row">
                {h.tipo === "review" ? (
                  <>
                    <strong>{h.label}</strong> — {h.autor} — {new Date(h.timestamp).toLocaleString("pt-PT")}
                    {h.motivo && <p className="hint">{h.motivo}</p>}
                  </>
                ) : (
                  <>
                    {h.descricao} — {h.autor} — {new Date(h.timestamp).toLocaleString("pt-PT")}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
