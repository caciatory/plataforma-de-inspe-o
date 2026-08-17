"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAdminEdit } from "@/lib/audit/log";

export type SaveEscolhaState = { status: "idle" } | { status: "error"; message: string };
export type SaveMeasurementState = { status: "idle" } | { status: "error"; message: string } | { status: "success" };

function friendlyDbError(
  error: { code?: string; message?: string },
  exigeFotoMessage: string,
  exigeComentarioMessage?: string
): string {
  if (error.code === "23514") {
    if (exigeComentarioMessage && error.message?.includes("COMENTARIO_OBRIGATORIO")) {
      return exigeComentarioMessage;
    }
    return exigeFotoMessage;
  }
  return "Não foi possível guardar. Tente novamente.";
}

export async function saveEscolhaAction(
  _prevState: SaveEscolhaState,
  formData: FormData
): Promise<SaveEscolhaState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const opcaoId = formData.get("opcao_id") as string;
  const observacao = (formData.get("observacao") as string) || null;

  if (!opcaoId) {
    return { status: "error", message: "Selecione uma opção." };
  }

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("checklist_item_templates")
    .select("conjunto_opcao_id")
    .eq("id", itemTemplateId)
    .single();

  const { data: opcao } = await supabase
    .from("opcoes")
    .select("id")
    .eq("id", opcaoId)
    .eq("conjunto_id", item?.conjunto_opcao_id ?? "")
    .maybeSingle();

  if (!opcao) {
    return { status: "error", message: "Opção inválida para este item." };
  }

  const { error } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId, opcao_id: opcaoId, observacao },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("saveEscolhaAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(
        error,
        "Esta resposta exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar.",
        "Esta resposta exige um comentário. Escreva uma observação antes de salvar."
      ),
    };
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { status: "idle" };
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

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { photoId: photo.id };
}

export async function deletePhotoAction(photoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("photos")
    .delete()
    .eq("id", photoId)
    .select("inspection_id, item_response_id")
    .single();

  if (error || !deleted) {
    console.error("deletePhotoAction failed", error);
    return { error: "Não foi possível remover a foto. Tente novamente." };
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    const { data: response } = await supabase
      .from("checklist_item_responses")
      .select("item_template_id")
      .eq("id", deleted.item_response_id)
      .single();
    if (response) {
      await recordAdminEdit(supabase, {
        inspectionId: deleted.inspection_id,
        itemTemplateId: response.item_template_id,
        adminId: currentUser.id,
      });
    }
  }

  return {};
}

export async function saveMeasurementAction(
  _prevState: SaveMeasurementState,
  formData: FormData
): Promise<SaveMeasurementState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const valores = formData.getAll("valor").map(Number);
  const observacao = (formData.get("observacao") as string) || null;

  if (valores.length === 0 || valores.some((v) => Number.isNaN(v))) {
    return { status: "error", message: "Preencha todos os valores de medição com números válidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_medicao", {
    p_inspection_id: inspectionId,
    p_item_template_id: itemTemplateId,
    p_valores: valores,
    p_observacao: observacao,
  });

  if (error) {
    console.error("saveMeasurementAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Este resultado exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
    };
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { status: "success" };
}

export type SaveTextoState = { status: "idle" } | { status: "error"; message: string };

export async function saveTextoAction(
  _prevState: SaveTextoState,
  formData: FormData
): Promise<SaveTextoState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const respostaTexto = ((formData.get("resposta_texto") as string) || "").trim();
  const observacao = (formData.get("observacao") as string) || null;

  if (!respostaTexto) {
    return { status: "error", message: "Preencha o campo antes de salvar." };
  }

  const supabase = await createClient();

  // ponytail: check_exige_foto (RF-16) only ever raises for opcao_id/medicao
  // responses (see migration 00033) — texto never sets opcao_id, so the
  // 23514 branch below can't actually fire today. Kept for symmetry with
  // saveEscolhaAction/saveMeasurementAction and in case a future opcao_id
  // gets attached to a texto-typed item.
  const { error } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId, resposta_texto: respostaTexto, observacao },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("saveTextoAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Esta resposta exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
    };
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { status: "idle" };
}

export type SaveDataState = { status: "idle" } | { status: "error"; message: string };

export async function saveDataAction(
  _prevState: SaveDataState,
  formData: FormData
): Promise<SaveDataState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const respostaData = (formData.get("resposta_data") as string) || "";
  const observacao = (formData.get("observacao") as string) || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(respostaData)) {
    return { status: "error", message: "Informe uma data válida." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("checklist_item_responses")
    .upsert(
      { inspection_id: inspectionId, item_template_id: itemTemplateId, resposta_data: respostaData, observacao },
      { onConflict: "inspection_id,item_template_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("saveDataAction failed", error);
    return {
      status: "error",
      message: friendlyDbError(error, "Esta resposta exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
    };
  }

  const currentUser = await getCurrentUser();
  if (currentUser?.role === "admin") {
    await recordAdminEdit(supabase, { inspectionId, itemTemplateId, adminId: currentUser.id });
  }

  return { status: "idle" };
}
