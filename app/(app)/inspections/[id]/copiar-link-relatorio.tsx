"use client";

import { useState } from "react";

export function CopiarLinkRelatorioButton({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const link = `${window.location.origin}/relatorio/${codigo}`;
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button type="button" className="btn btn-secondary summary-cta" onClick={copiar}>
      {copiado ? "Copiado!" : "Copiar link do relatório"}
    </button>
  );
}
