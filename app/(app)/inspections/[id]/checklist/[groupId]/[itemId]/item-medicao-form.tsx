// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-medicao-form.tsx
"use client";

import { useActionState, useEffect } from "react";
import { saveMeasurementAction, type SaveMeasurementState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";

const initialState: SaveMeasurementState = { status: "idle" };

export function ItemMedicaoForm({
  inspectionId,
  itemTemplateId,
  qtdPontos,
  unidadeMedicao,
  initialValores,
  initialObservacao,
  initialPhotos,
  onSuccess,
}: {
  inspectionId: string;
  itemTemplateId: string;
  qtdPontos: number;
  unidadeMedicao: string | null;
  initialValores: number[];
  initialObservacao: string | null;
  initialPhotos: Photo[];
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(saveMeasurementAction, initialState);
  const pontos = Array.from({ length: qtdPontos }, (_, i) => i);
  const legend = unidadeMedicao ? `Medição (${unidadeMedicao})` : "Medição";

  useEffect(() => {
    if (state.status === "success") onSuccess?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSuccess's identity
    // changes every render (new closure in MedicaoCell); state only changes when
    // useActionState gets a new action result, so depending on it alone is what
    // makes this fire exactly once per successful save instead of looping on
    // every re-render router.refresh() itself triggers.
  }, [state]);

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />

      <fieldset className="panel form-fieldset">
        <legend className="form-fieldset__legend">{legend}</legend>
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
