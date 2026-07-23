export type GroupTemplate = { id: string; ordem: number; nome: string };
export type ItemTemplate = { id: string; group_id: string };
export type ItemResponseRow = { item_template_id: string; respondido: boolean };
export type GroupProgress = { id: string; ordem: number; nome: string; pendentes: number; total: number };

export function isItemPending(respondido: boolean | undefined): boolean {
  return !respondido;
}

export function computeGroupProgress(
  groups: GroupTemplate[],
  items: ItemTemplate[],
  responses: ItemResponseRow[]
): GroupProgress[] {
  const respondidoByItemId = new Map(responses.map((r) => [r.item_template_id, r.respondido]));
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
      const pendentes = groupItems.filter((item) => isItemPending(respondidoByItemId.get(item.id))).length;
      return { id: group.id, ordem: group.ordem, nome: group.nome, pendentes, total: groupItems.length };
    });
}

export type ItemTemplateDetail = { id: string; subcategoria: string | null; nome: string };
export type ChecklistItemStatus = { id: string; nome: string; respondido: boolean };
export type SubcategoriaGroup = { subcategoria: string | null; items: ChecklistItemStatus[] };

export function groupItemsBySubcategoria(
  items: ItemTemplateDetail[],
  responses: ItemResponseRow[]
): SubcategoriaGroup[] {
  const respondidoByItemId = new Map(responses.map((r) => [r.item_template_id, r.respondido]));
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
      respondido: respondidoByItemId.get(item.id) ?? false,
    });
  }

  return order.map((subcategoria) => ({ subcategoria, items: bucket.get(subcategoria)! }));
}

export function findNextItemId(subcategorias: SubcategoriaGroup[], currentItemId: string): string | null {
  const flat = subcategorias.flatMap((bucket) => bucket.items);
  const index = flat.findIndex((item) => item.id === currentItemId);
  if (index === -1 || index === flat.length - 1) return null;
  return flat[index + 1].id;
}
