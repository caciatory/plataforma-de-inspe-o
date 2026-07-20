// app/(app)/inspections/[id]/checklist/[groupId]/[itemId]/item-classificacao-form.tsx
"use client";

import { useActionState, useState, type FormEvent } from "react";
import { saveClassificacaoAction, type SaveClassificacaoState } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";

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
  nextUrl,
  initialClassificacao,
  initialObservacao,
  initialPhotos,
}: {
  inspectionId: string;
  itemTemplateId: string;
  nextUrl: string;
  initialClassificacao: string | null;
  initialObservacao: string | null;
  initialPhotos: Photo[];
}) {
  const [state, formAction] = useActionState(saveClassificacaoAction, initialState);
  const [classificacao, setClassificacao] = useState(initialClassificacao ?? "");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (classificacao === "NF") {
      const confirmed = window.confirm("Confirma marcar este item como Não se aplica (NF)?");
      if (!confirmed) e.preventDefault();
    }
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
      <textarea id="observacao" name="observacao" defaultValue={initialObservacao ?? ""} />

      <PhotoManager inspectionId={inspectionId} itemTemplateId={itemTemplateId} initialPhotos={initialPhotos} />

      {state.status === "error" && <p role="alert">{state.message}</p>}

      <button type="submit">Salvar e próximo</button>
    </form>
  );
}
