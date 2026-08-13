"use client";

import { useEffect } from "react";

// ponytail: <details>/<summary> nativos cobrem o colapsar/expandir sem
// nenhum estado React -- só a impressão precisa de JS, porque um <details>
// fechado nao imprime o conteudo. beforeprint forca tudo aberto e afterprint
// devolve o estado anterior, sem tocar nos que ja estavam abertos.
// Compartilhado entre analise-tecnica.tsx e outros-equipamentos.tsx --
// ambos tem o mesmo padrao de <details> colapsavel dentro de um container.
export function usePrintExpandsDetails(containerRef: React.RefObject<HTMLElement | null>) {
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
