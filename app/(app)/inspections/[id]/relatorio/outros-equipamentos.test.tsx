import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutrosEquipamentos } from "./outros-equipamentos";

const equipamentos = [
  { id: "e1", categoria: "Interior", nome_equipamento: "Ar condicionado", condicao: "bom" as const, comentario: null, ordem: 0 },
  {
    id: "e2",
    categoria: "Interior",
    nome_equipamento: "Elevadores de vidro",
    condicao: "atencao" as const,
    comentario: "Vidro traseiro direito lento",
    ordem: 1,
  },
  { id: "e3", categoria: "Exterior", nome_equipamento: "Jantes", condicao: "bom" as const, comentario: null, ordem: 0 },
];
const fotos = [{ id: "f1", url: "https://example.com/vidro.jpg", equipamento_inspecao_id: "e2" }];

describe("OutrosEquipamentos", () => {
  it("não renderiza nada quando não há equipamentos", () => {
    const { container } = render(<OutrosEquipamentos equipamentos={[]} fotos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("agrupa por categoria com contagem OK/atenção no cabeçalho (só ícone + número, texto vai no aria-label)", () => {
    const { container } = render(<OutrosEquipamentos equipamentos={equipamentos} fotos={fotos} />);
    expect(screen.getByText("Interior")).toBeInTheDocument();
    expect(screen.getByText("Exterior")).toBeInTheDocument();
    // Interior: 1 bom + 1 atencao -> "1 OK"/"1 atenção"; Exterior: 1 bom -> "1 OK" tambem
    expect(container.querySelectorAll('[aria-label="1 OK"]')).toHaveLength(2);
    expect(container.querySelector('[aria-label="1 atenção"]')).toBeInTheDocument();
  });

  it("mostra o ícone de foto só no equipamento que tem foto, e abre o diálogo ao clicar", () => {
    render(<OutrosEquipamentos equipamentos={equipamentos} fotos={fotos} />);
    expect(screen.getAllByRole("button", { name: /Ver foto/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Ver foto/ }));
    expect(screen.getByRole("img", { name: "Foto ampliada" })).toHaveAttribute("src", "https://example.com/vidro.jpg");
  });

  it("mostra o ícone de comentário só no equipamento com observação, e pisca por estar em atenção", () => {
    render(<OutrosEquipamentos equipamentos={equipamentos} fotos={[]} />);
    const botaoComentario = screen.getByRole("button", { name: /Ver comentário/ });
    expect(botaoComentario.className).toContain("relatorio-item__comentario-icon--pisca");

    fireEvent.click(botaoComentario);
    expect(screen.getByText("Vidro traseiro direito lento")).toBeInTheDocument();
  });

  it("expande todos os grupos colapsados ao disparar o evento beforeprint, e restaura no afterprint", () => {
    render(<OutrosEquipamentos equipamentos={equipamentos} fotos={[]} />);
    const details = document.querySelector("details") as HTMLDetailsElement;
    details.open = false;

    fireEvent(window, new Event("beforeprint"));
    expect(details.open).toBe(true);

    fireEvent(window, new Event("afterprint"));
    expect(details.open).toBe(false);
  });
});
