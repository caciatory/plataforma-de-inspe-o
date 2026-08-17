"use client";

// Segundo gatilho pro mesmo lightbox do HeroCarousel (id="relatorio-hero-lightbox")
// -- vive fora dele porque este botão fica junto da "Data da inspeção" no
// dashboard, não em cima da foto de capa. Abrir via getElementById em vez de
// erguer estado/ref compartilhado: os dois ficam em subárvores de Server
// Component irmãs, sem ancestral comum que possa segurar esse estado.
export function VerFotosButton() {
  return (
    <button
      type="button"
      className="relatorio-hero__carousel-expand relatorio-hero__carousel-expand--inline"
      aria-label="Ver fotos"
      onClick={() => (document.getElementById("relatorio-hero-lightbox") as HTMLDialogElement | null)?.showModal()}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        photo_library
      </span>
    </button>
  );
}
