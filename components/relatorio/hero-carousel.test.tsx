import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { HeroCarousel } from "./hero-carousel";

const fotos = [
  { id: "f1", url: "https://example.com/1.jpg" },
  { id: "f2", url: "https://example.com/2.jpg" },
  { id: "f3", url: "https://example.com/3.jpg" },
];

describe("HeroCarousel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("não renderiza nada (sem slides, sem controles) quando fotos está vazio", () => {
    const { container } = render(<HeroCarousel fotos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("clicar numa bolinha muda qual slide tem opacidade 1", () => {
    const { container } = render(<HeroCarousel fotos={fotos} />);
    const slides = container.querySelectorAll(".relatorio-hero__bg-slide");
    expect(slides[0]).toHaveStyle({ opacity: 1 });
    expect(slides[1]).toHaveStyle({ opacity: 0 });

    const dots = screen.getAllByRole("button", { name: /Ver foto \d de 3/ });
    fireEvent.click(dots[1]);

    expect(slides[0]).toHaveStyle({ opacity: 0 });
    expect(slides[1]).toHaveStyle({ opacity: 1 });
    expect(dots[1].className).toContain("relatorio-hero__carousel-dot--ativo");
  });

  it("avança a foto ativa automaticamente depois do intervalo passar", () => {
    vi.useFakeTimers();
    const { container } = render(<HeroCarousel fotos={fotos} />);
    const slides = container.querySelectorAll(".relatorio-hero__bg-slide");
    expect(slides[0]).toHaveStyle({ opacity: 1 });

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(slides[0]).toHaveStyle({ opacity: 0 });
    expect(slides[1]).toHaveStyle({ opacity: 1 });
  });

  it("não avança automaticamente enquanto o lightbox está aberto", () => {
    vi.useFakeTimers();
    const { container } = render(<HeroCarousel fotos={fotos} />);
    const slides = container.querySelectorAll(".relatorio-hero__bg-slide");

    fireEvent.click(screen.getByRole("button", { name: "Ampliar foto" }));
    expect((document.querySelector("dialog") as HTMLDialogElement).open).toBe(true);

    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(slides[0]).toHaveStyle({ opacity: 1 });
    expect(slides[1]).toHaveStyle({ opacity: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(slides[0]).toHaveStyle({ opacity: 0 });
    expect(slides[1]).toHaveStyle({ opacity: 1 });
  });

  it("botão Ampliar abre o lightbox, e as setas do lightbox mudam a foto exibida", () => {
    render(<HeroCarousel fotos={fotos} />);
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Ampliar foto" }));
    expect(dialog.open).toBe(true);

    const imagemAmpliada = screen.getByRole("img", { name: "Foto de capa ampliada" });
    expect(imagemAmpliada).toHaveAttribute("src", fotos[0].url);

    fireEvent.click(screen.getByRole("button", { name: /Próxima/ }));
    expect(screen.getByRole("img", { name: "Foto de capa ampliada" })).toHaveAttribute("src", fotos[1].url);

    fireEvent.click(screen.getByRole("button", { name: /Anterior/ }));
    expect(screen.getByRole("img", { name: "Foto de capa ampliada" })).toHaveAttribute("src", fotos[0].url);
  });
});
