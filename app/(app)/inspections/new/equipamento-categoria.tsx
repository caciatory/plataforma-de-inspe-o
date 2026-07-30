"use client";

import { useState } from "react";
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
}: {
  categoriaId: EquipamentoCategoriaId;
  nome: string;
  index: number;
  personalizado: boolean;
}) {
  const key = itemKey(categoriaId, nome, index);
  const prefix = `equip__${key}`;
  const [selecionado, setSelecionado] = useState(false);
  const [condicao, setCondicao] = useState<Condicao>("");

  return (
    <li className={`equip-item${selecionado ? " equip-item--selecionado" : ""}`}>
      <input type="hidden" name={`${prefix}__categoria`} value={categoriaId} />
      <input type="hidden" name={`${prefix}__nome`} value={nome} />
      <input type="hidden" name={`${prefix}__personalizado`} value={personalizado ? "1" : "0"} />

      <label className="equip-item__check">
        <input
          type="checkbox"
          name={`${prefix}__selecionado`}
          checked={selecionado}
          onChange={(e) => setSelecionado(e.target.checked)}
        />
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
              onChange={() => setCondicao("bom")}
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
              onChange={() => setCondicao("atencao")}
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

  return (
    <details className="equip-categoria" open>
      <summary className="equip-categoria__summary">
        {label}
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
          />
        ))}
      </ul>
    </details>
  );
}
