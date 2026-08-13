// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import HeroImage from "./HeroImage";
import { HERO_SOURCES, heroAvifSrcSet } from "@/lib/hero-image-loader";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O `<picture>` DO HERÓI NÃO PODE DESANCORAR A IMAGEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma imagem com `fill` é `position: absolute; inset: 0`, portanto vai-se
 * colar ao ANTEPASSADO POSICIONADO mais próximo. Quando o `<picture>` que
 * embrulha o AVIF não está posicionado (`static`, que é o valor por omissão),
 * esse antepassado deixa de ser o pai — passa a ser o que estiver acima, e a
 * caixa que a fotografia preenche é uma que ninguém escolheu.
 *
 * O próprio next/image recusa a montagem em silêncio e escreve na consola:
 *
 *   Image with src "…" has "fill" and parent element with invalid "position".
 *   Provided "static" should be one of absolute,fixed,relative.
 *
 * (node_modules/next/dist/client/image-component.js, no `ownRef` — a lista de
 * posições válidas está lá, tal e qual.) Foi visto em quatro capas ao mesmo
 * tempo — a inicial, /servicos, /sobre e /contacto —, que é exactamente o
 * conjunto das páginas com `<HeroImage>`: o defeito é do componente, não das
 * páginas.
 *
 * Hoje as dez utilizações do `<HeroImage>` estão todas dentro de uma caixa
 * `absolute inset-0`, portanto o desenho ainda calha certo por acidente — a
 * caixa a que a imagem se ancora tem as mesmas medidas que a que devia. É
 * ACIDENTE, não desenho: a primeira capa que alguém puser dentro de um pai sem
 * posição espalha-se por cima do ecrã inteiro, e nada no código o denuncia.
 * Daí este teste, que mede a REGRA e não a coincidência.
 */

afterEach(cleanup);

/** Uma origem que o pré-gerador conhece — só essas entram no ramo `<picture>`. */
const CAPA = "/imagens/hd-edited.jpg";

/** As posições que o next/image aceita como pai de uma imagem `fill`. */
const VALIDAS = ["absolute", "fixed", "relative"];

/**
 * O jsdom não tem Tailwind, portanto `getComputedStyle` diria `static` a tudo.
 * Lê-se a intenção onde ela está escrita: nas classes utilitárias ou no estilo
 * em linha.
 */
function posicionado(el: HTMLElement): boolean {
  if (VALIDAS.includes(el.style.position)) return true;
  return el.className.split(/\s+/).some((c) => VALIDAS.includes(c));
}

describe("HeroImage — o pai de uma imagem `fill`", () => {
  it("a capa escolhida para o teste é mesmo uma origem com AVIF (senão não há <picture>)", () => {
    expect(HERO_SOURCES.has(CAPA)).toBe(true);
    expect(heroAvifSrcSet(CAPA)).not.toBeNull();
  });

  it("está posicionado, como o next/image exige", () => {
    const { container } = render(
      <div className="absolute inset-0">
        <HeroImage src={CAPA} alt="Capa" fill priority sizes="100vw" quality={75} />
      </div>,
    );

    const img = container.querySelector<HTMLImageElement>('img[data-nimg="fill"]');
    expect(img, "o herói tem de sair como uma imagem `fill`").not.toBeNull();

    const pai = img!.parentElement as HTMLElement;
    expect(
      posicionado(pai),
      `o pai directo do <img fill> é <${pai.tagName.toLowerCase()} class="${pai.className}">, ` +
        "que fica em `position: static`. A imagem ancora-se ao antepassado posicionado " +
        "de cima em vez de à caixa do pai.",
    ).toBe(true);
  });

  it("sem `fill` o <picture> não é arrastado para fora do fluxo", () => {
    // A correcção acima não pode transformar todas as capas em camadas
    // absolutas: uma imagem com largura e altura declaradas ocupa espaço no
    // fluxo, e tirá-la de lá encolheria a caixa que a segura.
    const { container } = render(
      <HeroImage src={CAPA} alt="Capa" width={800} height={600} sizes="100vw" />,
    );
    const picture = container.querySelector("picture") as HTMLElement;
    expect(picture).not.toBeNull();
    expect(posicionado(picture)).toBe(false);
  });
});
