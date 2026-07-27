export const SEM_SUBCATEGORIA_PARAM = "sem-subcategoria";

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

export type ItemGroupSubcategoria = { id: string; group_id: string; subcategoria: string | null };
export type SubcategoriaProgress = { subcategoria: string | null; pendentes: number; total: number };
export type GroupSubcategoriaProgress = { id: string; subcategorias: SubcategoriaProgress[] };

export function computeSubcategoriaProgress(
  items: ItemGroupSubcategoria[],
  responses: ItemResponseRow[]
): GroupSubcategoriaProgress[] {
  const respondidoByItemId = new Map(responses.map((r) => [r.item_template_id, r.respondido]));
  const itemsByGroupId = new Map<string, ItemGroupSubcategoria[]>();
  for (const item of items) {
    const list = itemsByGroupId.get(item.group_id) ?? [];
    list.push(item);
    itemsByGroupId.set(item.group_id, list);
  }

  return Array.from(itemsByGroupId.entries()).map(([groupId, groupItems]) => {
    const sorted = groupItems.slice().sort((a, b) => (a.subcategoria ?? "").localeCompare(b.subcategoria ?? ""));
    const order: Array<string | null> = [];
    const bucket = new Map<string | null, ItemGroupSubcategoria[]>();
    for (const item of sorted) {
      const key = item.subcategoria;
      if (!bucket.has(key)) {
        bucket.set(key, []);
        order.push(key);
      }
      bucket.get(key)!.push(item);
    }
    const subcategorias = order.map((subcategoria) => {
      const bucketItems = bucket.get(subcategoria)!;
      const pendentes = bucketItems.filter((item) => isItemPending(respondidoByItemId.get(item.id))).length;
      return { subcategoria, pendentes, total: bucketItems.length };
    });
    return { id: groupId, subcategorias };
  });
}
