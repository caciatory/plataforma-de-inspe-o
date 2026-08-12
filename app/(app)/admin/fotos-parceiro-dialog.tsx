"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveParceiroAction, attachCapaPhotoAction, deleteCapaPhotoAction } from "./actions";

type Parceiro = { parceiro_nome: string | null; parceiro_logo_url: string | null; parceiro_telefone: string | null };
type Foto = { id: string; url: string };

function buildCapaPhotoPath(inspectionId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/capa/${Date.now()}-${safeName}`;
}

function buildLogoPath(inspectionId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${inspectionId}/parceiro/${Date.now()}-${safeName}`;
}

export function FotosParceiroDialog({
  inspectionId,
  initialParceiro,
  initialFotos,
}: {
  inspectionId: string;
  initialParceiro: Parceiro;
  initialFotos: Foto[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [parceiro, setParceiro] = useState(initialParceiro);
  const [fotos, setFotos] = useState<Foto[]>(initialFotos);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSaveParceiro() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("parceiro_nome", parceiro.parceiro_nome ?? "");
      formData.set("parceiro_logo_url", parceiro.parceiro_logo_url ?? "");
      formData.set("parceiro_telefone", parceiro.parceiro_telefone ?? "");
      const result = await saveParceiroAction(inspectionId, formData);
      if (result.error) setError(result.error);
    });
  }

  function handleUploadLogo(file: File) {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const path = buildLogoPath(inspectionId, file.name);

      const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, file);
      if (uploadError) {
        setError("Não foi possível enviar o logo. Tente novamente.");
        return;
      }

      const { data } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
      setParceiro((p) => ({ ...p, parceiro_logo_url: data.publicUrl }));
    });
  }

  function handleUploadCapa(file: File) {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const path = buildCapaPhotoPath(inspectionId, file.name);

      const { error: uploadError } = await supabase.storage.from("fotos-inspecao").upload(path, file);
      if (uploadError) {
        setError("Não foi possível enviar a foto. Tente novamente.");
        return;
      }

      const { data } = supabase.storage.from("fotos-inspecao").getPublicUrl(path);
      const result = await attachCapaPhotoAction(inspectionId, data.publicUrl);
      if (result.error || !result.photoId) {
        setError(result.error ?? "Não foi possível anexar a foto.");
        return;
      }

      setFotos((prev) => [...prev, { id: result.photoId as string, url: data.publicUrl }]);
    });
  }

  function handleDeleteCapa(photoId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteCapaPhotoAction(photoId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setFotos((prev) => prev.filter((f) => f.id !== photoId));
    });
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn--icon" onClick={() => dialogRef.current?.showModal()}>
        Fotos & Parceiro
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        <div className="stack">
          <h2>Fotos de capa e parceiro</h2>

          <div className="field">
            <label htmlFor="parceiro-nome" className="label">
              Nome do parceiro
            </label>
            <input
              id="parceiro-nome"
              className="input"
              value={parceiro.parceiro_nome ?? ""}
              onChange={(e) => setParceiro((p) => ({ ...p, parceiro_nome: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="parceiro-telefone" className="label">
              Telefone (WhatsApp)
            </label>
            <input
              id="parceiro-telefone"
              className="input"
              value={parceiro.parceiro_telefone ?? ""}
              onChange={(e) => setParceiro((p) => ({ ...p, parceiro_telefone: e.target.value }))}
            />
          </div>
          <div className="field">
            <span className="label">Logo do parceiro</span>
            {parceiro.parceiro_logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={parceiro.parceiro_logo_url} alt="Logo do parceiro" className="photo-grid__thumb" />
            )}
            <label htmlFor="parceiro-logo-input" className="btn btn-secondary" aria-disabled={isPending}>
              {parceiro.parceiro_logo_url ? "Alterar logo" : "Adicionar logo"}
            </label>
            <input
              id="parceiro-logo-input"
              className="sr-only"
              type="file"
              accept="image/*"
              disabled={isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadLogo(file);
                e.target.value = "";
              }}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={handleSaveParceiro} disabled={isPending}>
            Guardar parceiro
          </button>

          <hr />

          <label htmlFor="capa-input" className="btn btn-secondary" aria-disabled={isPending}>
            Adicionar foto de capa
          </label>
          <input
            id="capa-input"
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadCapa(file);
              e.target.value = "";
            }}
          />
          {fotos.length > 0 && (
            <ul className="photo-grid photo-grid--compact">
              {fotos.map((foto) => (
                <li key={foto.id} className="photo-grid__item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto.url} alt="Foto de capa" className="photo-grid__thumb" />
                  <button
                    type="button"
                    className="btn btn-danger photo-grid__delete"
                    onClick={() => handleDeleteCapa(foto.id)}
                    disabled={isPending}
                  >
                    Excluir
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}

          <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
            Fechar
          </button>
        </div>
      </dialog>
    </>
  );
}
