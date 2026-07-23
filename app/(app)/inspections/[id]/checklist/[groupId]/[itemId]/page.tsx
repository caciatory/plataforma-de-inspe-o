// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria, findNextItemId } from "@/lib/checklist/progress";
import { deriveSiblingRows } from "@/lib/checklist/siblings";
import { ItemEscolhaForm } from "./item-escolha-form";
import { ItemMedicaoForm } from "./item-medicao-form";

export default async function ChecklistItemPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string; itemId: string }>;
}) {
  const { id, groupId, itemId } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("checklist_item_templates")
    .select("id, nome, tipo, qtd_pontos_medicao, observacoes, conjunto_opcao_id, unidade_medicao")
    .eq("id", itemId)
    .eq("group_id", groupId)
    .single();

  if (!item) notFound();

  const [{ data: response }, { data: groupItems, error: groupItemsError }, { data: groupResponses }, { data: opcoes }] =
    await Promise.all([
      supabase
        .from("checklist_item_responses")
        .select("id, opcao_id, observacao")
        .eq("inspection_id", id)
        .eq("item_template_id", itemId)
        .maybeSingle(),
      supabase
        .from("checklist_item_templates")
        .select("id, subcategoria, nome, grupo_replicacao")
        .eq("group_id", groupId),
      supabase.from("checklist_item_responses").select("item_template_id, opcao_id").eq("inspection_id", id),
      item.tipo === "escolha" && item.conjunto_opcao_id
        ? supabase
            .from("opcoes")
            .select("id, label, ordem, exige_foto")
            .eq("conjunto_id", item.conjunto_opcao_id)
            .order("ordem")
        : Promise.resolve({ data: [] as { id: string; label: string; ordem: number; exige_foto: boolean }[] }),
    ]);

  if (groupItemsError) {
    console.error("checklist item page group fetch failed", groupItemsError);
  }

  let photos: { id: string; url: string }[] = [];
  let valores: number[] = [];

  if (response) {
    const [{ data: photoRows }, { data: measurement }] = await Promise.all([
      supabase.from("photos").select("id, url").eq("item_response_id", response.id).eq("contexto", "item"),
      item.tipo === "medicao"
        ? supabase.from("medicoes").select("valores").eq("item_response_id", response.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    photos = photoRows ?? [];
    valores = measurement?.valores ?? [];
  }

  const subcategorias = groupItemsBySubcategoria(groupItems ?? [], []);
  const nextItemId = findNextItemId(subcategorias, itemId);
  const groupListUrl = `/inspections/${id}/checklist/${groupId}`;
  const nextUrl = nextItemId ? `/inspections/${id}/checklist/${groupId}/${nextItemId}` : groupListUrl;

  const opcaoLabelById = new Map((opcoes ?? []).map((o) => [o.id, o.label]));
  const siblings = deriveSiblingRows(itemId, groupItems ?? [], groupResponses ?? [], opcaoLabelById);

  return (
    <div className="stack">
      <h1>{item.nome}</h1>
      {item.observacoes && <p className="hint">{item.observacoes}</p>}
      {item.tipo === "medicao" ? (
        <ItemMedicaoForm
          inspectionId={id}
          itemTemplateId={itemId}
          nextUrl={nextUrl}
          qtdPontos={item.qtd_pontos_medicao as number}
          unidadeMedicao={item.unidade_medicao}
          initialValores={valores}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
        />
      ) : (
        <ItemEscolhaForm
          inspectionId={id}
          itemTemplateId={itemId}
          nome={item.nome}
          nextUrl={nextUrl}
          groupListUrl={groupListUrl}
          opcoes={opcoes ?? []}
          initialOpcaoId={response?.opcao_id ?? null}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
          siblings={siblings}
        />
      )}
    </div>
  );
}
