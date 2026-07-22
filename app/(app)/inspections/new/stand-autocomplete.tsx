"use client";

import { useState, useTransition } from "react";
import { searchStandContactsAction } from "./actions";

export type StandContact = { nome_solicitante: string; contacto: string | null; email: string | null };

export function StandAutocomplete({ onSelect }: { onSelect: (contact: StandContact) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StandContact[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const found = await searchStandContactsAction(value);
      setResults(found);
    });
  }

  return (
    <div className="field stand-autocomplete">
      <label htmlFor="standSearch" className="label">
        Procurar stand existente
      </label>
      <input
        id="standSearch"
        className="input"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
      />
      {isPending && <span className="hint">A procurar...</span>}
      {results.length > 0 && (
        <ul className="stand-autocomplete__results">
          {results.map((c) => (
            <li key={c.nome_solicitante}>
              <button type="button" className="stand-autocomplete__result" onClick={() => onSelect(c)}>
                {c.nome_solicitante} — {c.contacto ?? "sem contacto"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
