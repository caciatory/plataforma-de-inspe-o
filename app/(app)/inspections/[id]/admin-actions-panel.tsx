"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { approveInspectionAction, returnInspectionAction, type ReviewActionState } from "./actions";
import type { InspectionStatus } from "@/lib/inspection/status";

const initialState: ReviewActionState = { status: "idle" };

export function AdminActionsPanel({ inspectionId, status }: { inspectionId: string; status: InspectionStatus }) {
  const router = useRouter();
  const approveDialogRef = useRef<HTMLDialogElement>(null);
  const returnDialogRef = useRef<HTMLDialogElement>(null);
  const [approveState, approveFormAction, isApproving] = useActionState(approveInspectionAction, initialState);
  const [returnState, returnFormAction, isReturning] = useActionState(returnInspectionAction, initialState);

  useEffect(() => {
    if (approveState.status === "success") {
      approveDialogRef.current?.close();
      router.refresh();
    }
  }, [approveState, router]);

  useEffect(() => {
    if (returnState.status === "success") {
      returnDialogRef.current?.close();
      router.refresh();
    }
  }, [returnState, router]);

  const showReview = status === "aguardando_aprovacao";

  if (!showReview) return null;

  return (
    <div className="stack-row">
      <button type="button" className="btn btn-primary" onClick={() => approveDialogRef.current?.showModal()}>
        Aprovar
      </button>
      <dialog ref={approveDialogRef} className="dialog-panel">
        <form action={approveFormAction} className="stack">
          <input type="hidden" name="inspectionId" value={inspectionId} />
          <p>Confirma a aprovação desta inspeção?</p>
          <div className="stack-row">
            <button type="button" className="btn btn-secondary" onClick={() => approveDialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isApproving}>
              Confirmar aprovação
            </button>
          </div>
          {approveState.status === "error" && (
            <p role="alert" className="error-text">
              {approveState.message}
            </p>
          )}
        </form>
      </dialog>

      <button type="button" className="btn btn-danger" onClick={() => returnDialogRef.current?.showModal()}>
        Devolver
      </button>
      <dialog ref={returnDialogRef} className="dialog-panel">
        <form action={returnFormAction} className="stack">
          <input type="hidden" name="inspectionId" value={inspectionId} />
          <div className="field">
            <label htmlFor="motivo" className="label">
              Motivo da devolução
            </label>
            {/* ponytail: no client-side `required` — server validates motivo (see returnInspectionAction) and its error surfaces below */}
            <textarea id="motivo" name="motivo" className="input" />
          </div>
          <div className="stack-row">
            <button type="button" className="btn btn-secondary" onClick={() => returnDialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-danger" disabled={isReturning}>
              Confirmar devolução
            </button>
          </div>
          {returnState.status === "error" && (
            <p role="alert" className="error-text">
              {returnState.message}
            </p>
          )}
        </form>
      </dialog>
    </div>
  );
}
