import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { computeGroupProgress, computeSubcategoriaProgress } from "@/lib/checklist/progress";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { ChecklistNavGroup } from "./checklist-nav-group";
import { DevFillButton } from "./dev-fill-button";

export default async function ChecklistLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inspection } = await supabase.from("inspections").select("id, status").eq("id", id).single();

  if (!inspection) notFound();

  const currentUser = await getCurrentUser();
  const editable = currentUser
    ? isInspectionEditable(inspection.status as InspectionStatus, currentUser.role)
    : false;

  const [
    { data: groups, error: groupsError },
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
  ] = await Promise.all([
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase.from("checklist_item_templates").select("id, group_id, subcategoria"),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
  ]);

  if (groupsError || itemsError || responsesError) {
    console.error("checklist layout data fetch failed", { groupsError, itemsError, responsesError });
  }

  const progress = computeGroupProgress(groups ?? [], items ?? [], responses ?? []);
  const subcategoriaProgress = computeSubcategoriaProgress(items ?? [], responses ?? []);
  const subcategoriasByGroupId = new Map(subcategoriaProgress.map((g) => [g.id, g.subcategorias]));

  return (
    <div className="checklist-shell">
      <nav className="checklist-nav identity-bar" aria-label="Grupos da checklist">
        <Link href={`/inspections/${id}`} className="checklist-nav__link checklist-nav__back">
          ← Voltar ao resumo
        </Link>
        {editable && (
          <Link href={`/inspections/${id}/editar`} className="checklist-nav__link">
            Editar dados básicos
          </Link>
        )}
        <h2 className="checklist-nav__title">
          Checklist
          {!editable && (
            <span className="checklist-nav__readonly-badge" role="status">
              Só leitura
            </span>
          )}
        </h2>
        {!editable && (
          <p className="checklist-nav__readonly-note">Esta inspeção já foi enviada e não pode mais ser editada.</p>
        )}
        {currentUser?.role === "admin" && inspection.status === "aprovada" && (
          <p className="status-banner status-banner--warning">
            Esta inspeção já está aprovada — editar aqui recalcula a nota automaticamente.
          </p>
        )}
        {process.env.NODE_ENV === "development" && editable && <DevFillButton inspectionId={id} />}
        <ul className="checklist-nav__list">
          {progress.map((group) => (
            <ChecklistNavGroup
              key={group.id}
              inspectionId={id}
              group={group}
              subcategorias={subcategoriasByGroupId.get(group.id) ?? []}
            />
          ))}
        </ul>
      </nav>
      <main className="checklist-main">{children}</main>
    </div>
  );
}
