// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx
"use client";

import { useActionState } from "react";
import { saveMeasurementAction, type SaveMeasurementState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";

const initialState: SaveMeasurementState = { status: "idle" };

export function ItemMedicaoForm({
  inspectionId,
  itemTemplateId,
  nextUrl,
  qtdPontos,
  initialValores,
  initialObservacao,
  initialPhotos,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nextUrl: string;
  qtdPontos: number;
  initialValores: number[];
  initialObservacao: string | null;
  initialPhotos: Photo[];
}) {
  const [state, formAction] = useActionState(saveMeasurementAction, initialState);
  const pontos = Array.from({ length: qtdPontos }, (_, i) => i);

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />
      <input type="hidden" name="nextUrl" value={nextUrl} />

      <fieldset className="panel form-fieldset">
        <legend className="form-fieldset__legend">Medição (µm)</legend>
        <div className="form-grid">
          {pontos.map((i) => (
            <div key={i} className="field">
              <label htmlFor={`valor-${i}`} className="label">
                Ponto {i + 1}
              </label>
              <input
                id={`valor-${i}`}
                name="valor"
                type="number"
                step="0.01"
                className="input"
                defaultValue={initialValores[i] ?? ""}
                required
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="observacao" className="label">
          Observação
        </label>
        <textarea id="observacao" name="observacao" className="input" rows={3} defaultValue={initialObservacao ?? ""} />
      </div>

      <PhotoManager inspectionId={inspectionId} itemTemplateId={itemTemplateId} initialPhotos={initialPhotos} />

      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}

      <button type="submit" className="btn btn-primary">
        Salvar e próximo
      </button>
    </form>
  );
}
