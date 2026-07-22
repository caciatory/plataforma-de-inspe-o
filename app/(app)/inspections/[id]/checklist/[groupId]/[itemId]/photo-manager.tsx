"use client";

import { useState, useTransition } from "react";
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
}: {
  inspectionId: string;
  itemTemplateId: string;
  initialPhotos: Photo[];
  onPhotosChange?: (photos: Photo[]) => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputId = `photoInput-${itemTemplateId}`;

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
      <div className="field">
        <label htmlFor={inputId} className="label">
          Foto
        </label>
        <input
          id={inputId}
          className="photo-manager__input"
          type="file"
          accept="image/*"
          disabled={isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
      </div>
      {isPending && <span className="hint">A processar...</span>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <ul className="photo-grid">
        {photos.map((photo) => (
          <li key={photo.id} className="photo-grid__item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="Foto anexada ao item" width={120} height={90} className="photo-grid__thumb" />
            <button
              type="button"
              className="btn btn-danger photo-grid__delete"
              onClick={() => handleDelete(photo.id)}
              disabled={isPending}
            >
              Excluir
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
