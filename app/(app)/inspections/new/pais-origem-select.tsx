"use client";

import { useState } from "react";
import { PAISES_ORIGEM_COMUNS } from "@/lib/historico/paises";

export function PaisOrigemSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [modoOutro, setModoOutro] = useState(
    value !== "" && !(PAISES_ORIGEM_COMUNS as readonly string[]).includes(value)
  );

  return (
    <div className="field">
      <label htmlFor={id} className="label">
        País de origem / importação
      </label>
      {modoOutro ? (
        <input
          id={id}
          name="paisOrigem"
          className="input"
          placeholder="Nome do país"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <select
          id={id}
          name="paisOrigem"
          className="input"
          value={value}
          onChange={(e) => {
            if (e.target.value === "__outro__") {
              setModoOutro(true);
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="">Selecione</option>
          {PAISES_ORIGEM_COMUNS.map((pais) => (
            <option key={pais} value={pais}>
              {pais}
            </option>
          ))}
          <option value="__outro__">Outro</option>
        </select>
      )}
      {modoOutro && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setModoOutro(false);
            onChange("");
          }}
        >
          Escolher da lista
        </button>
      )}
    </div>
  );
}
