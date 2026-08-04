"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyOpcoesBatchAction } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";
import { resolveEscolhaColorModifier, type BatchRow, type Opcao } from "@/lib/checklist/siblings";

export function BatchApplyPanel({
  inspectionId,
  opcoes,
  initialRows,
  onCancel,
  onSuccess,
}: {
  inspectionId: string;
  opcoes: Opcao[];
  initialRows: BatchRow[];
  onCancel: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<BatchRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(itemTemplateId: string, patch: Partial<BatchRow>) {
    setRows((prev) => prev.map((r) => (r.itemTemplateId === itemTemplateId ? { ...r, ...patch } : r)));
  }

  function handleConfirm() {
    setError(null);

    const includedRows = rows.filter((r) => r.included);
    const exigeFotoByOpcaoId = new Map(opcoes.map((o) => [o.id, o.exige_foto]));
    const missingFoto = includedRows.filter((r) => exigeFotoByOpcaoId.get(r.opcao_id) && r.photos.length === 0);
    if (missingFoto.length > 0) {
      setError(`Anexe pelo menos 1 foto antes de confirmar: ${missingFoto.map((r) => r.nome).join(", ")}.`);
      return;
    }

    startTransition(async () => {
      const result = await applyOpcoesBatchAction(
        inspectionId,
        includedRows.map((r) => ({
          itemTemplateId: r.itemTemplateId,
          opcaoId: r.opcao_id,
          observacao: r.observacao || null,
        }))
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      router.refresh();
      onSuccess?.();
    });
  }

  return (
    <div className="stack">
      <h2>Aplicar aos selecionados</h2>
      {rows.map((row) => (
        <fieldset key={row.itemTemplateId} className="panel form-fieldset">
          <legend className="form-fieldset__legend">
            {row.isCurrent ? (
              row.nome
            ) : (
              <label>
                <input
                  type="checkbox"
                  checked={row.included}
                  onChange={(e) => updateRow(row.itemTemplateId, { included: e.target.checked })}
                />{" "}
                {row.nome}
                {row.alreadyAnsweredLabel && !row.included && ` — já respondido: ${row.alreadyAnsweredLabel}`}
              </label>
            )}
          </legend>

          {row.included && (
            <>
              <div className="escolha-options">
                {opcoes.map((o) => (
                  <label
                    key={o.id}
                    className={`escolha-option escolha-option--${resolveEscolhaColorModifier(opcoes, o.id)}`}
                  >
                    <input
                      type="radio"
                      name={`opcao-${row.itemTemplateId}`}
                      value={o.id}
                      checked={row.opcao_id === o.id}
                      onChange={() => updateRow(row.itemTemplateId, { opcao_id: o.id })}
                    />
                    {o.label}
                  </label>
                ))}
              </div>

              <div className="field">
                <label htmlFor={`observacao-${row.itemTemplateId}`} className="label">
                  Observação
                </label>
                <textarea
                  id={`observacao-${row.itemTemplateId}`}
                  className="input"
                  rows={3}
                  value={row.observacao}
                  onChange={(e) => updateRow(row.itemTemplateId, { observacao: e.target.value })}
                />
              </div>

              <PhotoManager
                inspectionId={inspectionId}
                itemTemplateId={row.itemTemplateId}
                initialPhotos={row.photos}
                onPhotosChange={(photos) => updateRow(row.itemTemplateId, { photos })}
              />
            </>
          )}
        </fieldset>
      ))}

      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}

      <div className="batch-actions">
        <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={isPending}>
          Confirmar aplicação
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isPending}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
