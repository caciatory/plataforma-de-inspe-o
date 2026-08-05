"use server";

import { createClient } from "@/lib/supabase/server";
import { computeGroupProgress } from "@/lib/checklist/progress";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";

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

  if (inspectionError || !inspection || !isInspectionEditable(inspection.status as InspectionStatus)) {
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
