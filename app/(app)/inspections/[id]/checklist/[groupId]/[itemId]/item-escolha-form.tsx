// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-escolha-form.tsx
"use client";

import { useActionState, useState } from "react";
import { saveEscolhaAction, type SaveEscolhaState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";
import { BatchApplyPanel, type BatchRow } from "./batch-apply-panel";
import { buildBatchRows, resolveEscolhaColorModifier, type Opcao, type SiblingRow } from "@/lib/checklist/siblings";

const initialState: SaveEscolhaState = { status: "idle" };

export function ItemEscolhaForm({
  inspectionId,
  itemTemplateId,
  nome,
  nextUrl,
  groupListUrl,
  opcoes,
  initialOpcaoId,
  initialObservacao,
  initialPhotos,
  siblings,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nome: string;
  nextUrl: string;
  groupListUrl: string;
  opcoes: Opcao[];
  initialOpcaoId: string | null;
  initialObservacao: string | null;
  initialPhotos: Photo[];
  siblings: SiblingRow[];
}) {
  const [state, formAction] = useActionState(saveEscolhaAction, initialState);
  const [opcaoId, setOpcaoId] = useState(initialOpcaoId ?? "");
  const [observacao, setObservacao] = useState(initialObservacao ?? "");
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedSiblings, setSelectedSiblings] = useState<Set<string>>(
    new Set(siblings.filter((s) => s.defaultChecked).map((s) => s.id))
  );
  const [showBatchPanel, setShowBatchPanel] = useState(false);

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
      { itemTemplateId, nome, opcao_id: opcaoId, observacao, photos },
      siblings,
      selectedSiblings
    );

    return (
      <BatchApplyPanel
        inspectionId={inspectionId}
        groupListUrl={groupListUrl}
        opcoes={opcoes}
        initialRows={initialRows}
        onCancel={() => setShowBatchPanel(false)}
      />
    );
  }

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />
      <input type="hidden" name="nextUrl" value={nextUrl} />

      <fieldset className="panel form-fieldset">
        <legend className="form-fieldset__legend">Classificação</legend>
        <div className="escolha-options">
          {opcoes.map((o) => (
            <label key={o.id} className={`escolha-option escolha-option--${resolveEscolhaColorModifier(opcoes, o.id)}`}>
              <input
                type="radio"
                name="opcao_id"
                value={o.id}
                checked={opcaoId === o.id}
                onChange={() => setOpcaoId(o.id)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="observacao" className="label">
          Observação
        </label>
        <textarea
          id="observacao"
          name="observacao"
          className="input"
          rows={3}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />
      </div>

      <PhotoManager
        inspectionId={inspectionId}
        itemTemplateId={itemTemplateId}
        initialPhotos={initialPhotos}
        onPhotosChange={setPhotos}
      />

      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}

      <button type="submit" className="btn btn-primary">
        Salvar e próximo
      </button>

      {siblings.length > 0 && (
        <fieldset className="panel form-fieldset">
          <legend className="form-fieldset__legend">Este item se repete em</legend>
          <div className="stack sibling-list">
            {siblings.map((s) => (
              <label key={s.id} className="sibling-list__row">
                <input type="checkbox" checked={selectedSiblings.has(s.id)} onChange={() => toggleSibling(s.id)} />
                <span>
                  {s.nome}
                  {s.opcao_label && <span className="hint"> (já respondido: {s.opcao_label})</span>}
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!opcaoId || selectedSiblings.size === 0}
            onClick={() => setShowBatchPanel(true)}
          >
            Aplicar aos selecionados
          </button>
        </fieldset>
      )}
    </form>
  );
}
