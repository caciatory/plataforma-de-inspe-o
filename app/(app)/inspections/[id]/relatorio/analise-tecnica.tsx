"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildRelatorioGrupos,
  type RelatorioGroupTemplate,
  type RelatorioItemTemplate,
  type RelatorioResponse,
  type RelatorioOpcao,
  type RelatorioMedicaoResultado,
  type RelatorioPhoto,
  type ReportItem,
  type ReportItemStatus,
} from "@/lib/report/build-relatorio";

// Icone Material Symbols por status do item -- vocabulario reduzido (nao ha
// como curar um icone por nome de item real, sao 320 nomes dinamicos).
const ITEM_STATUS_ICON: Record<ReportItemStatus, string> = {
  otimo: "check_circle",
  medio: "info",
  ruim: "warning",
  na: "remove_circle",
  info: "radio_button_unchecked",
};

// Agrupa por subcategoria preservando a ordem de primeira aparicao (mesma
// convencao de groupItemsBySubcategoria em lib/checklist/progress.ts, que
// via localeCompare com "" acaba colocando subcategoria=null primeiro).
function groupBySubcategoria(items: ReportItem[]): { subcategoria: string | null; items: ReportItem[] }[] {
  const order: (string | null)[] = [];
  const buckets = new Map<string | null, ReportItem[]>();
  for (const item of items) {
    if (!buckets.has(item.subcategoria)) {
      order.push(item.subcategoria);
      buckets.set(item.subcategoria, []);
    }
    buckets.get(item.subcategoria)!.push(item);
  }
  return order.map((subcategoria) => ({ subcategoria, items: buckets.get(subcategoria)! }));
}

// ponytail: <details>/<summary> nativos cobrem o colapsar/expandir sem
// nenhum estado React -- só a impressão precisa de JS, porque um <details>
// fechado nao imprime o conteudo. beforeprint forca tudo aberto e afterprint
// devolve o estado anterior, sem tocar nos que ja estavam abertos.
function usePrintExpandsDetails(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    function expandAll() {
      const list = containerRef.current?.querySelectorAll("details") ?? [];
      list.forEach((d) => {
        if (!d.open) {
          d.setAttribute("data-relatorio-fechado-antes", "true");
          d.open = true;
        }
      });
    }
    function restore() {
      const list = containerRef.current?.querySelectorAll("details[data-relatorio-fechado-antes='true']") ?? [];
      list.forEach((d) => {
        (d as HTMLDetailsElement).open = false;
        d.removeAttribute("data-relatorio-fechado-antes");
      });
    }
    window.addEventListener("beforeprint", expandAll);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", expandAll);
      window.removeEventListener("afterprint", restore);
    };
  }, [containerRef]);
}

export function AnaliseTecnica({
  groups,
  items,
  responses,
  opcoes,
  medicaoResultados,
  photos,
}: {
  groups: RelatorioGroupTemplate[];
  items: RelatorioItemTemplate[];
  responses: RelatorioResponse[];
  opcoes: RelatorioOpcao[];
  medicaoResultados: RelatorioMedicaoResultado[];
  photos: RelatorioPhoto[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  usePrintExpandsDetails(containerRef);

  const [fotoAberta, setFotoAberta] = useState<{ id: string; url: string }[] | null>(null);
  const [comentarioAberto, setComentarioAberto] = useState<string | null>(null);
  const fotoDialogRef = useRef<HTMLDialogElement>(null);
  const comentarioDialogRef = useRef<HTMLDialogElement>(null);

  const grupos = buildRelatorioGrupos(groups, items, responses, opcoes, medicaoResultados, photos);
  const totalItens = grupos.reduce((soma, grupo) => soma + grupo.items.length, 0);

  return (
    <section className="relatorio-section relatorio-analise" ref={containerRef}>
      <div className="relatorio-section__header">
        <h2>Análise técnica</h2>
        <p className="relatorio-section__subtitle">{totalItens} pontos de controlo verificados.</p>
      </div>
      <div className="relatorio-grupos-grid">
      {grupos.map((grupo) => (
        <details key={grupo.id} className="relatorio-grupo glass">
          <summary className="relatorio-grupo__cabecalho">
            <span className="relatorio-grupo__titulo">
              <span
                className={`relatorio-grupo__dot${grupo.medio > 0 || grupo.ruim > 0 ? " relatorio-grupo__dot--atencao" : ""}`}
                aria-hidden="true"
              />
              {grupo.nome}
            </span>
            <span className="relatorio-grupo__contagem">
              <span className="relatorio-badge relatorio-badge--ok" aria-label={`${grupo.ok} OK`}>
                <span className="material-symbols-outlined" aria-hidden="true">
                  check_circle
                </span>
                <span aria-hidden="true">{grupo.ok}</span>
              </span>
              {grupo.medio > 0 && (
                <span className="relatorio-badge relatorio-badge--medio" aria-label={`${grupo.medio} atenção`}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    warning
                  </span>
                  <span aria-hidden="true">{grupo.medio}</span>
                </span>
              )}
              {grupo.ruim > 0 && (
                <span className="relatorio-badge relatorio-badge--ruim" aria-label={`${grupo.ruim} ruim`}>
                  <span className="material-symbols-outlined" aria-hidden="true">
                    error
                  </span>
                  <span aria-hidden="true">{grupo.ruim}</span>
                </span>
              )}
            </span>
          </summary>
          {groupBySubcategoria(grupo.items).map((sub) => (
            <div key={sub.subcategoria ?? "__sem-subcategoria__"}>
              {sub.subcategoria && <p className="relatorio-item-list__subcategoria">{sub.subcategoria}</p>}
              <ul className="relatorio-item-list">
                {sub.items.map((item) => (
                  <li key={item.id} className={`relatorio-item relatorio-item--${item.status}`}>
                    <span className={`relatorio-item__icon relatorio-item__icon--${item.status}`} aria-hidden="true">
                      <span className="material-symbols-outlined">{ITEM_STATUS_ICON[item.status]}</span>
                    </span>
                    <span className="relatorio-item__nome">{item.nome}</span>
                    <span className={`relatorio-badge relatorio-badge--${item.status}`}>{item.respostaLabel}</span>
                    {item.fotos.length > 0 && (
                      <button
                        type="button"
                        className="relatorio-item__foto-icon"
                        aria-label={`Ver foto de ${item.nome}`}
                        onClick={() => {
                          setFotoAberta(item.fotos);
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
                        className={`relatorio-item__comentario-icon${item.piscaComentario ? " relatorio-item__comentario-icon--pisca" : ""}`}
                        aria-label={`Ver comentário de ${item.nome}`}
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
                ))}
              </ul>
            </div>
          ))}
        </details>
      ))}
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
