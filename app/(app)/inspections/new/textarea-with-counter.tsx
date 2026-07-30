"use client";

export function TextareaWithCounter({
  id,
  name,
  label,
  value,
  onChange,
  maxSoft,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxSoft: number;
}) {
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        className="input"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value.length > maxSoft && <p className="hint">{value.length} caracteres</p>}
    </div>
  );
}
