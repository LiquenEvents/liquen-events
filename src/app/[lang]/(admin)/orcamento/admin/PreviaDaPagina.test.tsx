// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import PreviaDaPagina from "./PreviaDaPagina";
import {
  PAGINA_H,
  PAGINA_M,
  PAGINA_W,
  TEXTO_DO_MOODBOARD as TXT,
  alturaDaLegenda,
  caixasDoMoodboard,
} from "@/lib/proposal-geometria";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MINIATURA NUNCA MOSTRA UMA IMAGEM PARTIDA — E É A PÁGINA A SÉRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto foi um defeito visto: nas miniaturas «A página, como vai sair» as fotos
 * apareciam como o ícone de imagem partida do navegador, com a MESMA fotografia
 * a desenhar-se bem na grelha logo acima. A causa não era o URL — era esta ser
 * a única superfície do estúdio a desenhar um `<img>` cru, sem o `onError` e
 * sem o original para onde cair.
 *
 * Dois grupos de testes, um por metade do problema:
 *
 *  1. **a cascata** — derivada → original → caixa vazia, nunca o ícone partido;
 *  2. **a fidelidade** — as caixas e as linhas de texto nos pontos que o
 *     gerador do PDF usa, lidas da mesma `proposal-geometria`.
 */

afterEach(cleanup);

const base = {
  layout: "filas" as const,
  aspectos: [1.5, 1.5],
  semRecorte: false,
  titulo: "Cerimónia",
};

const imagens = () =>
  Array.from(document.querySelectorAll<HTMLImageElement>('img[data-previa="foto"]'));
const vazias = () => document.querySelectorAll('[data-previa="sem-foto"]');
const falhar = async (img: HTMLImageElement) => {
  await act(async () => {
    img.dispatchEvent(new Event("error", { bubbles: false }));
  });
};

describe("PreviaDaPagina · a cascata das fotos", () => {
  it("desenha a derivada que já está em memória, sem pedir nada de novo", () => {
    render(<PreviaDaPagina {...base} urls={["mini-a", "mini-b"]} originais={["org-a", "org-b"]} />);
    expect(imagens().map((i) => i.getAttribute("src"))).toEqual(["mini-a", "mini-b"]);
  });

  /** O defeito, exactamente: a miniatura que o Storage assina mas não tem. */
  it("cai para o ORIGINAL quando a derivada falha", async () => {
    render(<PreviaDaPagina {...base} urls={["mini-a", "mini-b"]} originais={["org-a", "org-b"]} />);
    await falhar(imagens()[0]);
    expect(imagens().map((i) => i.getAttribute("src"))).toEqual(["org-a", "mini-b"]);
    // A outra não é arrastada pela falha da primeira.
    expect(vazias()).toHaveLength(0);
  });

  it("sem nada que sirva, fica uma caixa vazia — nunca um ícone partido", async () => {
    render(<PreviaDaPagina {...base} urls={["mini-a", "mini-b"]} originais={["org-a", "org-b"]} />);
    await falhar(imagens()[0]);
    await falhar(imagens()[0]);
    expect(imagens().map((i) => i.getAttribute("src"))).toEqual(["mini-b"]);
    expect(vazias()).toHaveLength(1);
  });

  it("sem original, a foto que falha não fica com um `src` morto no ecrã", async () => {
    render(<PreviaDaPagina {...base} urls={["mini-a", "mini-b"]} />);
    await falhar(imagens()[0]);
    expect(imagens().map((i) => i.getAttribute("src"))).toEqual(["mini-b"]);
  });

  /**
   * A REGRA DA VALIDAÇÃO: uma pré-visualização com fotos no board e sem
   * nenhuma imagem desenhada é um defeito, e tem de se apanhar sem ser a olho.
   */
  it("com URLs para todas as caixas, TODAS as caixas têm imagem", () => {
    render(
      <PreviaDaPagina
        {...base}
        aspectos={[1.5, 0.7, 1.2, 1.5]}
        urls={["a", "b", "c", "d"]}
        originais={["a2", "b2", "c2", "d2"]}
      />,
    );
    expect(imagens()).toHaveLength(4);
    expect(vazias()).toHaveLength(0);
  });

  it("uma caixa sem URL nenhum não inventa uma imagem", () => {
    render(<PreviaDaPagina {...base} urls={["a", undefined]} />);
    expect(imagens()).toHaveLength(1);
    expect(vazias()).toHaveLength(1);
  });
});

/** Lê o `style` inline de um elemento como número de percentagem. */
const percentagem = (v: string) => Number.parseFloat(v.replace("%", ""));

describe("PreviaDaPagina · a fidelidade à página", () => {
  it("tem a proporção da folha e mede-se a si própria (os `cqw` são da página)", () => {
    const { container } = render(<PreviaDaPagina {...base} urls={["a", "b"]} />);
    const folha = container.querySelector("figure > div") as HTMLElement;
    expect(folha.style.aspectRatio).toBe(`${PAGINA_W} / ${PAGINA_H}`);
    // Sem isto, `cqw` mede-se à JANELA e a tipografia deixa de escalar.
    expect(folha.style.containerType).toBe("inline-size");
  });

  it("põe as fotos nas caixas do gerador do PDF, ponto por ponto", () => {
    render(<PreviaDaPagina {...base} urls={["a", "b"]} />);
    const esperadas = caixasDoMoodboard("filas", base.aspectos, alturaDaLegenda(0), false);
    const desenhadas = Array.from(
      document.querySelectorAll<HTMLElement>('img[data-previa="foto"]'),
    ).map((img) => img.parentElement as HTMLElement);
    expect(desenhadas).toHaveLength(esperadas.length);
    desenhadas.forEach((el, i) => {
      expect(percentagem(el.style.left)).toBeCloseTo((esperadas[i].x / PAGINA_W) * 100, 6);
      expect(percentagem(el.style.bottom)).toBeCloseTo((esperadas[i].y / PAGINA_H) * 100, 6);
      expect(percentagem(el.style.width)).toBeCloseTo((esperadas[i].w / PAGINA_W) * 100, 6);
      expect(percentagem(el.style.height)).toBeCloseTo((esperadas[i].h / PAGINA_H) * 100, 6);
    });
  });

  /**
   * O título saía 34 pontos acima do sítio — quase em cima do sobretítulo — e
   * ninguém tinha como o descobrir sem gerar o PDF e sobrepor as duas folhas.
   */
  it("põe o título na linha de base do documento, e no corpo do documento", () => {
    render(<PreviaDaPagina {...base} urls={["a", "b"]} />);
    const titulo = screen.getByText("Cerimónia");
    const esperado = ((TXT.titulo.base - TXT.titulo.tamanho * 0.2) / PAGINA_H) * 100;
    expect(percentagem(titulo.style.bottom)).toBeCloseTo(esperado, 6);
    // O corpo em unidades de contentor: encolhe com a miniatura, como uma
    // fotocópia. Antes era um `clamp(...px)` que não escalava com nada.
    expect(titulo.style.fontSize).toBe(`${(TXT.titulo.tamanho / PAGINA_W) * 100}cqw`);
    expect(percentagem(titulo.style.left)).toBeCloseTo((PAGINA_M / PAGINA_W) * 100, 6);
  });

  it("escreve o sobretítulo «Inspiração», que sai em todas as páginas de mood board", () => {
    render(<PreviaDaPagina {...base} urls={["a", "b"]} />);
    expect(screen.getByText(TXT.sobretitulo.texto)).toBeTruthy();
  });

  /**
   * Fotos ALTAS de propósito: são as que enchem a mancha de cima a baixo, e
   * portanto as únicas onde se vê que a legenda lhes está mesmo a roubar
   * altura. Com fotos deitadas a fila é limitada pela largura e a reserva da
   * legenda só a desce na folha.
   */
  it("dá à legenda a altura que ela vai roubar às fotos", () => {
    const altas = { ...base, aspectos: [0.5, 0.5] };
    const alturaCom = (legenda?: string) => {
      cleanup();
      render(<PreviaDaPagina {...altas} urls={["a", "b"]} legenda={legenda} />);
      return percentagem(
        (document.querySelector('img[data-previa="foto"]')!.parentElement as HTMLElement).style
          .height,
      );
    };
    const umaLinha = "Verdes e brancos.";
    const quatroLinhas = Array.from({ length: 120 }, () => "palavra").join(" ");
    expect(alturaCom(umaLinha)).toBeLessThan(alturaCom(undefined));
    // E MAIS linhas roubam MAIS: era isto que a reserva fixa de uma linha
    // escondia — uma descrição comprida mostrava as fotos maiores do que saem.
    expect(alturaCom(quatroLinhas)).toBeLessThan(alturaCom(umaLinha));
  });

  it("a legenda assenta na margem de baixo, onde o documento a escreve", () => {
    render(<PreviaDaPagina {...base} urls={["a", "b"]} legenda="Verdes e brancos." />);
    const p = screen.getByText("Verdes e brancos.");
    const esperado = ((PAGINA_M + TXT.legenda.folga - TXT.legenda.tamanho * 0.2) / PAGINA_H) * 100;
    expect(percentagem(p.style.bottom)).toBeCloseTo(esperado, 6);
  });
});
