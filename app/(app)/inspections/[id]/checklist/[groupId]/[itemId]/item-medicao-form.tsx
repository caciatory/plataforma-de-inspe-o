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
  initialPhotos,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nextUrl: string;
  qtdPontos: number;
  initialValores: number[];
  initialPhotos: Photo[];
}) {
  const [state, formAction] = useActionState(saveMeasurementAction, initialState);
  const pontos = Array.from({ length: qtdPontos }, (_, i) => i);

  return (
    <form action={formAction}>
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="itemTemplateId" value={itemTemplateId} />
      <input type="hidden" name="nextUrl" value={nextUrl} />

      <fieldset>
        <legend>Medição (µm)</legend>
        {pontos.map((i) => (
          <div key={i}>
            <label htmlFor={`valor-${i}`}>Ponto {i + 1}</label>
            <input
              id={`valor-${i}`}
              name="valor"
              type="number"
              step="0.01"
              defaultValue={initialValores[i] ?? ""}
              required
            />
          </div>
        ))}
      </fieldset>

      <PhotoManager inspectionId={inspectionId} itemTemplateId={itemTemplateId} initialPhotos={initialPhotos} />

      {state.status === "error" && <p role="alert">{state.message}</p>}

      <button type="submit">Salvar e próximo</button>
    </form>
  );
}
