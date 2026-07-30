"use client";

import { useState } from "react";

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);
}

export function ValorMoedaInput({
  id,
  name,
  label,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [foco, setFoco] = useState(false);
  const numero = Number(value.replace(",", "."));
  const formatoValido = value !== "" && !Number.isNaN(numero);

  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      {/* Zod's z.coerce.number() is plain Number(), which chokes on the pt-PT
          comma decimal this field displays and accepts while typing — submit
          the dot-decimal form so the schema actually parses it. */}
      <input type="hidden" name={name} value={value.replace(",", ".")} />
      <input
        id={id}
        className="input"
        inputMode="decimal"
        value={!foco && formatoValido ? formatarMoeda(numero) : value}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,.-]/g, ""))}
      />
    </div>
  );
}
