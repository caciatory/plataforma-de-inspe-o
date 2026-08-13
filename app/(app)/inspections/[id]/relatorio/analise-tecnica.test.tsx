import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnaliseTecnica } from "./analise-tecnica";

const groups = [{ id: "g1", ordem: 1, nome: "Pneus" }];
const items = [
  { id: "i1", group_id: "g1", subcategoria: "Rodas", nome: "Pneu dianteiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i2", group_id: "g1", subcategoria: "Rodas", nome: "Pneu traseiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i3", group_id: "g1", subcategoria: "Travões", nome: "Disco dianteiro", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
  { id: "i4", group_id: "g1", subcategoria: "Rodas", nome: "Amortecedor", tipo: "escolha" as const, conjunto_opcao_id: "c1" },
];
const opcoes = [
  { id: "o1", conjunto_id: "c1", label: "Ótimo", ordem: 1, exige_foto: false },
  { id: "o2", conjunto_id: "c1", label: "Médio", ordem: 2, exige_foto: false },
  { id: "o3", conjunto_id: "c1", label: "Mau", ordem: 3, exige_foto: true },
];
const responses = [
  { id: "r1", item_template_id: "i1", opcao_id: "o1", resposta_texto: null, resposta_data: null, observacao: null },
  { id: "r2", item_template_id: "i2", opcao_id: "o3", resposta_texto: null, resposta_data: null, observacao: "Risco fundo" },
  { id: "r3", item_template_id: "i3", opcao_id: "o1", resposta_texto: null, resposta_data: null, observacao: null },
  { id: "r4", item_template_id: "i4", opcao_id: "o2", resposta_texto: null, resposta_data: null, observacao: null },
];
const photos = [{ id: "p1", url: "https://example.com/a.jpg", item_response_id: "r2" }];

describe("AnaliseTecnica", () => {
  it("mostra a contagem OK/atenção/ruim no cabeçalho do grupo (só ícone + número, texto vai no aria-label)", () => {
    const { container } = render(
      <AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />
    );
    expect(screen.getByText("Pneus")).toBeInTheDocument();
    expect(container.querySelector('[aria-label="2 OK"]')).toBeInTheDocument();
    expect(container.querySelector('[aria-label="1 atenção"]')).toBeInTheDocument();
    expect(container.querySelector('[aria-label="1 ruim"]')).toBeInTheDocument();
  });

  it("agrupa os itens por subcategoria, com uma subheading por subcategoria", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />);
    const subheadings = screen.getAllByText(/^(Rodas|Travões)$/);
    expect(subheadings.map((el) => el.textContent)).toEqual(["Rodas", "Travões"]);

    const rodasHeading = screen.getByText("Rodas");
    const rodasList = rodasHeading.nextElementSibling as HTMLElement;
    expect(rodasList.textContent).toContain("Pneu dianteiro");
    expect(rodasList.textContent).toContain("Pneu traseiro");
    expect(rodasList.textContent).not.toContain("Disco dianteiro");

    const travoesHeading = screen.getByText("Travões");
    const travoesList = travoesHeading.nextElementSibling as HTMLElement;
    expect(travoesList.textContent).toContain("Disco dianteiro");
  });

  it("mostra o ícone de foto só no item que tem foto, e abre o diálogo ao clicar", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={photos} />);

    expect(screen.getAllByRole("button", { name: /Ver foto/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Ver foto/ }));
    expect(screen.getByRole("img", { name: "Foto ampliada" })).toHaveAttribute("src", "https://example.com/a.jpg");
  });

  it("mostra o ícone de comentário só no item que tem observação, e abre o diálogo ao clicar", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /Ver comentário/ }));
    expect(screen.getByText("Risco fundo")).toBeInTheDocument();
  });

  it("aplica a classe de piscar só no ícone de comentário de item 'ruim'", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />);
    const botaoComentario = screen.getByRole("button", { name: /Ver comentário/ });
    expect(botaoComentario.className).toContain("relatorio-item__comentario-icon--pisca");
  });

  it("expande todos os grupos colapsados ao disparar o evento beforeprint, e restaura no afterprint", () => {
    render(<AnaliseTecnica groups={groups} items={items} responses={responses} opcoes={opcoes} medicaoResultados={[]} photos={[]} />);
    const details = document.querySelector("details") as HTMLDetailsElement;
    details.open = false;

    fireEvent(window, new Event("beforeprint"));
    expect(details.open).toBe(true);

    fireEvent(window, new Event("afterprint"));
    expect(details.open).toBe(false);
  });
});
