"use client";

import { useState } from "react";

export function EquipamentoPersonalizadoDialog({
  categoriaLabel,
  onConfirm,
  onCancel,
}: {
  categoriaLabel: string;
  onConfirm: (nome: string, condicao: "bom" | "atencao") => void;
  onCancel: () => void;
}) {
  const [nome, setNome] = useState("");
  const [condicao, setCondicao] = useState<"" | "bom" | "atencao">("");

  function handleConfirm() {
    if (!nome.trim() || condicao === "") return;
    onConfirm(nome.trim(), condicao);
  }

  return (
    <div className="stack">
      <h3>{`Adicionar equipamento personalizado — ${categoriaLabel}`}</h3>
      <div className="field">
        <label htmlFor="personalizadoNome" className="label">
          Nome do equipamento
        </label>
        <input
          id="personalizadoNome"
          className="input"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>
      <div className="equip-item__condicao">
        <label>
          <input type="radio" name="personalizadoCondicao" checked={condicao === "bom"} onChange={() => setCondicao("bom")} aria-label="✓ Bom" />
          ✓ Bom
        </label>
        <label>
          <input type="radio" name="personalizadoCondicao" checked={condicao === "atencao"} onChange={() => setCondicao("atencao")} aria-label="⚠️ Atenção" />
          ⚠️ Atenção
        </label>
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
