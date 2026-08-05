"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitInspectionAction, type SubmitInspectionState } from "./actions";
import type { GroupProgress } from "@/lib/checklist/progress";

const initialState: SubmitInspectionState = { status: "idle" };

export function SubmitInspectionPanel({
  inspectionId,
  label,
  progress,
}: {
  inspectionId: string;
  label: string;
  progress: GroupProgress[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, formAction] = useActionState(submitInspectionAction, initialState);
  const pendentesPorGrupo = progress.filter((g) => g.pendentes > 0);
  const bloqueado = pendentesPorGrupo.length > 0;

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  if (bloqueado) {
    return (
      <div className="stack">
        <button type="button" className="btn btn-primary" disabled>
          {label}
        </button>
        <ul className="pendencias-list">
          {pendentesPorGrupo.map((g) => (
            <li key={g.id}>
              {g.nome}: {g.pendentes} pendente{g.pendentes === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <p>Depois de enviada, a inspeção deixa de poder ser editada. Confirma o envio?</p>
      <div className="stack-row">
        <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          Confirmar envio
        </button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}
    </form>
  );
}
