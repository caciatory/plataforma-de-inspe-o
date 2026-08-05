"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { attachPhotoAction, deletePhotoAction } from "./actions";

export type Photo = { id: string; url: string };

function buildPhotoPath(inspectionId: string, itemTemplateId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/${itemTemplateId}/${Date.now()}-${safeName}`;
}

export function PhotoManager({
  inspectionId,
  itemTemplateId,
  initialPhotos,
  onPhotosChange,
  editable = true,
}: {
  inspectionId: string;
  itemTemplateId: string;
  initialPhotos: Photo[];
  onPhotosChange?: (photos: Photo[]) => void;
  editable?: boolean;
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<Photo | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputId = `photoInput-${itemTemplateId}`;
  const lightboxRef = useRef<HTMLDialogElement>(null);

  function openPhoto(photo: Photo) {
    setExpandedPhoto(photo);
    lightboxRef.current?.showModal();
  }

  function handleUpload(file: File) {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const path = buildPhotoPath(inspectionId, itemTemplateId, file.name);

      const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, file);
      if (uploadError) {
        setError("Não foi possível enviar a foto. Tente novamente.");
        return;
      }

      const { data } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
      const result = await attachPhotoAction(inspectionId, itemTemplateId, data.publicUrl);
      if (result.error || !result.photoId) {
        setError(result.error ?? "Não foi possível anexar a foto.");
        return;
      }

      setPhotos((prev) => {
        const next = [...prev, { id: result.photoId as string, url: data.publicUrl }];
        onPhotosChange?.(next);
        return next;
      });
    });
  }

  function handleDelete(photoId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePhotoAction(photoId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setPhotos((prev) => {
        const next = prev.filter((p) => p.id !== photoId);
        onPhotosChange?.(next);
        return next;
      });
    });
  }

  return (
    <div className="photo-manager">
      <label htmlFor={inputId} className="photo-manager__trigger" title="Adicionar foto" aria-disabled={isPending}>
        <span aria-hidden="true">📷</span>
      </label>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/*"
        aria-label="Foto"
        disabled={isPending || !editable}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      {isPending && <span className="hint">A processar...</span>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {photos.length > 0 && (
        <ul className="photo-grid photo-grid--compact">
          {photos.map((photo) => (
            <li key={photo.id} className="photo-grid__item">
              <button type="button" className="photo-grid__thumb-btn" onClick={() => openPhoto(photo)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Foto anexada ao item" className="photo-grid__thumb" />
              </button>
              <button
                type="button"
                className="btn btn-danger photo-grid__delete"
                onClick={() => handleDelete(photo.id)}
                disabled={isPending || !editable}
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
      <dialog ref={lightboxRef} className="dialog-panel photo-lightbox" onClose={() => setExpandedPhoto(null)}>
        {expandedPhoto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={expandedPhoto.url} alt="Foto ampliada" className="photo-lightbox__img" />
            <button type="button" className="btn btn-secondary" onClick={() => lightboxRef.current?.close()}>
              Fechar
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
