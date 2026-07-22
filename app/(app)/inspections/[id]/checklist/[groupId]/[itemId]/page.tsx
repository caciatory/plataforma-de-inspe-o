// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/page.tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria, findNextItemId } from "@/lib/checklist/progress";
import { deriveSiblingRows } from "@/lib/checklist/siblings";
import { ItemClassificacaoForm } from "./item-classificacao-form";
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
    .select("id, nome, tipo, qtd_pontos_medicao, observacoes")
    .eq("id", itemId)
    .eq("group_id", groupId)
    .single();

  if (!item) notFound();

  const [{ data: response }, { data: groupItems, error: groupItemsError }, { data: groupResponses }] =
    await Promise.all([
      supabase
        .from("checklist_item_responses")
        .select("id, classificacao, observacao")
        .eq("inspection_id", id)
        .eq("item_template_id", itemId)
        .maybeSingle(),
      supabase
        .from("checklist_item_templates")
        .select("id, subcategoria, nome, grupo_replicacao")
        .eq("group_id", groupId),
      supabase
        .from("checklist_item_responses")
        .select("item_template_id, status, classificacao")
        .eq("inspection_id", id),
    ]);

  if (groupItemsError) {
    console.error("checklist item page group fetch failed", groupItemsError);
  }

  let photos: { id: string; url: string }[] = [];
  let valoresUm: number[] = [];

  if (response) {
    const [{ data: photoRows }, { data: measurement }] = await Promise.all([
      supabase.from("photos").select("id, url").eq("item_response_id", response.id).eq("contexto", "item"),
      item.tipo === "medicao"
        ? supabase.from("paint_measurements").select("valores_um").eq("item_response_id", response.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    photos = photoRows ?? [];
    valoresUm = measurement?.valores_um ?? [];
  }

  const subcategorias = groupItemsBySubcategoria(groupItems ?? [], []);
  const nextItemId = findNextItemId(subcategorias, itemId);
  const groupListUrl = `/inspections/${id}/checklist/${groupId}`;
  const nextUrl = nextItemId ? `/inspections/${id}/checklist/${groupId}/${nextItemId}` : groupListUrl;

  const siblings = deriveSiblingRows(itemId, groupItems ?? [], groupResponses ?? []);

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
          initialValores={valoresUm}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
        />
      ) : (
        <ItemClassificacaoForm
          inspectionId={id}
          itemTemplateId={itemId}
          nome={item.nome}
          nextUrl={nextUrl}
          groupListUrl={groupListUrl}
          initialClassificacao={response?.classificacao ?? null}
          initialObservacao={response?.observacao ?? null}
          initialPhotos={photos}
          siblings={siblings}
        />
      )}
    </div>
  );
}
