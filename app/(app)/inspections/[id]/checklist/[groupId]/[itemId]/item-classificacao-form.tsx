// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx
"use client";

import { useActionState, useState, type FormEvent } from "react";
import { saveClassificacaoAction, type SaveClassificacaoState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";
import { BatchApplyPanel, type BatchRow } from "./batch-apply-panel";
import { buildBatchRows, type SiblingRow } from "@/lib/checklist/siblings";

const CLASSIFICACOES = [
  { value: "otimo", label: "Ótimo" },
  { value: "medio", label: "Médio" },
  { value: "ruim", label: "Ruim" },
  { value: "NF", label: "Não se aplica (NF)" },
] as const;

const initialState: SaveClassificacaoState = { status: "idle" };

export function ItemClassificacaoForm({
  inspectionId,
  itemTemplateId,
  nome,
  nextUrl,
  groupListUrl,
  initialClassificacao,
  initialObservacao,
  initialPhotos,
  siblings,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nome: string;
  nextUrl: string;
  groupListUrl: string;
  initialClassificacao: string | null;
  initialObservacao: string | null;
  initialPhotos: Photo[];
  siblings: SiblingRow[];
}) {
  const [state, formAction] = useActionState(saveClassificacaoAction, initialState);
  const [classificacao, setClassificacao] = useState(initialClassificacao ?? "");
  const [observacao, setObservacao] = useState(initialObservacao ?? "");
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedSiblings, setSelectedSiblings] = useState<Set<string>>(
    new Set(siblings.filter((s) => s.defaultChecked).map((s) => s.id))
  );
  const [showBatchPanel, setShowBatchPanel] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (classificacao === "NF") {
      const confirmed = window.confirm("Confirma marcar este item como Não se aplica (NF)?");
      if (!confirmed) e.preventDefault();
    }
  }

  function toggleSibling(id: string) {
    setSelectedSiblings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (showBatchPanel) {
    const initialRows: BatchRow[] = buildBatchRows(
      { itemTemplateId, nome, classificacao, observacao, photos },
      siblings,
      selectedSiblings,
      classificacao,
      observacao
    );

    return (
      <BatchApplyPanel
        inspectionId={inspectionId}
        groupListUrl={groupListUrl}
        initialRows={initialRows}
        onCancel={() => setShowBatchPanel(false)}
      />
    );
  }

  return (
    <form action={formAction} onSubmit={handleSubmit}>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />
      <input type="hidden" name="nextUrl" value={nextUrl} />

      <fieldset>
        <legend>Classificação</legend>
        {CLASSIFICACOES.map((c) => (
          <label key={c.value}>
            <input
              type="radio"
              name="classificacao"
              value={c.value}
              checked={classificacao === c.value}
              onChange={() => setClassificacao(c.value)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>

      <label htmlFor="observacao">Observação</label>
      <textarea
        id="observacao"
        name="observacao"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
      />

      <PhotoManager
        inspectionId={inspectionId}
        itemTemplateId={itemTemplateId}
        initialPhotos={initialPhotos}
        onPhotosChange={setPhotos}
      />

      {state.status === "error" && <p role="alert">{state.message}</p>}

      <button type="submit">Salvar e próximo</button>

      {siblings.length > 0 && (
        <fieldset>
          <legend>Este item se repete em</legend>
          {siblings.map((s) => (
            <label key={s.id}>
              <input type="checkbox" checked={selectedSiblings.has(s.id)} onChange={() => toggleSibling(s.id)} />
              {s.nome}
              {s.status !== "pendente" && ` (já respondido: ${s.classificacao ?? s.status})`}
            </label>
          ))}
          <button
            type="button"
            disabled={!classificacao || selectedSiblings.size === 0}
            onClick={() => setShowBatchPanel(true)}
          >
            Aplicar aos selecionados
          </button>
        </fieldset>
      )}
    </form>
  );
}
