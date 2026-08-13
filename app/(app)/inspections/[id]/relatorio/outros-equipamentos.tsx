"use client";

import { useRef, useState } from "react";

export type EquipamentoRow = {
  id: string;
  categoria: string;
  nome_equipamento: string;
  condicao: "bom" | "atencao";
  comentario: string | null;
  ordem: number;
};
export type EquipamentoFoto = { id: string; url: string; equipamento_inspecao_id: string };

const CONDICAO_ICON: Record<EquipamentoRow["condicao"], string> = {
  bom: "check_circle",
  atencao: "warning",
};

const CONDICAO_LABEL: Record<EquipamentoRow["condicao"], string> = {
  bom: "Bom",
  atencao: "Atenção",
};

// Reaproveita o mesmo vocabulario visual de status da analise tecnica
// (otimo/ruim), so que equipamento so tem 2 estados (bom/atencao), nao 5.
const CONDICAO_STATUS: Record<EquipamentoRow["condicao"], "otimo" | "ruim"> = {
  bom: "otimo",
  atencao: "ruim",
};

function groupByCategoria(equipamentos: EquipamentoRow[]): { categoria: string; itens: EquipamentoRow[] }[] {
  const ordenados = equipamentos.slice().sort((a, b) => a.ordem - b.ordem);
  const order: string[] = [];
  const buckets = new Map<string, EquipamentoRow[]>();
  for (const eq of ordenados) {
    if (!buckets.has(eq.categoria)) {
      order.push(eq.categoria);
      buckets.set(eq.categoria, []);
    }
    buckets.get(eq.categoria)!.push(eq);
  }
  return order.map((categoria) => ({ categoria, itens: buckets.get(categoria)! }));
}

export function OutrosEquipamentos({
  equipamentos,
  fotos,
}: {
  equipamentos: EquipamentoRow[];
  fotos: EquipamentoFoto[];
}) {
  const [fotoAberta, setFotoAberta] = useState<{ id: string; url: string }[] | null>(null);
  const [comentarioAberto, setComentarioAberto] = useState<string | null>(null);
  const fotoDialogRef = useRef<HTMLDialogElement>(null);
  const comentarioDialogRef = useRef<HTMLDialogElement>(null);

  if (equipamentos.length === 0) return null;

  const fotosByEquipamentoId = new Map<string, { id: string; url: string }[]>();
  for (const foto of fotos) {
    const lista = fotosByEquipamentoId.get(foto.equipamento_inspecao_id) ?? [];
    lista.push({ id: foto.id, url: foto.url });
    fotosByEquipamentoId.set(foto.equipamento_inspecao_id, lista);
  }

  const categorias = groupByCategoria(equipamentos);

  return (
    <section className="relatorio-section relatorio-analise">
      <div className="relatorio-section__header">
        <h2>Outros equipamentos</h2>
        <p className="relatorio-section__subtitle">{equipamentos.length} equipamentos verificados.</p>
      </div>
      <div className="relatorio-grupos-grid">
        {categorias.map((grupo) => {
          const ok = grupo.itens.filter((i) => i.condicao !== "atencao").length;
          const atencao = grupo.itens.filter((i) => i.condicao === "atencao").length;
          return (
            <details key={grupo.categoria} className="relatorio-grupo glass">
              <summary className="relatorio-grupo__cabecalho">
                <span className="relatorio-grupo__titulo">
                  <span
                    className={`relatorio-grupo__dot${atencao > 0 ? " relatorio-grupo__dot--atencao" : ""}`}
                    aria-hidden="true"
                  />
                  {grupo.categoria}
                </span>
                <span className="relatorio-grupo__contagem">
                  <span className="relatorio-badge relatorio-badge--ok" aria-label={`${ok} OK`}>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      check_circle
                    </span>
                    <span aria-hidden="true">{ok}</span>
                  </span>
                  {atencao > 0 && (
                    <span className="relatorio-badge relatorio-badge--atencao" aria-label={`${atencao} atenção`}>
                      <span className="material-symbols-outlined" aria-hidden="true">
                        warning
                      </span>
                      <span aria-hidden="true">{atencao}</span>
                    </span>
                  )}
                </span>
              </summary>
              <ul className="relatorio-item-list">
                {grupo.itens.map((item) => {
                  const status = CONDICAO_STATUS[item.condicao];
                  const itemFotos = fotosByEquipamentoId.get(item.id) ?? [];
                  return (
                    <li key={item.id} className={`relatorio-item relatorio-item--${status}`}>
                      <span className={`relatorio-item__icon relatorio-item__icon--${status}`} aria-hidden="true">
                        <span className="material-symbols-outlined">{CONDICAO_ICON[item.condicao]}</span>
                      </span>
                      <span className="relatorio-item__nome">{item.nome_equipamento}</span>
                      <span className={`relatorio-badge relatorio-badge--${status}`}>
                        {CONDICAO_LABEL[item.condicao]}
                      </span>
                      {itemFotos.length > 0 && (
                        <button
                          type="button"
                          className="relatorio-item__foto-icon"
                          aria-label={`Ver foto de ${item.nome_equipamento}`}
                          onClick={() => {
                            setFotoAberta(itemFotos);
                            fotoDialogRef.current?.showModal();
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            photo_camera
                          </span>
                        </button>
                      )}
                      {item.comentario && (
                        <button
                          type="button"
                          className={`relatorio-item__comentario-icon${status === "ruim" ? " relatorio-item__comentario-icon--pisca" : ""}`}
                          aria-label={`Ver comentário de ${item.nome_equipamento}`}
                          onClick={() => {
                            setComentarioAberto(item.comentario);
                            comentarioDialogRef.current?.showModal();
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            chat_bubble
                          </span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>

      <dialog ref={fotoDialogRef} className="relatorio-dialog" onClose={() => setFotoAberta(null)}>
        {fotoAberta?.map((foto) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={foto.id} src={foto.url} alt="Foto ampliada" className="relatorio-dialog__foto" />
        ))}
        <button type="button" className="relatorio-dialog__close" onClick={() => fotoDialogRef.current?.close()}>
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
          Fechar
        </button>
      </dialog>

      <dialog ref={comentarioDialogRef} className="relatorio-dialog" onClose={() => setComentarioAberto(null)}>
        <p>{comentarioAberto}</p>
        <button
          type="button"
          className="relatorio-dialog__close"
          onClick={() => comentarioDialogRef.current?.close()}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
          Fechar
        </button>
      </dialog>
    </section>
  );
}
