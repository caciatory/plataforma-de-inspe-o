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
}: {
  inspectionId: string;
  itemTemplateId: string;
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

      setPhotos((prev) => [...prev, { id: result.photoId as string, url: data.publicUrl }]);
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
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    });
  }

  return (
    <div>
      <label htmlFor="photoInput">Foto</label>
      <input
        id="photoInput"
        type="file"
        accept="image/*"
        disabled={isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      {isPending && <span>A processar...</span>}
      {error && <p role="alert">{error}</p>}
      <ul style={{ listStyle: "none", padding: 0, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {photos.map((photo) => (
          <li key={photo.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" width={120} height={90} style={{ objectFit: "cover" }} />
            <button type="button" onClick={() => handleDelete(photo.id)} disabled={isPending}>
              Excluir
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
