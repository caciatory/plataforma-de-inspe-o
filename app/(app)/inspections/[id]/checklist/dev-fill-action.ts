// app/(app)/inspections/[id]/checklist/dev-fill-action.ts
// ponytail: dev-only test helper, not a técnico-facing feature. Fills every
// pending item with a plausible default so manual testing of the finalize
// flow doesn't require clicking through hundreds of items by hand. Gated at
// the server-action layer (not just the UI) so it can never run outside
// `next dev`.
"use server";

import { createClient } from "@/lib/supabase/server";

export type DevFillState = { status: "idle" } | { status: "error"; message: string } | { status: "success"; filled: number };

export async function devFillAllItemsAction(inspectionId: string): Promise<DevFillState> {
  if (process.env.NODE_ENV !== "development") {
    return { status: "error", message: "Disponível apenas em desenvolvimento." };
  }

  const supabase = await createClient();

  const [
    { data: groups, error: groupsError },
    { data: items, error: itemsError },
    { data: statuses, error: statusesError },
  ] = await Promise.all([
    supabase.from("checklist_group_templates").select("id").eq("ativo", true),
    supabase.from("checklist_item_templates").select("id, group_id, tipo, conjunto_opcao_id, qtd_pontos_medicao"),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", inspectionId),
  ]);

  if (groupsError || itemsError || statusesError) {
    console.error("devFillAllItemsAction fetch failed", { groupsError, itemsError, statusesError });
    return { status: "error", message: "Não foi possível carregar os itens da checklist." };
  }

  const activeGroupIds = new Set((groups ?? []).map((g) => g.id));
  const respondidoByItemId = new Map((statuses ?? []).map((s) => [s.item_template_id, s.respondido]));
  const pendingItems = (items ?? []).filter((i) => activeGroupIds.has(i.group_id) && !respondidoByItemId.get(i.id));

  const conjuntoIds = Array.from(
    new Set(pendingItems.filter((i) => i.tipo === "escolha" && i.conjunto_opcao_id).map((i) => i.conjunto_opcao_id as string))
  );

  const { data: opcoes } =
    conjuntoIds.length > 0
      ? await supabase.from("opcoes").select("id, conjunto_id, is_na, exige_foto, ordem").in("conjunto_id", conjuntoIds).order("ordem")
      : { data: [] as { id: string; conjunto_id: string; is_na: boolean; exige_foto: boolean; ordem: number }[] };

  // Prefer an option that doesn't need N.A. handling or a photo, so the
  // fill doesn't fail against check_exige_foto (RF-16); fall back to the
  // first non-N.A. option if every option in the set requires a photo.
  const opcaoByConjunto = new Map<string, string>();
  const fallbackOpcaoByConjunto = new Map<string, string>();
  for (const o of opcoes ?? []) {
    if (o.is_na) continue;
    if (!fallbackOpcaoByConjunto.has(o.conjunto_id)) fallbackOpcaoByConjunto.set(o.conjunto_id, o.id);
    if (!o.exige_foto && !opcaoByConjunto.has(o.conjunto_id)) opcaoByConjunto.set(o.conjunto_id, o.id);
  }

  const today = new Date().toISOString().slice(0, 10);
  let filled = 0;

  for (const item of pendingItems) {
    if (item.tipo === "escolha") {
      const opcaoId = item.conjunto_opcao_id
        ? (opcaoByConjunto.get(item.conjunto_opcao_id) ?? fallbackOpcaoByConjunto.get(item.conjunto_opcao_id))
        : undefined;
      if (!opcaoId) continue;
      const { error } = await supabase
        .from("checklist_item_responses")
        .upsert({ inspection_id: inspectionId, item_template_id: item.id, opcao_id: opcaoId }, { onConflict: "inspection_id,item_template_id" });
      if (!error) filled++;
    } else if (item.tipo === "medicao") {
      const valores = Array.from({ length: item.qtd_pontos_medicao ?? 1 }, () => 1);
      const { error } = await supabase.rpc("save_medicao", {
        p_inspection_id: inspectionId,
        p_item_template_id: item.id,
        p_valores: valores,
      });
      if (!error) filled++;
    } else if (item.tipo === "texto") {
      const { error } = await supabase
        .from("checklist_item_responses")
        .upsert(
          { inspection_id: inspectionId, item_template_id: item.id, resposta_texto: "Preenchido automaticamente (dev)" },
          { onConflict: "inspection_id,item_template_id" }
        );
      if (!error) filled++;
    } else if (item.tipo === "data") {
      const { error } = await supabase
        .from("checklist_item_responses")
        .upsert({ inspection_id: inspectionId, item_template_id: item.id, resposta_data: today }, { onConflict: "inspection_id,item_template_id" });
      if (!error) filled++;
    }
  }

  return { status: "success", filled };
}
