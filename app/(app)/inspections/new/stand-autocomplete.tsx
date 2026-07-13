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
    <div>
      <label htmlFor="standSearch">Procurar stand existente</label>
      <input id="standSearch" value={query} onChange={(e) => handleChange(e.target.value)} />
      {isPending && <span>A procurar...</span>}
      {results.length > 0 && (
        <ul>
          {results.map((c) => (
            <li key={c.nome_solicitante}>
              <button type="button" onClick={() => onSelect(c)}>
                {c.nome_solicitante} — {c.contacto ?? "sem contacto"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
