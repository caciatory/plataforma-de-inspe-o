"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveParceiroAction(
  inspectionId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const parceiroNome = (formData.get("parceiro_nome") as string) || null;
  const parceiroLogoUrl = (formData.get("parceiro_logo_url") as string) || null;
  const parceiroTelefone = (formData.get("parceiro_telefone") as string) || null;

  const { error } = await supabase
    .from("inspections")
    .update({ parceiro_nome: parceiroNome, parceiro_logo_url: parceiroLogoUrl, parceiro_telefone: parceiroTelefone })
    .eq("id", inspectionId);

  if (error) {
    console.error("saveParceiroAction failed", error);
    return { error: "Não foi possível guardar os dados do parceiro. Tente novamente." };
  }

  return {};
}

export async function attachCapaPhotoAction(
  inspectionId: string,
  url: string
): Promise<{ error?: string; photoId?: string }> {
  const supabase = await createClient();

  const { data: photo, error } = await supabase
    .from("photos")
    .insert({ inspection_id: inspectionId, contexto: "capa", item_response_id: null, url })
    .select("id")
    .single();

  if (error || !photo) {
    console.error("attachCapaPhotoAction failed", error);
    return { error: "Não foi possível anexar a foto de capa. Tente novamente." };
  }

  return { photoId: photo.id };
}

export async function deleteCapaPhotoAction(photoId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("photos").delete().eq("id", photoId);

  if (error) {
    console.error("deleteCapaPhotoAction failed", error);
    return { error: "Não foi possível remover a foto. Tente novamente." };
  }

  return {};
}
