// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import ImagemComPlanoB from "./ImagemComPlanoB";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA ASSENTA — NÃO APARECE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `ImagemComPlanoB` é a célula partilhada da Biblioteca de Temas, da revisão de
 * etiquetas e da página em construção. É o sítio onde o back office espera por
 * bytes mais vezes por dia, e a espera é longa: a mesma célula desenha
 * miniaturas de 96 px e originais de 2200 px que ainda não têm derivada.
 *
 * O que ela fazia:
 *
 *   · COM borrão (`lqip`) — nascia em `opacity-0` e passava a 100 quando o
 *     `onLoad` disparava. Havia passagem.
 *   · SEM borrão — nascia em `opacity-100` e a fotografia aparecia num
 *     fotograma, por cima do fundo neutro. Estalo.
 *
 * E são as fotos SEM borrão as anteriores à migração: as mais pesadas, as que
 * demoram mais, as que mais se dá por elas a aparecer de repente.
 *
 * ── A ARMADILHA QUE ISTO TAMBÉM FECHA ─────────────────────────────────────
 *
 * Enquanto a opacidade final dependia do `lqip`, um `onLoad` perdido só se
 * notava nas fotos COM borrão — e perde-se mesmo: uma imagem que já está em
 * cache pode chegar `complete` antes de o React ligar o evento, e aí ele nunca
 * dispara. Resultado: borrão para sempre, com a fotografia descarregada por
 * baixo. Passando a passagem a valer para todas, esse defeito passaria a
 * apagar TODAS as fotos em cache — por isso a rede do `complete` entra no mesmo
 * gesto, e é o terceiro caso deste ficheiro.
 *
 * ── PORQUE É QUE ISTO DÁ PARA MEDIR EM JSDOM ──────────────────────────────
 *
 * Porque não se mede movimento: mede-se qual das duas classes está no elemento
 * antes e depois de a fotografia chegar. O jsdom não tem layout — não há aqui
 * nenhuma medição, nenhum `offsetParent` e nenhum fotograma. Quem faz a
 * passagem é o CSS (`transition-opacity`), e isso é do browser.
 */

afterEach(cleanup);

const imagem = (c: HTMLElement) => c.querySelector("img") as HTMLImageElement;

describe("a fotografia que chega assenta em vez de aparecer", () => {
  it("sem borrão: começa invisível e só assenta quando chega", () => {
    const { container } = render(
      <ImagemComPlanoB src="/fotos/uma.jpg" className="h-full w-full object-cover" />,
    );
    const img = imagem(container);

    // ANTES: era `opacity-100` desde o primeiro fotograma, e a fotografia
    // aparecia de repente quando os bytes chegassem.
    expect(img.className).toContain("opacity-0");
    expect(img.className).not.toContain("opacity-100");

    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");
  });

  it("com borrão: continua a assentar por cima dele", () => {
    const { container } = render(
      <ImagemComPlanoB src="/fotos/duas.jpg" lqip="data:image/webp;base64,AAAA" />,
    );
    const img = imagem(container);
    expect(img.className).toContain("opacity-0");
    // O borrão é o fundo do próprio `<img>`, e é o que se vê durante a espera.
    expect(img.style.backgroundImage).toContain("data:image/webp;base64,AAAA");

    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");
  });

  it("a passagem é só de opacidade, e não corre para quem pediu para não animar", () => {
    const { container } = render(<ImagemComPlanoB src="/fotos/tres.jpg" />);
    const img = imagem(container);
    // Só `opacity`: a célula já tem a sua medida antes de a foto chegar, e nada
    // aqui pode remedir a grelha a cada fotograma.
    expect(img.className).toContain("motion-safe:transition-opacity");
    expect(img.className).toContain("motion-safe:duration-elemento");
    expect(img.className).not.toMatch(/transition-(all|colors|\[)/);
  });

  it("uma imagem já em cache não fica invisível à espera de um evento que não vem", () => {
    // O jsdom não descarrega imagens: `complete` é falso e `naturalWidth` é 0.
    // Um browser a servir da cache dá o contrário — e pode dá-lo ANTES de o
    // React ligar o `onLoad`, que é o caso que esta rede existe para apanhar.
    const proto = window.HTMLImageElement.prototype;
    const completeOriginal = Object.getOwnPropertyDescriptor(proto, "complete");
    const larguraOriginal = Object.getOwnPropertyDescriptor(proto, "naturalWidth");
    Object.defineProperty(proto, "complete", { configurable: true, get: () => true });
    Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => 640 });
    try {
      const { container } = render(<ImagemComPlanoB src="/fotos/cache.jpg" lqip="data:x" />);
      const img = imagem(container);
      // Sem nenhum `load` disparado.
      expect(img.className).toContain("opacity-100");
    } finally {
      if (completeOriginal) Object.defineProperty(proto, "complete", completeOriginal);
      else delete (proto as unknown as Record<string, unknown>).complete;
      if (larguraOriginal) Object.defineProperty(proto, "naturalWidth", larguraOriginal);
      else delete (proto as unknown as Record<string, unknown>).naturalWidth;
    }
  });
});
