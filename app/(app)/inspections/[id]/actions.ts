"use server";

import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress } from "@/lib/checklist/progress";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { getCurrentUser } from "@/lib/auth/session";

export type SubmitInspectionState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

export async function submitInspectionAction(
  _prevState: SubmitInspectionState,
  formData: FormData
): Promise<SubmitInspectionState> {
  const inspectionId = formData.get("inspectionId") as string;
  const supabase = await createClient();

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspections")
    .select("status")
    .eq("id", inspectionId)
    .single();

  if (inspectionError || !inspection || !isInspectionEditable(inspection.status as InspectionStatus, "tecnico")) {
    return { status: "error", message: "Esta inspeção já não pode ser enviada." };
  }

  const [
    { data: groups, error: groupsError },
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
  ] = await Promise.all([
    supabase.from("checklist_group_templates").select("id, ordem, nome").eq("ativo", true).order("ordem"),
    supabase.from("checklist_item_templates").select("id, group_id"),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", inspectionId),
  ]);

  if (groupsError || itemsError || responsesError) {
    console.error("submitInspectionAction progress fetch failed", { groupsError, itemsError, responsesError });
    return { status: "error", message: "Não foi possível verificar as pendências. Tente novamente." };
  }

  if ((groups ?? []).length === 0) {
    console.error("submitInspectionAction found no active checklist groups");
    return { status: "error", message: "Não foi possível verificar as pendências. Tente novamente." };
  }

  const progress = computeGroupProgress(groups ?? [], items ?? [], responses ?? []);
  const totalPendentes = progress.reduce((sum, g) => sum + g.pendentes, 0);

  if (totalPendentes > 0) {
    return { status: "error", message: "Ainda há itens pendentes na checklist." };
  }

  const { error: updateError } = await supabase
    .from("inspections")
    .update({ status: "aguardando_aprovacao" })
    .eq("id", inspectionId);

  if (updateError) {
    console.error("submitInspectionAction update failed", updateError);
    return { status: "error", message: "Não foi possível enviar a inspeção. Tente novamente." };
  }

  return { status: "success" };
}

export type ReviewActionState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

export async function approveInspectionAction(
  _prevState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const inspectionId = formData.get("inspectionId") as string;
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem aprovar inspeções." };
  }

  const supabase = await createClient();
  const { data: inspection } = await supabase.from("inspections").select("status").eq("id", inspectionId).single();
  if (!inspection || inspection.status !== "aguardando_aprovacao") {
    return { status: "error", message: "Esta inspeção não está aguardando aprovação." };
  }

  const { error: reviewError } = await supabase
    .from("review_events")
    .insert({ inspection_id: inspectionId, tipo: "aprovacao", autor_id: user.id });
  if (reviewError) {
    console.error("approveInspectionAction review_events insert failed", reviewError);
    return { status: "error", message: "Não foi possível aprovar. Tente novamente." };
  }

  const { error: updateError } = await supabase
    .from("inspections")
    .update({ status: "aprovada" })
    .eq("id", inspectionId);
  if (updateError) {
    console.error("approveInspectionAction update failed", updateError);
    return { status: "error", message: "Não foi possível aprovar. Tente novamente." };
  }

  return { status: "success" };
}

export async function returnInspectionAction(
  _prevState: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const inspectionId = formData.get("inspectionId") as string;
  const motivo = ((formData.get("motivo") as string) || "").trim();
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { status: "error", message: "Apenas administradores podem devolver inspeções." };
  }
  if (!motivo) {
    return { status: "error", message: "Informe o motivo da devolução." };
  }

  const supabase = await createClient();
  const { data: inspection } = await supabase.from("inspections").select("status").eq("id", inspectionId).single();
  if (!inspection || inspection.status !== "aguardando_aprovacao") {
    return { status: "error", message: "Esta inspeção não está aguardando aprovação." };
  }

  const { error: reviewError } = await supabase
    .from("review_events")
    .insert({ inspection_id: inspectionId, tipo: "devolucao", autor_id: user.id, motivo });
  if (reviewError) {
    console.error("returnInspectionAction review_events insert failed", reviewError);
    return { status: "error", message: "Não foi possível devolver. Tente novamente." };
  }

  const { error: updateError } = await supabase
    .from("inspections")
    .update({ status: "devolvida" })
    .eq("id", inspectionId);
  if (updateError) {
    console.error("returnInspectionAction update failed", updateError);
    return { status: "error", message: "Não foi possível devolver. Tente novamente." };
  }

  return { status: "success" };
}
