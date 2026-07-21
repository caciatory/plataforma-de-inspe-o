import type { ItemResponseStatus } from "./progress";

export const CLASSIFICACOES = [
  { value: "otimo", label: "Ótimo" },
  { value: "medio", label: "Médio" },
  { value: "ruim", label: "Ruim" },
  { value: "NF", label: "Não se aplica (NF)" },
] as const;

export type SiblingSourceItem = { id: string; nome: string; grupo_replicacao: string | null };
export type SiblingResponseRow = { item_template_id: string; status: ItemResponseStatus; classificacao: string | null };
export type SiblingRow = {
  id: string;
  nome: string;
  status: ItemResponseStatus;
  classificacao: string | null;
  defaultChecked: boolean;
};

export function deriveSiblingRows(
  currentItemId: string,
  items: SiblingSourceItem[],
  responses: SiblingResponseRow[]
): SiblingRow[] {
  const current = items.find((i) => i.id === currentItemId);
  if (!current?.grupo_replicacao) return [];

  const responseByItemId = new Map(responses.map((r) => [r.item_template_id, r]));

  return items
    .filter((i) => i.id !== currentItemId && i.grupo_replicacao === current.grupo_replicacao)
    .map((i) => {
      const response = responseByItemId.get(i.id);
      const status = response?.status ?? "pendente";
      return {
        id: i.id,
        nome: i.nome,
        status,
        classificacao: response?.classificacao ?? null,
        defaultChecked: status === "pendente",
      };
    });
}

export type BatchRowInput = {
  itemTemplateId: string;
  nome: string;
  classificacao: string;
  observacao: string;
  photos: { id: string; url: string }[];
};

export function buildBatchRows(
  current: BatchRowInput,
  siblings: SiblingRow[],
  selectedSiblingIds: Set<string>
): BatchRowInput[] {
  return [
    current,
    ...siblings
      .filter((s) => selectedSiblingIds.has(s.id))
      .map((s) => ({
        itemTemplateId: s.id,
        nome: s.nome,
        classificacao: current.classificacao,
        observacao: current.observacao,
        photos: [],
      })),
  ];
}
