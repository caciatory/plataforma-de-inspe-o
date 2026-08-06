"use client";

import { useActionState, useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, isSubmitting] = useActionState(submitInspectionAction, initialState);
  const pendentesPorGrupo = progress.filter((g) => g.pendentes > 0);
  const bloqueado = pendentesPorGrupo.length > 0;

  useEffect(() => {
    if (state.status === "success") {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        {bloqueado ? (
          <div className="stack">
            <h3>Ainda há itens pendentes</h3>
            <ul className="pendencias-list">
              {pendentesPorGrupo.map((g) => (
                <li key={g.id}>
                  {g.nome}: {g.pendentes} pendente{g.pendentes === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
              Fechar
            </button>
          </div>
        ) : (
          <form action={formAction} className="stack">
            <input type="hidden" name="inspectionId" value={inspectionId} />
            <p>Depois de enviada, a inspeção deixa de poder ser editada. Confirma o envio?</p>
            <div className="stack-row">
              <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                Confirmar envio
              </button>
            </div>
            {state.status === "error" && (
              <p role="alert" className="error-text">
                {state.message}
              </p>
            )}
          </form>
        )}
      </dialog>
    </>
  );
}
