export type ItemResponseStatus = "pendente" | "respondido" | "NF";

export type GroupTemplate = { id: string; ordem: number; nome: string };
export type ItemTemplate = { id: string; group_id: string };
export type ItemResponseRow = { item_template_id: string; status: ItemResponseStatus };
export type GroupProgress = { id: string; ordem: number; nome: string; pendentes: number; total: number };

export function isItemPending(status: ItemResponseStatus | undefined): boolean {
  return status === undefined || status === "pendente";
}

export function computeGroupProgress(
  groups: GroupTemplate[],
  items: ItemTemplate[],
  responses: ItemResponseRow[]
): GroupProgress[] {
  const statusByItemId = new Map(responses.map((r) => [r.item_template_id, r.status]));
  const itemsByGroupId = new Map<string, ItemTemplate[]>();
  for (const item of items) {
    const list = itemsByGroupId.get(item.group_id) ?? [];
    list.push(item);
    itemsByGroupId.set(item.group_id, list);
  }

  return groups
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((group) => {
      const groupItems = itemsByGroupId.get(group.id) ?? [];
      const pendentes = groupItems.filter((item) => isItemPending(statusByItemId.get(item.id))).length;
      return { id: group.id, ordem: group.ordem, nome: group.nome, pendentes, total: groupItems.length };
    });
}

export type ItemTemplateDetail = { id: string; subcategoria: string | null; nome: string };
export type ChecklistItemStatus = { id: string; nome: string; status: ItemResponseStatus };
export type SubcategoriaGroup = { subcategoria: string | null; items: ChecklistItemStatus[] };

export function groupItemsBySubcategoria(
  items: ItemTemplateDetail[],
  responses: ItemResponseRow[]
): SubcategoriaGroup[] {
  const statusByItemId = new Map(responses.map((r) => [r.item_template_id, r.status]));
  const sorted = items.slice().sort((a, b) => {
    const subA = a.subcategoria ?? "";
    const subB = b.subcategoria ?? "";
    if (subA !== subB) return subA.localeCompare(subB);
    return a.nome.localeCompare(b.nome);
  });

  const order: Array<string | null> = [];
  const bucket = new Map<string | null, ChecklistItemStatus[]>();
  for (const item of sorted) {
    const key = item.subcategoria;
    if (!bucket.has(key)) {
      bucket.set(key, []);
      order.push(key);
    }
    bucket.get(key)!.push({
      id: item.id,
      nome: item.nome,
      status: statusByItemId.get(item.id) ?? "pendente",
    });
  }

  return order.map((subcategoria) => ({ subcategoria, items: bucket.get(subcategoria)! }));
}
