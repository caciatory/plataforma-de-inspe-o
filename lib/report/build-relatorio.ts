import { resolveEscolhaColorModifier, type Opcao } from "@/lib/checklist/siblings";

export type RelatorioGroupTemplate = { id: string; ordem: number; nome: string };
export type RelatorioItemTemplate = {
  id: string;
  group_id: string;
  subcategoria: string | null;
  nome: string;
  tipo: "escolha" | "medicao" | "texto" | "data";
  conjunto_opcao_id: string | null;
};
export type RelatorioResponse = {
  id: string;
  item_template_id: string;
  opcao_id: string | null;
  resposta_texto: string | null;
  resposta_data: string | null;
  observacao: string | null;
};
export type RelatorioOpcao = Opcao & { conjunto_id: string };
export type RelatorioMedicaoResultado = { item_response_id: string; resultado: "ok" | "atencao" | "critico" };
export type RelatorioPhoto = { id: string; url: string; item_response_id: string };

export type ReportItemStatus = "otimo" | "medio" | "ruim" | "na" | "info";

export type ReportItem = {
  id: string;
  nome: string;
  subcategoria: string | null;
  respostaLabel: string;
  status: ReportItemStatus;
  fotos: { id: string; url: string }[];
  comentario: string | null;
  piscaComentario: boolean;
};

export type ReportGroup = { id: string; nome: string; ok: number; atencao: number; items: ReportItem[] };

const MEDICAO_LABEL: Record<RelatorioMedicaoResultado["resultado"], string> = {
  ok: "Conforme",
  atencao: "Atenção",
  critico: "Crítico",
};

const MEDICAO_STATUS: Record<RelatorioMedicaoResultado["resultado"], ReportItemStatus> = {
  ok: "otimo",
  atencao: "medio",
  critico: "ruim",
};

function resolveStatusAndLabel(
  item: RelatorioItemTemplate,
  response: RelatorioResponse,
  opcoesDoConjunto: RelatorioOpcao[],
  medicaoByResponseId: Map<string, RelatorioMedicaoResultado["resultado"]>
): { status: ReportItemStatus; respostaLabel: string } {
  if (item.tipo === "escolha") {
    if (!response.opcao_id) return { status: "info", respostaLabel: "Sem resposta" };
    const opcao = opcoesDoConjunto.find((o) => o.id === response.opcao_id);
    const status = resolveEscolhaColorModifier(opcoesDoConjunto, response.opcao_id) as ReportItemStatus;
    return { status, respostaLabel: opcao?.label ?? "Sem resposta" };
  }
  if (item.tipo === "medicao") {
    const resultado = medicaoByResponseId.get(response.id);
    if (!resultado) return { status: "info", respostaLabel: "Sem resposta" };
    return { status: MEDICAO_STATUS[resultado], respostaLabel: MEDICAO_LABEL[resultado] };
  }
  if (item.tipo === "texto") {
    return { status: "info", respostaLabel: response.resposta_texto ?? "Sem resposta" };
  }
  // data
  return {
    status: "info",
    respostaLabel: response.resposta_data ? new Date(response.resposta_data).toLocaleDateString("pt-PT") : "Sem resposta",
  };
}

export function buildRelatorioGrupos(
  groups: RelatorioGroupTemplate[],
  items: RelatorioItemTemplate[],
  responses: RelatorioResponse[],
  opcoes: RelatorioOpcao[],
  medicaoResultados: RelatorioMedicaoResultado[],
  photos: RelatorioPhoto[]
): ReportGroup[] {
  const responseByItemId = new Map(responses.map((r) => [r.item_template_id, r]));
  const medicaoByResponseId = new Map(medicaoResultados.map((m) => [m.item_response_id, m.resultado]));
  const fotosByResponseId = new Map<string, { id: string; url: string }[]>();
  for (const p of photos) {
    const list = fotosByResponseId.get(p.item_response_id) ?? [];
    list.push({ id: p.id, url: p.url });
    fotosByResponseId.set(p.item_response_id, list);
  }
  const itemsByGroupId = new Map<string, RelatorioItemTemplate[]>();
  for (const item of items) {
    const list = itemsByGroupId.get(item.group_id) ?? [];
    list.push(item);
    itemsByGroupId.set(item.group_id, list);
  }

  return groups
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((group) => {
      const reportItems: ReportItem[] = (itemsByGroupId.get(group.id) ?? [])
        .map((item): ReportItem | null => {
          const response = responseByItemId.get(item.id);
          if (!response) return null;
          const opcoesDoConjunto = opcoes.filter((o) => o.conjunto_id === item.conjunto_opcao_id);
          const { status, respostaLabel } = resolveStatusAndLabel(item, response, opcoesDoConjunto, medicaoByResponseId);
          return {
            id: item.id,
            nome: item.nome,
            subcategoria: item.subcategoria,
            respostaLabel,
            status,
            fotos: fotosByResponseId.get(response.id) ?? [],
            comentario: response.observacao,
            piscaComentario: response.observacao !== null && status === "ruim",
          };
        })
        .filter((i): i is ReportItem => i !== null);

      return {
        id: group.id,
        nome: group.nome,
        ok: reportItems.filter((i) => i.status !== "ruim").length,
        atencao: reportItems.filter((i) => i.status === "ruim").length,
        items: reportItems,
      };
    })
    .filter((g) => g.items.length > 0);
}
