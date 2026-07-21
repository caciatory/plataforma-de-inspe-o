"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyClassificacaoBatchAction } from "./actions";
import { PhotoManager, type Photo } from "./photo-manager";

const CLASSIFICACOES = [
  { value: "otimo", label: "Ótimo" },
  { value: "medio", label: "Médio" },
  { value: "ruim", label: "Ruim" },
  { value: "NF", label: "Não se aplica (NF)" },
] as const;

export type BatchRow = {
  itemTemplateId: string;
  nome: string;
  classificacao: string;
  observacao: string;
  photos: Photo[];
};

export function BatchApplyPanel({
  inspectionId,
  groupListUrl,
  initialRows,
  onCancel,
}: {
  inspectionId: string;
  groupListUrl: string;
  initialRows: BatchRow[];
  onCancel: () => void;
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

    const missingFoto = rows.filter((r) => r.classificacao === "ruim" && r.photos.length === 0);
    if (missingFoto.length > 0) {
      setError(`Anexe pelo menos 1 foto antes de confirmar: ${missingFoto.map((r) => r.nome).join(", ")}.`);
      return;
    }

    const nfCount = rows.filter((r) => r.classificacao === "NF").length;
    if (nfCount > 0) {
      const confirmed = window.confirm(
        `${nfCount} item(ns) será(ão) marcado(s) como Não se aplica (NF). Confirma?`
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      const result = await applyClassificacaoBatchAction(
        inspectionId,
        rows.map((r) => ({
          itemTemplateId: r.itemTemplateId,
          classificacao: r.classificacao,
          observacao: r.observacao || null,
        }))
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      router.push(groupListUrl);
    });
  }

  return (
    <div>
      <h2>Aplicar aos selecionados</h2>
      {rows.map((row) => (
        <fieldset key={row.itemTemplateId}>
          <legend>{row.nome}</legend>

          {CLASSIFICACOES.map((c) => (
            <label key={c.value}>
              <input
                type="radio"
                name={`classificacao-${row.itemTemplateId}`}
                value={c.value}
                checked={row.classificacao === c.value}
                onChange={() => updateRow(row.itemTemplateId, { classificacao: c.value })}
              />
              {c.label}
            </label>
          ))}

          <label htmlFor={`observacao-${row.itemTemplateId}`}>Observação</label>
          <textarea
            id={`observacao-${row.itemTemplateId}`}
            value={row.observacao}
            onChange={(e) => updateRow(row.itemTemplateId, { observacao: e.target.value })}
          />

          <PhotoManager
            inspectionId={inspectionId}
            itemTemplateId={row.itemTemplateId}
            initialPhotos={row.photos}
            onPhotosChange={(photos) => updateRow(row.itemTemplateId, { photos })}
          />
        </fieldset>
      ))}

      {error && <p role="alert">{error}</p>}

      <button type="button" onClick={handleConfirm} disabled={isPending}>
        Confirmar aplicação
      </button>
      <button type="button" onClick={onCancel} disabled={isPending}>
        Cancelar
      </button>
    </div>
  );
}
