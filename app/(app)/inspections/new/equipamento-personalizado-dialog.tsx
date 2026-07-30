"use client";

import { useRef } from "react";

export function EquipamentoPersonalizadoDialog({
  categoriaLabel,
  onConfirm,
  onCancel,
}: {
  categoriaLabel: string;
  onConfirm: (nome: string) => void;
  onCancel: () => void;
}) {
  const nomeRef = useRef<HTMLInputElement>(null);

  function handleConfirm() {
    const input = nomeRef.current;
    // Fix 3 (final-review): native "preencha este campo" feedback instead of
    // silently doing nothing when nome is blank.
    if (!input || !input.reportValidity()) return;
    onConfirm(input.value.trim());
  }

  return (
    <div className="stack">
      <h3>{`Adicionar equipamento personalizado — ${categoriaLabel}`}</h3>
      <div className="field">
        <label htmlFor="personalizadoNome" className="label">
          Nome do equipamento
        </label>
        <input id="personalizadoNome" className="input" ref={nomeRef} required />
      </div>
      <div className="stack-row">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm}>
          Adicionar
        </button>
      </div>
    </div>
  );
}
