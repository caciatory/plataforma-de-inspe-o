"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SaveEscolhaState = { status: "idle" } | { status: "error"; message: string };
export type SaveMeasurementState = { status: "idle" } | { status: "error"; message: string };

function friendlyDbError(error: { code?: string; message?: string }, exigeFotoMessage: string): string {
  if (error.code === "23514") return exigeFotoMessage;
  return "Não foi possível guardar. Tente novamente.";
}

export async function saveEscolhaAction(
  _prevState: SaveEscolhaState,
  formData: FormData
): Promise<SaveEscolhaState> {
  const inspectionId = formData.get("inspectionId") as string;
  const itemTemplateId = formData.get("itemTemplateId") as string;
  const nextUrl = formData.get("nextUrl") as string;
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
      message: friendlyDbError(error, "Esta resposta exige pelo menos 1 foto anexada. Anexe uma foto antes de salvar."),
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

  redirect(nextUrl);
}

export type BatchItem = { itemTemplateId: string; opcaoId: string; observacao: string | null };

export async function applyOpcoesBatchAction(
  inspectionId: string,
  items: BatchItem[]
): Promise<{ error?: string }> {
  if (items.some((i) => !i.opcaoId)) {
    return { error: "Selecione uma opção em todos os itens do lote." };
  }

  const supabase = await createClient();

  const [{ data: templates }, { data: opcoes }] = await Promise.all([
    supabase
      .from("checklist_item_templates")
      .select("id, conjunto_opcao_id")
      .in("id", items.map((i) => i.itemTemplateId)),
    supabase
      .from("opcoes")
      .select("id, conjunto_id")
      .in("id", items.map((i) => i.opcaoId)),
  ]);

  const conjuntoByTemplateId = new Map((templates ?? []).map((t) => [t.id, t.conjunto_opcao_id]));
  const conjuntoByOpcaoId = new Map((opcoes ?? []).map((o) => [o.id, o.conjunto_id]));

  const hasInvalidItem = items.some(
    (i) => conjuntoByOpcaoId.get(i.opcaoId) !== conjuntoByTemplateId.get(i.itemTemplateId)
  );
  if (hasInvalidItem) {
    return { error: "Opção inválida em um dos itens do lote." };
  }

  const { error } = await supabase.rpc("apply_opcoes_batch", {
    p_inspection_id: inspectionId,
    p_items: items.map((i) => ({
      item_template_id: i.itemTemplateId,
      opcao_id: i.opcaoId,
      observacao: i.observacao,
    })),
  });

  if (error) {
    console.error("applyOpcoesBatchAction failed", error);
    return {
      error: friendlyDbError(
        error,
        "Um dos itens do lote exige pelo menos 1 foto anexada. Anexe a foto e confirme de novo."
      ),
    };
  }

  return {};
}
