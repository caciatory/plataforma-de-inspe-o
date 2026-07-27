export type Opcao = { id: string; label: string; exige_foto: boolean; ordem: number };

export type SiblingSourceItem = { id: string; nome: string; grupo_replicacao: string | null };
export type SiblingResponseRow = { item_template_id: string; opcao_id: string | null };
export type SiblingRow = {
  id: string;
  nome: string;
  opcao_id: string | null;
  opcao_label: string | null;
  defaultChecked: boolean;
};

export function deriveSiblingRows(
  currentItemId: string,
  items: SiblingSourceItem[],
  responses: SiblingResponseRow[],
  opcaoLabelById: Map<string, string>
): SiblingRow[] {
  const current = items.find((i) => i.id === currentItemId);
  if (!current?.grupo_replicacao) return [];

  const responseByItemId = new Map(responses.map((r) => [r.item_template_id, r]));

  return items
    .filter((i) => i.id !== currentItemId && i.grupo_replicacao === current.grupo_replicacao)
    .map((i) => {
      const opcaoId = responseByItemId.get(i.id)?.opcao_id ?? null;
      return {
        id: i.id,
        nome: i.nome,
        opcao_id: opcaoId,
        opcao_label: opcaoId ? (opcaoLabelById.get(opcaoId) ?? null) : null,
        defaultChecked: opcaoId === null,
      };
    });
}

export type BatchRowInput = {
  itemTemplateId: string;
  nome: string;
  opcao_id: string;
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
        opcao_id: current.opcao_id,
        observacao: current.observacao,
        photos: [],
      })),
  ];
}

export function slugifyOpcaoLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

// Colors an escolha option by its rank within its conjunto (best -> worst),
// rather than by literal label text, so any label set gets colored (not just
// ones that happen to slugify to otimo/medio/ruim).
export function resolveEscolhaColorModifier(opcoes: Opcao[], opcaoId: string): string {
  const target = opcoes.find((o) => o.id === opcaoId);
  if (!target) return slugifyOpcaoLabel("");

  if (slugifyOpcaoLabel(target.label) === "na") return "na";

  const ranked = opcoes.filter((o) => slugifyOpcaoLabel(o.label) !== "na").sort((a, b) => a.ordem - b.ordem);
  const rank = ranked.findIndex((o) => o.id === opcaoId);
  const lastRank = ranked.length - 1;

  if (rank === 0) return "otimo";
  if (rank === lastRank) return "ruim";
  return "medio";
}
