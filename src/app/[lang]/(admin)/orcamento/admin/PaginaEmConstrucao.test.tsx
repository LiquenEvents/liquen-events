// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaginaEmConstrucao, type FotoDaPagina } from "./PaginaEmConstrucao";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PÁGINA A GANHAR FORMA, ENQUANTO SE ESCOLHE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «deixa de se escolher às cegas e passa a compor-se: vê-se a
 * página a ganhar forma, e percebe-se imediatamente quando há fotos a mais».
 *
 * O que se prende aqui é o que esse canto tem de responder sem falhar: quantas
 * já lá estão, quantas vão entrar, e quando é que o tema passa a ocupar mais
 * do que uma página do PDF (no desenho novo nenhuma fica de fora).
 */

/** O ecrã dela. Por omissão o jsdom é largo, que é o caso do computador. */
function estreitar(px: number) {
  Object.defineProperty(window, "innerWidth", { value: px, configurable: true });
}

const fotos = (n: number, prefixo: string): FotoDaPagina[] =>
  Array.from({ length: n }, (_, i) => ({
    path: `${prefixo}/foto-${i + 1}.jpg`,
    url: `https://cdn.test/${prefixo}-${i + 1}.jpg`,
  }));

beforeEach(() => {
  localStorage.clear();
  estreitar(1024);
});
afterEach(cleanup);

describe("a página em construção", () => {
  it("não aparece quando não há nada para mostrar", () => {
    const { container } = render(<PaginaEmConstrucao jaLa={[]} aEntrar={[]} maximo={12} />);
    expect(container.innerHTML).toBe("");
  });

  it("conta o que a página JÁ tem mais o que vai entrar", () => {
    render(<PaginaEmConstrucao jaLa={fotos(3, "a")} aEntrar={fotos(2, "b")} maximo={12} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText(/de 12/)).toBeTruthy();
  });

  /**
   * NENHUMA FICA DE FORA.
   *
   * No PDF antigo as que passavam de dez não saíam. No novo o tema passa a
   * ocupar mais uma página — diz-se, para ela decidir se a quer.
   */
  it("acima de uma página diz quantas o tema ocupa", () => {
    render(<PaginaEmConstrucao jaLa={fotos(10, "a")} aEntrar={fotos(4, "b")} maximo={12} />);
    expect(screen.getByText("Ocupa 2 páginas no PDF")).toBeTruthy();
    expect(screen.queryByText(/não entra/)).toBeNull();
  });

  it("dentro de uma página, não inventa avisos", () => {
    render(<PaginaEmConstrucao jaLa={fotos(8, "a")} aEntrar={fotos(4, "b")} maximo={12} />);
    expect(screen.queryByText(/Ocupa/)).toBeNull();
  });

  it("as que vão entrar distinguem-se das que já lá estão", () => {
    const { container } = render(
      <PaginaEmConstrucao jaLa={fotos(2, "a")} aEntrar={fotos(1, "b")} maximo={12} />,
    );
    const celulas = container.querySelectorAll("span.aspect-square");
    expect(celulas).toHaveLength(3);
    expect(celulas[0].className).not.toContain("ring-sage-600");
    expect(celulas[2].className, "a que vai entrar leva moldura").toContain("ring-sage-600");
  });

  it("nenhuma aparece apagada — no PDF novo todas saem", () => {
    const { container } = render(
      <PaginaEmConstrucao jaLa={fotos(2, "a")} aEntrar={fotos(2, "b")} maximo={3} />,
    );
    const celulas = container.querySelectorAll("span.aspect-square");
    expect([...celulas].some((c) => c.className.includes("opacity-40"))).toBe(false);
  });

  /**
   * Nove miniaturas e não vinte: é um canto de 120 px. Mas o NÚMERO tem de
   * continuar certo, senão o canto mente sobre o que está a mostrar.
   */
  it("com muitas fotos mostra nove e di-lo", () => {
    const { container } = render(
      <PaginaEmConstrucao jaLa={fotos(14, "a")} aEntrar={[]} maximo={12} />,
    );
    expect(container.querySelectorAll("span.aspect-square")).toHaveLength(9);
    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText(/mostra 9/)).toBeTruthy();
  });

  it("usa o título da página, e tem um nome quando ela não lhe deu um", () => {
    const { rerender } = render(
      <PaginaEmConstrucao
        titulo="Jardim ao entardecer"
        jaLa={fotos(1, "a")}
        aEntrar={[]}
        maximo={12}
      />,
    );
    expect(screen.getByText("Jardim ao entardecer")).toBeTruthy();
    rerender(<PaginaEmConstrucao titulo="   " jaLa={fotos(1, "a")} aEntrar={[]} maximo={12} />);
    expect(screen.getByText("Esta página")).toBeTruthy();
  });

  /**
   * DISPENSÁVEL, PALAVRAS DELA.
   *
   * Fechar não pode ser esconder a contagem: quem não quer o canto continua a
   * precisar de saber quantas leva — e de poder voltar a abri-lo.
   */
  it("fecha-se, e fechada continua a dizer quantas são", () => {
    render(<PaginaEmConstrucao jaLa={fotos(10, "a")} aEntrar={fotos(4, "b")} maximo={12} />);
    fireEvent.click(screen.getByRole("button", { name: "Esconder a página em construção" }));
    const pastilha = screen.getByRole("button");
    expect(pastilha.textContent).toContain("14 fotos");
    expect(pastilha.textContent, "e a conta das páginas não se perde ao fechar").toContain(
      "2 páginas",
    );
    fireEvent.click(pastilha);
    expect(screen.getByText("Ocupa 2 páginas no PDF")).toBeTruthy();
  });

  it("e lembra-se de que foi fechada da próxima vez", () => {
    render(<PaginaEmConstrucao jaLa={fotos(2, "a")} aEntrar={[]} maximo={12} />);
    fireEvent.click(screen.getByRole("button", { name: "Esconder a página em construção" }));
    cleanup();
    render(<PaginaEmConstrucao jaLa={fotos(2, "a")} aEntrar={[]} maximo={12} />);
    expect(screen.queryByText(/de 12/)).toBeNull();
    expect(screen.getByRole("button").textContent).toContain("2 fotos");
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * NO TELEMÓVEL COMEÇA FECHADA
   * ═══════════════════════════════════════════════════════════════════════
   *
   * MEDIDO no ecrã dela: a 390 px a grelha tem duas colunas de 171 px, e um
   * cartão de 120 px pousado no canto tapa uma fotografia inteira. Tapar uma
   * foto é pior do que roubar-lhe espaço — a foto ainda lá está e não se vê.
   */
  it("num ecrã estreito começa fechada, e continua a dizer a conta", () => {
    estreitar(390);
    render(<PaginaEmConstrucao jaLa={fotos(9, "a")} aEntrar={fotos(4, "b")} maximo={12} />);
    expect(screen.queryByLabelText("A página em construção")).toBeNull();
    const pastilha = screen.getByRole("button");
    expect(pastilha.textContent).toContain("13 fotos");
    expect(pastilha.textContent).toContain("2 páginas");
  });

  it("e no computador, onde não tapa nada, começa aberta", () => {
    estreitar(1024);
    render(<PaginaEmConstrucao jaLa={fotos(2, "a")} aEntrar={[]} maximo={12} />);
    expect(screen.getByLabelText("A página em construção")).toBeTruthy();
  });

  it("mas uma escolha dela manda em qualquer largura", () => {
    estreitar(390);
    localStorage.setItem("liquen-pagina-em-construcao", "1");
    render(<PaginaEmConstrucao jaLa={fotos(2, "a")} aEntrar={[]} maximo={12} />);
    expect(screen.getByLabelText("A página em construção")).toBeTruthy();
  });

  /**
   * UMA MINIATURA QUE NÃO EXISTE NÃO PODE DAR UM ÍCONE PARTIDO.
   *
   * Assinar um caminho no Supabase devolve um URL bem formado para um ficheiro
   * que pode não estar lá — quem descobre é o browser, com um 404. Sem plano B,
   * o canto mostrava nove ícones de imagem partida em vez de nove fotografias.
   */
  it("uma miniatura que falha cai para o original", () => {
    const { container } = render(
      <PaginaEmConstrucao
        jaLa={[
          {
            path: "a/1.jpg",
            url: "https://cdn.test/mini.jpg",
            planoB: "https://cdn.test/original.jpg",
          },
        ]}
        aEntrar={[]}
        maximo={12}
      />,
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://cdn.test/mini.jpg");
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe("https://cdn.test/original.jpg");
  });
});
