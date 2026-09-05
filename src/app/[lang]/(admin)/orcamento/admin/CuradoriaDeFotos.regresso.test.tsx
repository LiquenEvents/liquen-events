// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ThemeImage } from "@/lib/theme-types";
import { CuradoriaDeFotos } from "./CuradoriaDeFotos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTO QUE VOLTA — e a que salta
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estava: um arrasto que não chegava ao limiar acabava com
 * `setArrastoX(0)` e o cartão não tinha uma única `transition-*` por baixo. A
 * fotografia saltava para o sítio num fotograma — e uma fotografia que SALTA de
 * volta parece um erro do ecrã. Uma que REGRESSA parece uma recusa educada:
 * ouvi-te, não chegou.
 *
 * Quem a traz de volta é a mola da casa (`lib/motion/mola.ts`), que existia,
 * estava medida, tinha teste — e não era usada em sítio nenhum do produto. É
 * este o sítio, e está escrito no ficheiro dela: «para o que se larga a meio de
 * um gesto».
 *
 * ── PORQUE É QUE ISTO É VITEST E NÃO PLAYWRIGHT ───────────────────────────
 *
 * Porque não se mede aqui posição nenhuma no ecrã — o jsdom não tem disposição
 * e daria zero. O que se lê é o `transform` que o componente ESCREVE, que é
 * estado dele e não geometria da página. A geometria (que o dedo leva mesmo a
 * foto atrás dele) é passeio de browser, e não é o que mudou.
 *
 * ── O RELÓGIO ─────────────────────────────────────────────────────────────
 *
 * A mola vive em `requestAnimationFrame`. Aqui a fila de quadros é nossa, para
 * o regresso poder ser observado quadro a quadro em vez de se esperar por um
 * relógio a sério.
 */

const FOTOS: ThemeImage[] = Array.from({ length: 4 }, (_, i) => ({
  path: `t1/foto-${i + 1}.jpg`,
  url: `https://cdn.test/foto-${i + 1}.jpg`,
  thumbUrl: `https://cdn.test/mini-${i + 1}.jpg`,
}));

let fila: FrameRequestCallback[] = [];

/** Corre `n` quadros da mola. */
function correr(n: number) {
  act(() => {
    for (let i = 0; i < n; i += 1) {
      const agora = fila;
      fila = [];
      for (const cb of agora) cb(0);
    }
  });
}

/** Corre até a mola parar de pedir quadros (ou desistir, para não ciclar). */
function correrAteAssentar(maximo = 200) {
  let n = 0;
  while (fila.length > 0 && n < maximo) {
    correr(1);
    n += 1;
  }
  return n;
}

function montar(over: Partial<Parameters<typeof CuradoriaDeFotos>[0]> = {}) {
  const aoDecidir = vi.fn();
  const aoVerGrande = vi.fn();
  const aoSair = vi.fn();
  const utils = render(
    <CuradoriaDeFotos
      images={FOTOS}
      escolhidas={new Set()}
      usadas={new Set()}
      podeEscolherMais
      aoDecidir={aoDecidir}
      aoVerGrande={aoVerGrande}
      aoSair={aoSair}
      {...over}
    />,
  );
  return { aoDecidir, aoVerGrande, aoSair, ...utils };
}

const cartao = () => screen.getByRole("group", { name: /^Foto \d+ de \d+/ });

/** O deslocamento que o componente escreveu, em píxeis. Zero quando não há. */
function deslocamento(): number {
  const t = cartao().style.transform;
  if (!t) return 0;
  return Number(/translateX\((-?[\d.]+)px\)/.exec(t)?.[1] ?? 0);
}

/**
 * Um arrasto que começa e ainda não acabou — o dedo fica pousado.
 *
 * ── O DEDO PÁRA ANTES DE LEVANTAR, E ISSO NÃO É DETALHE ───────────────────
 *
 * São DOIS movimentos para o mesmo sítio, de propósito. A velocidade de
 * largada mede-se entre as duas últimas amostras do dedo, e o `timeStamp` de um
 * evento sintético vem do relógio a sério — o jsdom não deixa injectá-lo
 * (medido: passar `timeStamp` no init é ignorado). Com um só movimento, o
 * intervalo entre `pointerDown` e `pointerMove` é o tempo que a máquina levou a
 * chegar ali, e a velocidade da mola mudava de execução para execução: o mesmo
 * teste dava 18 quadros numa passagem e 40 na seguinte.
 *
 * Com a segunda amostra no MESMO sítio, a velocidade é zero seja qual for o
 * relógio — o componente lê «não andou» sem dividir por tempo nenhum —, e o
 * regresso passa a ser sempre o mesmo. É também um gesto real: um dedo que
 * hesita e levanta parado. O que a velocidade acrescenta ao percurso está
 * medido onde tem de estar: no `lib/motion/mola.test.ts`, sobre a física e sem
 * relógio nenhum pelo meio.
 */
function arrastarSemLargar(dx: number) {
  const alvo = cartao() as HTMLElement & { setPointerCapture: () => void };
  alvo.setPointerCapture = () => {};
  fireEvent.pointerDown(alvo, { clientX: 200, clientY: 300, pointerId: 1 });
  fireEvent.pointerMove(alvo, { clientX: 200 + dx, clientY: 300, pointerId: 1 });
  fireEvent.pointerMove(alvo, { clientX: 200 + dx, clientY: 300, pointerId: 1 });
}

function largar(dx: number) {
  fireEvent.pointerUp(cartao(), { clientX: 200 + dx, clientY: 300, pointerId: 1 });
}

beforeEach(() => {
  fila = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => fila.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("um arrasto que não pegou", () => {
  it("não salta para o sítio — fica onde o dedo o largou e volta de lá", () => {
    montar();
    arrastarSemLargar(40);
    expect(deslocamento()).toBe(40);

    largar(40);

    // O fotograma logo a seguir a largar: a foto AINDA está fora do sítio. É
    // isto que distingue um regresso de um salto — antes, este número era 0.
    expect(
      Math.abs(deslocamento()),
      "a foto voltou ao sítio no mesmo fotograma em que o dedo a largou — isso é um salto, " +
        "não um regresso",
    ).toBeGreaterThan(1);
  });

  it("e volta pelo caminho todo, sem nunca passar do sítio", () => {
    montar();
    arrastarSemLargar(40);
    largar(40);

    const percurso: number[] = [deslocamento()];
    correrAteAssentar();
    // Vai lendo enquanto corre não dá; corre-se outra vez de propósito, uma
    // amostra por quadro.
    cleanup();
    fila = [];
    montar();
    arrastarSemLargar(40);
    largar(40);
    while (fila.length > 0 && percurso.length < 200) {
      correr(1);
      percurso.push(deslocamento());
    }

    // Houve caminho — mais do que a leitura inicial. Sem isto o teste passava
    // com a mola desligada: um percurso de uma só amostra, já em zero, cumpre
    // todas as regras abaixo por vacuidade.
    expect(percurso.length, "não houve regresso nenhum para observar").toBeGreaterThan(3);
    // Assentou mesmo, e assentou em zero exacto.
    expect(percurso[percurso.length - 1]).toBe(0);
    // Encurtou sempre, e nunca atravessou para o outro lado: a mola desta casa
    // é quase crítica de propósito — «assenta e fica», sem saltitar.
    for (let i = 1; i < percurso.length; i += 1) {
      expect(percurso[i]).toBeGreaterThanOrEqual(-0.5);
      expect(percurso[i]).toBeLessThanOrEqual(percurso[i - 1] + 0.001);
    }
    // E não demorou uma eternidade: a 1/60 por quadro, isto são décimos de
    // segundo, não segundos.
    expect(percurso.length).toBeLessThan(60);
  });

  it("o tempo acompanha a distância — é para isso que serve uma mola", () => {
    // Uma duração fixa faria um empurrão de 8 px demorar o mesmo que um arrasto
    // de 60 px, e o pequeno lia-se como preguiça.
    const quadros = (dx: number) => {
      cleanup();
      fila = [];
      montar();
      arrastarSemLargar(dx);
      largar(dx);
      return correrAteAssentar();
    };
    const curto = quadros(8);
    const longo = quadros(60);
    expect(curto).toBeGreaterThan(0);
    expect(longo).toBeGreaterThan(curto);
  });

  it("um dedo novo ganha à mola velha — a foto não é escrita por dois", () => {
    montar();
    arrastarSemLargar(40);
    largar(40);
    correr(2);
    expect(fila.length).toBeGreaterThan(0);

    // Pousar outra vez cancela o regresso a meio.
    arrastarSemLargar(10);
    correr(1);
    expect(fila).toHaveLength(0);
    expect(deslocamento()).toBe(10);
  });

  it("quem pediu para não animar vai directo ao sítio", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    montar();
    arrastarSemLargar(40);
    largar(40);
    expect(deslocamento()).toBe(0);
    expect(fila, "pediu-se para não animar e a mola arrancou na mesma").toHaveLength(0);
  });
});

describe("uma decisão não é um regresso", () => {
  it("incluir manda a foto embora de uma vez — sem mola", () => {
    const { aoDecidir } = montar();
    arrastarSemLargar(120);
    largar(120);
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", true);
    // Entrou outra foto; ela não vem a assentar de sítio nenhum.
    expect(screen.getByText("2 de 4")).toBeTruthy();
    expect(deslocamento()).toBe(0);
    expect(fila).toHaveLength(0);
  });

  it("saltar também", () => {
    const { aoDecidir } = montar();
    arrastarSemLargar(-120);
    largar(-120);
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", false);
    expect(deslocamento()).toBe(0);
    expect(fila).toHaveLength(0);
  });
});
