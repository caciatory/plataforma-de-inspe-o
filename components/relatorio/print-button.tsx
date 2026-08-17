"use client";

export function PrintButton() {
  return (
    <button type="button" className="relatorio-print-button" onClick={() => window.print()}>
      <span className="material-symbols-outlined" aria-hidden="true">
        print
      </span>
      Imprimir relatório
    </button>
  );
}
