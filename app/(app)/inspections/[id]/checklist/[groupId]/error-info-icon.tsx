"use client";

import { useState } from "react";

// Mensagem completa de erro fica escondida atras de um icone pequeno
// pulsando -- passar o mouse mostra via title nativo, clicar expande o
// texto do lado (fecha se clicar de novo). O <span role="alert"> continua
// anunciando a mensagem inteira imediatamente pra leitor de tela, mesmo
// com o texto visualmente escondido (sr-only) ate o clique.
export function ErrorInfoIcon({ message }: { message: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <span className="error-info">
      <span role="alert" className="sr-only">
        {message}
      </span>
      <button
        type="button"
        className="error-info__icon"
        title={message}
        aria-expanded={expanded}
        aria-label={expanded ? "Esconder detalhes do erro" : "Ver detalhes do erro"}
        onClick={() => setExpanded((v) => !v)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
          <line x1="8" y1="7" x2="8" y2="11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="4.7" r="0.9" fill="currentColor" />
        </svg>
      </button>
      {expanded && <span className="error-info__text">{message}</span>}
    </span>
  );
}
