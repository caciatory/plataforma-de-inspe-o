"use client";

export function SimNaoRadio({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: "" | "sim" | "nao";
  onChange: (value: "sim" | "nao") => void;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="sim-nao-radio">
        <label>
          <input
            type="radio"
            name={name}
            value="sim"
            checked={value === "sim"}
            onChange={() => onChange("sim")}
            aria-label={`Sim (${label})`}
          />
          Sim
        </label>
        <label>
          <input
            type="radio"
            name={name}
            value="nao"
            checked={value === "nao"}
            onChange={() => onChange("nao")}
            aria-label={`Não (${label})`}
          />
          Não
        </label>
      </div>
    </div>
  );
}
