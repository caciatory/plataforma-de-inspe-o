import type { ItemResponseRow, ItemResponseStatus } from "./progress";

export type SiblingSourceItem = { id: string; nome: string; grupo_replicacao: string | null };
export type SiblingRow = { id: string; nome: string; status: ItemResponseStatus; defaultChecked: boolean };

export function deriveSiblingRows(
  currentItemId: string,
  items: SiblingSourceItem[],
  responses: ItemResponseRow[]
): SiblingRow[] {
  const current = items.find((i) => i.id === currentItemId);
  if (!current?.grupo_replicacao) return [];

  const statusByItemId = new Map(responses.map((r) => [r.item_template_id, r.status]));

  return items
    .filter((i) => i.id !== currentItemId && i.grupo_replicacao === current.grupo_replicacao)
    .map((i) => {
      const status = statusByItemId.get(i.id) ?? "pendente";
      return { id: i.id, nome: i.nome, status, defaultChecked: status === "pendente" };
    });
}
