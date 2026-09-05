// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { useMarcaQueAnda } from "./useMarcaQueAnda";
/* O duplo que finge as medidas vive em `test/`, com os outros duplos da casa, e
   não aqui: o `NavEstudio.test.tsx` precisa exactamente do mesmo, e duas cópias
   de um duplo divergem como duas cópias de qualquer outra coisa. O caminho é
   relativo porque o `@/` desta casa aponta para `src/`. */
import { fingirDisposicao, reporDisposicao } from "../../../../../../../test/disposicao-fingida";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MEDIDA DA MARCA QUE ANDA — a canalização, com a disposição FINGIDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LEIA-SE ISTO ANTES DE ACREDITAR NO VERDE ──────────────────────────────
 *
 * O jsdom NÃO TEM DISPOSIÇÃO. `offsetParent` é sempre nulo, `offsetTop` e
 * companhia são sempre zero, e o `ResizeObserver` nunca dispara. O filete da
 * barra lateral já teve um teste de unidade que morreu exactamente por isto e
 * teve de virar passeio de Playwright — está escrito no
 * `e2e/admin-views.spec.ts`, e a lição não se desaprende.
 *
 * Este ficheiro não finge que mede geometria. Finge as MEDIDAS — cada elemento
 * traz as suas num `data-*` e os `offset*` lêem-nas — para poder pôr à prova a
 * canalização à volta delas, que é lógica e não pixéis:
 *
 *   · pergunta-se ao elemento MARCADO, e não ao primeiro da lista;
 *   · quando o marcado está escondido, apaga-se a marca em vez de a deixar
 *     pousada no sítio errado;
 *   · o primeiro fotograma NÃO anda;
 *   · e devolvem-se OS DOIS EIXOS, que é o que permite ao índice do estúdio
 *     usar isto na tira (horizontal) e na coluna (vertical) sem uma segunda
 *     maneira de marcar «onde estou».
 *
 * Onde é que o filete PÁRA — isso mede-se num browser, em
 * `e2e/nav-estudio-marca.spec.ts`, com `expect.poll` e depois de a transição
 * assentar. Os dois testes são precisos: este apanha a canalização partida com
 * um segundo de espera, aquele apanha os pixéis.
 */

interface Destino {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  escondido?: boolean;
}

/** Uma lista com um marcado, e o filete a segui-lo — o mínimo do padrão. */
function Lista({ destinos, activo }: { destinos: Destino[]; activo: string }) {
  const zona = useRef<HTMLDivElement>(null);
  const { marca, podeAndar } = useMarcaQueAnda(zona, '[aria-current="page"]', activo);
  return (
    <div ref={zona} style={{ position: "relative" }}>
      {marca && (
        <span
          data-testid="filete"
          data-anda={podeAndar ? "sim" : "nao"}
          style={{
            translate: `${marca.x}px ${marca.y}px`,
            width: marca.largura,
            height: marca.altura,
          }}
        />
      )}
      {destinos.map((d) => (
        <button
          key={d.id}
          type="button"
          aria-current={d.id === activo ? "page" : undefined}
          data-x={d.x}
          data-y={d.y}
          data-w={d.w}
          data-h={d.h}
          data-escondido={d.escondido ? "sim" : undefined}
        >
          {d.id}
        </button>
      ))}
    </div>
  );
}

const COLUNA: Destino[] = [
  { id: "pedidos", x: 0, y: 0, w: 192, h: 36 },
  { id: "agenda", x: 0, y: 40, w: 192, h: 36 },
  { id: "temas", x: 0, y: 80, w: 192, h: 36 },
];

/** A mesma lista deitada — é o que o índice do estúdio é abaixo de 40rem. */
const TIRA: Destino[] = [
  { id: "evento", x: 0, y: 0, w: 96, h: 44 },
  { id: "servicos", x: 102, y: 0, w: 110, h: 44 },
  { id: "orcamento", x: 218, y: 0, w: 120, h: 44 },
];

afterEach(() => {
  cleanup();
  reporDisposicao();
});

/** Deixa passar o fotograma que o `podeAndar` espera. */
async function passarUmFotograma() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("a marca segue o destino marcado, e não o primeiro da lista", () => {
  it("mede o que tem `aria-current`, nos dois eixos", async () => {
    fingirDisposicao();
    const { getByTestId, rerender } = render(<Lista destinos={COLUNA} activo="temas" />);
    const filete = getByTestId("filete");
    expect(filete.style.translate).toBe("0px 80px");
    expect(filete.style.height).toBe("36px");

    // E ANDA para o destino seguinte quando ele muda — que é o gesto todo.
    await act(async () => rerender(<Lista destinos={COLUNA} activo="agenda" />));
    expect(getByTestId("filete").style.translate).toBe("0px 40px");
  });

  it("na TIRA é o `x` que muda — o mesmo gancho serve a lista deitada", async () => {
    // Este é o eixo que a barra lateral não precisava e que o índice do estúdio
    // precisa. Sem ele, marcar «onde estou» numa tira horizontal pedia um
    // segundo mecanismo — que é exactamente o que não se quis.
    fingirDisposicao();
    const { getByTestId, rerender } = render(<Lista destinos={TIRA} activo="evento" />);
    expect(getByTestId("filete").style.translate).toBe("0px 0px");

    await act(async () => rerender(<Lista destinos={TIRA} activo="orcamento" />));
    const filete = getByTestId("filete");
    expect(filete.style.translate).toBe("218px 0px");
    // A largura acompanha: «Evento» e «Orçamento» não medem o mesmo, e uma
    // marca de largura fixa ficava a apontar para o vizinho.
    expect(filete.style.width).toBe("120px");
  });

  it("com o destino escondido não há marca nenhuma", async () => {
    // Um grupo dobrado, ou o ramo que está do outro lado de um corte de
    // largura. Uma marca pousada num elemento invisível é pior do que nenhuma:
    // aponta para um sítio que não existe.
    fingirDisposicao();
    const escondidos = COLUNA.map((d) => (d.id === "temas" ? { ...d, escondido: true } : d));
    const { queryByTestId } = render(<Lista destinos={escondidos} activo="temas" />);
    expect(queryByTestId("filete")).toBeNull();
  });

  it("o primeiro desenho NÃO anda — só o fotograma seguinte", async () => {
    // Sem esta espera, abrir o ecrã fazia o filete deslizar do canto até ao
    // destino activo: um movimento que ninguém provocou, a anunciar uma
    // transição que não houve.
    fingirDisposicao();
    const { getByTestId } = render(<Lista destinos={COLUNA} activo="agenda" />);
    expect(getByTestId("filete").dataset.anda).toBe("nao");

    await passarUmFotograma();
    expect(getByTestId("filete").dataset.anda).toBe("sim");
  });
});
