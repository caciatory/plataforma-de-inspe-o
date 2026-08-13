"use client";

import { useRef } from "react";

export function CertificadoInfoButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="relatorio-info-icon"
        aria-label="O que é o código de certificado?"
        onClick={() => dialogRef.current?.showModal()}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          info
        </span>
      </button>
      <dialog ref={dialogRef} className="relatorio-dialog relatorio-info-dialog">
        <h3>Código de certificado</h3>
        <p>
          Toda inspeção aprovada pela Check Auto recebe um código de certificado único e não sequencial, gerado
          automaticamente no momento da aprovação.
        </p>
        <p>
          Esse código serve para confirmar que este relatório é autêntico e corresponde à inspeção realizada. Para
          conferir, acesse <strong>checkauto.pt</strong> e informe o código acima.
        </p>
        <button type="button" className="relatorio-dialog__close" onClick={() => dialogRef.current?.close()}>
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
          Fechar
        </button>
      </dialog>
    </>
  );
}
