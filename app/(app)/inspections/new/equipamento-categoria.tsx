"use client";

import { useState, type ChangeEvent, type FocusEvent } from "react";
import type { EquipamentoCategoriaId } from "@/lib/equipamento/catalog";

type Condicao = "" | "bom" | "atencao";

function itemKey(categoriaId: string, nome: string, index: number): string {
  return `${categoriaId}--${index}`;
}

function EquipamentoItem({
  categoriaId,
  nome,
  index,
  personalizado,
  onVerificadoChange,
}: {
  categoriaId: EquipamentoCategoriaId;
  nome: string;
  index: number;
  personalizado: boolean;
  onVerificadoChange?: (index: number, verificado: boolean) => void;
}) {
  const key = itemKey(categoriaId, nome, index);
  const prefix = `equip__${key}`;
  const [selecionado, setSelecionado] = useState(false);
  const [condicao, setCondicao] = useState<Condicao>("");
  const [expandido, setExpandido] = useState(true);

  function handleSelecionadoChange(e: ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked;
    setSelecionado(checked);
    if (checked) {
      setExpandido(true);
    } else {
      onVerificadoChange?.(index, false);
    }
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

  const compactado = !expandido && condicao !== "";

  return (
    <li className={`equip-item${selecionado ? " equip-item--selecionado" : ""}`} onBlur={handleItemBlur}>
      <input type="hidden" name={`${prefix}__categoria`} value={categoriaId} />
      <input type="hidden" name={`${prefix}__nome`} value={nome} />
      <input type="hidden" name={`${prefix}__personalizado`} value={personalizado ? "1" : "0"} />

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
            />
          </div>

          <div className="equip-item__fotos" hidden={condicao !== "atencao"}>
            <div className="field">
              <label htmlFor={`${prefix}__foto1`} className="label">
                {`Foto 1 (${nome})`}
              </label>
              <input id={`${prefix}__foto1`} name={`${prefix}__foto1`} type="file" accept="image/*" className="input" />
            </div>
            <div className="field">
              <label htmlFor={`${prefix}__foto2`} className="label">
                {`Foto 2 (${nome})`}
              </label>
              <input id={`${prefix}__foto2`} name={`${prefix}__foto2`} type="file" accept="image/*" className="input" />
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
}: {
  categoriaId: EquipamentoCategoriaId;
  label: string;
  itensPreDefinidos: readonly string[];
  itensPersonalizados: string[];
  onAddPersonalizado: () => void;
}) {
  const todosOsItens = [...itensPreDefinidos, ...itensPersonalizados];
  const [verificados, setVerificados] = useState<Set<number>>(new Set());

  function handleVerificadoChange(index: number, verificado: boolean) {
    setVerificados((prev) => {
      const next = new Set(prev);
      if (verificado) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  return (
    <details className="equip-categoria">
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
            onVerificadoChange={handleVerificadoChange}
          />
        ))}
      </ul>
    </details>
  );
}
