// app/(app)/inspections/[id]/checklist/[groupId]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { groupItemsBySubcategoria, SEM_SUBCATEGORIA_PARAM } from "@/lib/checklist/progress";
import {
  ChecklistItemTable,
  type TableItem,
  type TableResponse,
  type TableOpcao,
  type TablePhoto,
  type TableMedicaoResultado,
  type TableMedicaoValores,
} from "./checklist-item-table";
import type { SiblingSourceItem } from "@/lib/checklist/siblings";
import { isInspectionEditable, type InspectionStatus } from "@/lib/inspection/status";
import { getCurrentUser } from "@/lib/auth/session";

export default async function ChecklistGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; groupId: string }>;
  searchParams: Promise<{ sub?: string }>;
}) {
  const { id, groupId } = await params;
  const { sub } = await searchParams;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("checklist_group_templates")
    .select("id, nome")
    .eq("id", groupId)
    .eq("ativo", true)
    .single();

  if (!group) notFound();

  const { data: firstActiveGroup } = await supabase
    .from("checklist_group_templates")
    .select("id")
    .eq("ativo", true)
    .order("ordem")
    .limit(1)
    .maybeSingle();
  const isFirstGroup = firstActiveGroup?.id === groupId;

  const { data: inspection } = await supabase.from("inspections").select("status").eq("id", id).single();
  const currentUser = await getCurrentUser();
  const editable =
    inspection && currentUser ? isInspectionEditable(inspection.status as InspectionStatus, currentUser.role) : false;

  const [
    { data: items, error: itemsError },
    { data: responses, error: responsesError },
    { data: statuses, error: statusesError },
  ] = await Promise.all([
    supabase
      .from("checklist_item_templates")
      .select("id, subcategoria, nome, tipo, conjunto_opcao_id, unidade_medicao, qtd_pontos_medicao, grupo_replicacao")
      .eq("group_id", groupId),
    supabase
      .from("checklist_item_responses")
      .select("id, item_template_id, opcao_id, resposta_texto, resposta_data, observacao")
      .eq("inspection_id", id),
    supabase.from("checklist_item_status").select("item_template_id, respondido").eq("inspection_id", id),
  ]);

  if (itemsError || responsesError || statusesError) {
    console.error("checklist group data fetch failed", { itemsError, responsesError, statusesError });
  }

  const allItems = items ?? [];
  const allResponses = responses ?? [];
  const respondidoByItemId = new Map((statuses ?? []).map((s) => [s.item_template_id, s.respondido]));

  const subcategoriaBuckets = groupItemsBySubcategoria(
    allItems.map((i) => ({ id: i.id, subcategoria: i.subcategoria, nome: i.nome })),
    statuses ?? []
  );
  const subcategoriaNames = subcategoriaBuckets.map((b) => b.subcategoria);
  const activeSubcategoria =
    sub === SEM_SUBCATEGORIA_PARAM ? null : sub && subcategoriaNames.includes(sub) ? sub : (subcategoriaNames[0] ?? null);

  const activeBucket = subcategoriaBuckets.find((b) => b.subcategoria === activeSubcategoria);
  const pendentes = activeBucket ? activeBucket.items.filter((i) => !i.respondido).length : 0;
  const total = activeBucket?.items.length ?? 0;

  const activeItems = allItems.filter((i) => i.subcategoria === activeSubcategoria);

  const conjuntoIds = Array.from(
    new Set(activeItems.map((i) => i.conjunto_opcao_id).filter((v): v is string => v !== null))
  );
  const medicaoResponseIds = allResponses
    .filter((r) => activeItems.some((i) => i.id === r.item_template_id && i.tipo === "medicao"))
    .map((r) => r.id);
  const groupResponseIds = allResponses.map((r) => r.id);

  const [
    { data: opcoes, error: opcoesError },
    { data: medicaoResultados, error: resultadosError },
    { data: medicaoValores, error: valoresError },
    { data: photos, error: photosError },
  ] = await Promise.all([
    conjuntoIds.length > 0
      ? supabase
          .from("opcoes")
          .select("id, conjunto_id, label, ordem, exige_foto")
          .in("conjunto_id", conjuntoIds)
          .order("ordem")
      : Promise.resolve({ data: [] as TableOpcao[], error: null }),
    medicaoResponseIds.length > 0
      ? supabase.from("medicoes_resultado").select("item_response_id, resultado").in("item_response_id", medicaoResponseIds)
      : Promise.resolve({ data: [] as TableMedicaoResultado[], error: null }),
    medicaoResponseIds.length > 0
      ? supabase.from("medicoes").select("item_response_id, valores").in("item_response_id", medicaoResponseIds)
      : Promise.resolve({ data: [] as TableMedicaoValores[], error: null }),
    groupResponseIds.length > 0
      ? supabase
          .from("photos")
          .select("id, url, item_response_id")
          .eq("contexto", "item")
          .in("item_response_id", groupResponseIds)
      : Promise.resolve({ data: [] as TablePhoto[], error: null }),
  ]);

  if (opcoesError || resultadosError || valoresError || photosError) {
    console.error("checklist group extra data fetch failed", { opcoesError, resultadosError, valoresError, photosError });
  }

  const tableItems: TableItem[] = activeItems.map((i) => ({
    id: i.id,
    nome: i.nome,
    tipo: i.tipo,
    conjunto_opcao_id: i.conjunto_opcao_id,
    unidade_medicao: i.unidade_medicao,
    qtd_pontos_medicao: i.qtd_pontos_medicao,
    grupo_replicacao: i.grupo_replicacao,
  }));

  const tableResponses: TableResponse[] = allResponses.map((r) => ({
    id: r.id,
    item_template_id: r.item_template_id,
    opcao_id: r.opcao_id,
    resposta_texto: r.resposta_texto,
    resposta_data: r.resposta_data,
    observacao: r.observacao,
    respondido: respondidoByItemId.get(r.item_template_id) ?? false,
  }));

  const allGroupItemsForSiblings: SiblingSourceItem[] = allItems.map((i) => ({
    id: i.id,
    nome: i.nome,
    grupo_replicacao: i.grupo_replicacao,
  }));

  return (
    <div className="stack">
      {isFirstGroup && editable && (
        <div className="panel page-header">
          <p className="hint">Marca, modelo, cor, quilometragem e demais dados básicos já foram registados na criação da inspeção.</p>
          <Link href={`/inspections/${id}/editar`} className="btn btn-secondary">
            Editar dados básicos
          </Link>
        </div>
      )}
      <h1>{group.nome}</h1>
      <h2>
        {activeSubcategoria ?? "Sem subcategoria"} — {pendentes} pendente{pendentes === 1 ? "" : "s"} de {total}
      </h2>
      <ChecklistItemTable
        inspectionId={id}
        items={tableItems}
        allGroupItems={allGroupItemsForSiblings}
        responses={tableResponses}
        opcoes={opcoes ?? []}
        photos={photos ?? []}
        medicaoResultados={medicaoResultados ?? []}
        medicaoValores={medicaoValores ?? []}
        editable={editable}
      />
    </div>
  );
}
