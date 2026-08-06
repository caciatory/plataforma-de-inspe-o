"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createTecnicoAction, toggleTecnicoBanAction, type CreateTecnicoState, type ToggleTecnicoState } from "./actions";

export type TecnicoRow = { id: string; nome: string; email: string; ativo: boolean };

const createInitialState: CreateTecnicoState = { status: "idle" };
const toggleInitialState: ToggleTecnicoState = { status: "idle" };

export function TecnicosTable({ rows }: { rows: TecnicoRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [createState, createFormAction, isCreating] = useActionState(createTecnicoAction, createInitialState);
  const [toggleState, toggleFormAction] = useActionState(toggleTecnicoBanAction, toggleInitialState);

  useEffect(() => {
    if (createState.status === "success") {
      dialogRef.current?.close();
      router.refresh();
    }
  }, [createState, router]);

  useEffect(() => {
    if (toggleState.status === "success") router.refresh();
  }, [toggleState, router]);

  return (
    <div className="stack">
      <button type="button" className="btn btn-primary" onClick={() => dialogRef.current?.showModal()}>
        Criar técnico
      </button>
      <dialog ref={dialogRef} className="dialog-panel">
        <form action={createFormAction} className="stack">
          <div className="field">
            <label htmlFor="nome" className="label">
              Nome
            </label>
            <input id="nome" name="nome" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="email" className="label">
              Email
            </label>
            <input id="email" name="email" type="email" className="input" required />
          </div>
          <div className="field">
            <label htmlFor="senha" className="label">
              Senha temporária
            </label>
            <input id="senha" name="senha" type="password" className="input" minLength={8} required />
          </div>
          <div className="stack-row">
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isCreating}>
              Criar
            </button>
          </div>
          {createState.status === "error" && (
            <p role="alert" className="error-text">
              {createState.message}
            </p>
          )}
        </form>
      </dialog>

      <table className="item-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Estado</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{t.nome}</td>
              <td>{t.email}</td>
              <td>
                <span className={`status-pill ${t.ativo ? "status-pill--success" : "status-pill--danger"}`}>
                  {t.ativo ? "Ativo" : "Desativado"}
                </span>
              </td>
              <td>
                <form action={toggleFormAction}>
                  <input type="hidden" name="tecnicoId" value={t.id} />
                  <input type="hidden" name="ban" value={String(t.ativo)} />
                  <button type="submit" className="btn btn-secondary">
                    {t.ativo ? "Desativar" : "Reativar"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
