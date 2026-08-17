"use client";

import { useRef, useState, type ChangeEvent, type FocusEvent } from "react";
import type { EquipamentoCategoriaId } from "@/lib/equipamento/catalog";
import { compressImage } from "@/lib/upload/compress-image";

// O input de foto e nativo (sem estado React), pra continuar submetendo
// pelo form normal do navegador -- comprime e substitui input.files via
// DataTransfer antes do envio, em vez de virar um upload controlado.
async function handleFotoChange(e: ChangeEvent<HTMLInputElement>) {
  const input = e.target;
  const file = input.files?.[0];
  if (!file) return;
  const compressed = await compressImage(file);
  if (compressed === file) return;
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(compressed);
  input.files = dataTransfer.files;
}

type Condicao = "" | "bom" | "atencao";

export type EquipamentoInitial = {
  id: string;
  condicao: "bom" | "atencao";
  comentario: string | null;
  foto1Url: string | null;
  foto2Url: string | null;
};

function itemKey(categoriaId: string, nome: string, index: number): string {
  return `${categoriaId}--${index}`;
}

function EquipamentoItem({
  categoriaId,
  nome,
  index,
  personalizado,
  initial,
  onVerificadoChange,
  onRemovido,
}: {
  categoriaId: EquipamentoCategoriaId;
  nome: string;
  index: number;
  personalizado: boolean;
  initial?: EquipamentoInitial;
  onVerificadoChange?: (index: number, verificado: boolean) => void;
  onRemovido?: (id: string) => void;
}) {
  const key = itemKey(categoriaId, nome, index);
  const prefix = `equip__${key}`;
  const [selecionado, setSelecionado] = useState(initial !== undefined);
  const [condicao, setCondicao] = useState<Condicao>(initial?.condicao ?? "");
  const [expandido, setExpandido] = useState(true);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);

  function handleSelecionadoChange(e: ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    if (!checked && initial) {
      // Unchecking a previously-existing item: don't apply it yet, ask first.
      // Reverting the native checkbox back to checked (it already unchecked
      // itself visually) keeps state and DOM in sync until confirmed.
      e.target.checked = true;
      confirmDialogRef.current?.showModal();
      return;
    }
    setSelecionado(checked);
    if (checked) {
      setExpandido(true);
      onVerificadoChange?.(index, condicao !== "");
    } else {
      onVerificadoChange?.(index, false);
    }
  }

  function handleConfirmRemocao() {
    confirmDialogRef.current?.close();
    setSelecionado(false);
    onVerificadoChange?.(index, false);
    if (initial) onRemovido?.(initial.id);
  }

  function handleCondicaoChange(novaCondicao: Condicao) {
    setCondicao(novaCondicao);
    onVerificadoChange?.(index, novaCondicao !== "");
  }

  // Só compacta quando o foco sai do item inteiro (não ao tabular entre
  // condição/comentário/foto do mesmo item) e só depois de uma condição
  // escolhida — vale igual pra "Bom" e "Atenção".
  function handleItemBlur(e: FocusEvent<HTMLLIElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (condicao !== "") setExpandido(false);
  }

  const compactado = !expandido && selecionado && condicao !== "";

  return (
    <li className={`equip-item${selecionado ? " equip-item--selecionado" : ""}`} onBlur={handleItemBlur}>
      <input type="hidden" name={`${prefix}__categoria`} value={categoriaId} />
      <input type="hidden" name={`${prefix}__nome`} value={nome} />
      <input type="hidden" name={`${prefix}__personalizado`} value={personalizado ? "1" : "0"} />
      {initial && <input type="hidden" name={`${prefix}__id`} value={initial.id} />}

      {initial && (
        <dialog ref={confirmDialogRef} className="dialog-panel">
          <div className="stack">
            <p>Remover "{nome}"? Isto apaga as fotos anexadas.</p>
            <div className="stack-row">
              <button type="button" className="btn btn-secondary" onClick={() => confirmDialogRef.current?.close()}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={handleConfirmRemocao}>
                Confirmar remoção
              </button>
            </div>
          </div>
        </dialog>
      )}

      <div hidden={compactado}>
        <label className="equip-item__check">
          <input type="checkbox" name={`${prefix}__selecionado`} checked={selecionado} onChange={handleSelecionadoChange} />
          {nome}
        </label>

        <div className="equip-item__answer" hidden={!selecionado}>
          <div className="equip-item__condicao">
            <label>
              <input
                type="radio"
                name={`${prefix}__condicao`}
                value="bom"
                required={selecionado}
                checked={condicao === "bom"}
                onChange={() => handleCondicaoChange("bom")}
                aria-label={`✓ Bom (${nome})`}
              />
              ✓ Bom
            </label>
            <label>
              <input
                type="radio"
                name={`${prefix}__condicao`}
                value="atencao"
                required={selecionado}
                checked={condicao === "atencao"}
                onChange={() => handleCondicaoChange("atencao")}
                aria-label={`⚠️ Atenção (${nome})`}
              />
              ⚠️ Atenção
            </label>
          </div>

          <div className="field" hidden={condicao !== "atencao"}>
            <label htmlFor={`${prefix}__comentario`} className="label">
              {`Comentário (${nome})`}
            </label>
            <textarea
              id={`${prefix}__comentario`}
              name={`${prefix}__comentario`}
              className="input"
              placeholder="Adicionar comentário..."
              defaultValue={initial?.comentario ?? ""}
            />
          </div>

          <div className="equip-item__fotos" hidden={condicao !== "atencao"}>
            <div className="field">
              <label htmlFor={`${prefix}__foto1`} className="label">
                {`Foto 1 (${nome})`}
              </label>
              {initial?.foto1Url && (
                <p className="hint">
                  Foto atual anexada — escolher um novo arquivo substitui.
                </p>
              )}
              <input
                id={`${prefix}__foto1`}
                name={`${prefix}__foto1`}
                type="file"
                accept="image/*"
                className="input"
                onChange={handleFotoChange}
              />
            </div>
            <div className="field">
              <label htmlFor={`${prefix}__foto2`} className="label">
                {`Foto 2 (${nome})`}
              </label>
              {initial?.foto2Url && (
                <p className="hint">
                  Foto atual anexada — escolher um novo arquivo substitui.
                </p>
              )}
              <input
                id={`${prefix}__foto2`}
                name={`${prefix}__foto2`}
                type="file"
                accept="image/*"
                className="input"
                onChange={handleFotoChange}
              />
            </div>
          </div>
        </div>
      </div>

      {compactado && (
        <button type="button" className="equip-item__resumo" onClick={() => setExpandido(true)}>
          {nome} — {condicao === "bom" ? "✓ Bom" : "⚠️ Atenção"}
        </button>
      )}
    </li>
  );
}

export function EquipamentoCategoria({
  categoriaId,
  label,
  itensPreDefinidos,
  itensPersonalizados,
  onAddPersonalizado,
  initialSelecionados = {},
  onRemovido,
}: {
  categoriaId: EquipamentoCategoriaId;
  label: string;
  itensPreDefinidos: readonly string[];
  itensPersonalizados: string[];
  onAddPersonalizado: () => void;
  initialSelecionados?: Record<string, EquipamentoInitial>;
  onRemovido?: (id: string) => void;
}) {
  const todosOsItens = [...itensPreDefinidos, ...itensPersonalizados];
  const [verificados, setVerificados] = useState<Set<number>>(
    new Set(todosOsItens.map((nome, i) => (initialSelecionados[nome] ? i : -1)).filter((i) => i >= 0))
  );

  function handleVerificadoChange(index: number, verificado: boolean) {
    setVerificados((prev) => {
      const next = new Set(prev);
      if (verificado) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  return (
    <details className="equip-categoria" open={Object.keys(initialSelecionados).length > 0}>
      <summary className="equip-categoria__summary">
        <span className="equip-categoria__titulo">
          {label}
          {verificados.size > 0 && (
            <span className="equip-categoria__badge">
              ✓ {verificados.size}/{todosOsItens.length} verificados
            </span>
          )}
        </span>
        <button
          type="button"
          className="btn btn-secondary equip-categoria__add"
          onClick={(e) => {
            e.preventDefault();
            onAddPersonalizado();
          }}
        >
          +
        </button>
      </summary>
      <ul className="equip-categoria__lista">
        {todosOsItens.map((nome, index) => (
          <EquipamentoItem
            key={itemKey(categoriaId, nome, index)}
            categoriaId={categoriaId}
            nome={nome}
            index={index}
            personalizado={index >= itensPreDefinidos.length}
            initial={initialSelecionados[nome]}
            onVerificadoChange={handleVerificadoChange}
            onRemovido={onRemovido}
          />
        ))}
      </ul>
    </details>
  );
}
