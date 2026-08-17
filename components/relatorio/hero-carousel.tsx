"use client";

import { useEffect, useRef, useState } from "react";

export type HeroCarouselPhoto = { id: string; url: string };

const AUTO_ADVANCE_MS = 6000;

export function HeroCarousel({ fotos }: { fotos: HeroCarouselPhoto[] }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (fotos.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % fotos.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [fotos.length]);

  if (fotos.length === 0) return null;

  function anterior() {
    setIndex((i) => (i - 1 + fotos.length) % fotos.length);
  }
  function proxima() {
    setIndex((i) => (i + 1) % fotos.length);
  }

  return (
    <>
      <div className="relatorio-hero__bg" aria-hidden="true">
        {fotos.map((foto, i) => (
          <div
            key={foto.id}
            className="relatorio-hero__bg-slide"
            style={{ backgroundImage: `url(${foto.url})`, opacity: i === index ? 1 : 0 }}
          />
        ))}
      </div>

      {/* Setas de navegação manual só existem dentro do lightbox (depois de
          "Ampliar") -- na página principal, só auto-avanço + bolinhas, pra
          não carregar a foto de capa com controles grandes por cima. */}
      <div className="relatorio-hero__carousel-controls">
        <button
          type="button"
          className="relatorio-hero__carousel-expand"
          aria-label="Ampliar foto"
          onClick={() => dialogRef.current?.showModal()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            photo_library
          </span>
        </button>

        {fotos.length > 1 && (
          <div className="relatorio-hero__carousel-dots">
            {fotos.map((foto, i) => (
              <button
                key={foto.id}
                type="button"
                className={`relatorio-hero__carousel-dot${i === index ? " relatorio-hero__carousel-dot--ativo" : ""}`}
                aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </div>

      <dialog ref={dialogRef} className="relatorio-dialog relatorio-hero__lightbox">
        <div className="relatorio-hero__lightbox-photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotos[index].url} alt="Foto de capa ampliada" className="relatorio-dialog__foto" />
          <button
            type="button"
            className="relatorio-hero__lightbox-close"
            aria-label="Fechar"
            onClick={() => dialogRef.current?.close()}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        {fotos.length > 1 && (
          <div className="relatorio-hero__lightbox-nav">
            <button type="button" className="relatorio-dialog__close" onClick={anterior}>
              <span className="material-symbols-outlined" aria-hidden="true">
                chevron_left
              </span>
              Anterior
            </button>
            <button type="button" className="relatorio-dialog__close" onClick={proxima}>
              Próxima
              <span className="material-symbols-outlined" aria-hidden="true">
                chevron_right
              </span>
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
