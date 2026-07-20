"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ITEM_CLASSIFICACOES = ["otimo", "medio", "ruim", "NF"] as const;
type ItemClassificacao = (typeof ITEM_CLASSIFICACOES)[number];

export type SaveClassificacaoState = { status: "idle" } | { status: "error"; message: string };
export type SaveMeasurementState = { status: "idle" } | { status: "error"; message: string };

function friendlyDbError(error: { code?: string; message?: string }, ruimMessage: string): string {
  if (error.code === "23514") return ruimMessage;
  return "Não foi possível guardar. Tente novamente.";
}

export async function saveClassificacaoAction(
  _prevState: SaveClassificacaoState,
  formData: FormData
): Promise<SaveClassificacaoState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const nextUrl = formData.get("nextUrl") as string;
  const classificacao = formData.get("classificacao") as string;
  const observacao = (formData.get("observacao") as string) || null;

  if (!ITEM_CLASSIFICACOES.includes(classificacao as ItemClassificacao)) {
    return { status: "error", message: "Selecione uma classificação." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId, classificacao, observacao },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("saveClassificacaoAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Classificação 'ruim' exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
    };
  }

  redirect(nextUrl);
}

export async function attachPhotoAction(
  inspectionId: string,
  itemTemplateId: string,
  url: string
): Promise<{ error?: string; photoId?: string }> {
  const supabase = await createClient();

  const { data: response, error: upsertError } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (upsertError || !response) {
    console.error("attachPhotoAction upsert failed", upsertError);
    return { error: "Não foi possível anexar a foto. Tente novamente." };
  }

  const { data: photo, error: photoError } = await supabase
    .from("photos")
    .insert({ inspection_id: inspectionId, item_response_id: response.id, contexto: "item", url })
    .select("id")
    .single();

  if (photoError || !photo) {
    console.error("attachPhotoAction insert failed", photoError);
    return { error: "Não foi possível anexar a foto. Tente novamente." };
  }

  return { photoId: photo.id };
}

export async function deletePhotoAction(photoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("photos").delete().eq("id", photoId);

  if (error) {
    console.error("deletePhotoAction failed", error);
    return { error: "Não foi possível remover a foto. Tente novamente." };
  }

  return {};
}

export async function saveMeasurementAction(
  _prevState: SaveMeasurementState,
  formData: FormData
): Promise<SaveMeasurementState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const nextUrl = formData.get("nextUrl") as string;
  const valores = formData.getAll("valor").map(Number);
  const observacao = (formData.get("observacao") as string) || null;

  if (valores.length === 0 || valores.some((v) => Number.isNaN(v))) {
    return { status: "error", message: "Preencha todos os valores de medição com números válidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_paint_measurement", {
    p_inspection_id: inspectionId,
    p_item_template_id: itemTemplateId,
    p_valores_um: valores,
    p_observacao: observacao,
  });

  if (error) {
    console.error("saveMeasurementAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Este resultado indica reparação de colisão — anexe pelo menos 1 foto antes de salvar."),
    };
  }

  redirect(nextUrl);
}
