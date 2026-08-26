// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotasInternas from "./NotasInternas";

/**
 * A garantia de que estas notas não saem no PDF está no teste do desenhador.
 * O que se prende aqui é a outra metade: que quem escreve SAIBA que não saem —
 * porque a defesa contra escrever a coisa errada no sítio errado não é um
 * teste, é o campo não se parecer com os outros.
 */

afterEach(cleanup);

describe("NotasInternas", () => {
  it("diz, no rótulo, que não sai na proposta", () => {
    render(<NotasInternas valor="" onChange={() => {}} />);
    expect(screen.getByText(/só para ti, nunca sai na proposta/)).toBeTruthy();
  });

  it("o rótulo aponta para o campo, para quem usa leitor de ecrã", async () => {
    render(<NotasInternas valor="" onChange={() => {}} />);
    // `getByLabelText` só encontra se a associação existir mesmo.
    expect(screen.getByLabelText(/Notas internas/)).toBeTruthy();
  });

  it("devolve o que se escreve", async () => {
    // Controlado pelo estúdio: com `valor` fixo em "", cada tecla chega ao pai
    // sozinha. O que importa provar é que chega — quem o acumula é o pai.
    const onChange = vi.fn();
    render(<NotasInternas valor="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/Notas internas/), "AMARA");
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(["A", "M", "A", "R", "A"]);
  });

  it("aceita um título próprio, para as notas presas a uma secção", () => {
    render(<NotasInternas valor="" onChange={() => {}} titulo="Nota sobre o orçamento" />);
    expect(screen.getByLabelText(/Nota sobre o orçamento/)).toBeTruthy();
  });

  /**
   * ── O `id` DO SERVIDOR TEM DE SER O DO NAVEGADOR ─────────────────────────
   *
   * O campo nasceu com um id ALEATÓRIO (`notas-${idCurto()}`), sorteado uma vez
   * a desenhar no servidor e outra vez a hidratar. O React desenhou
   * `htmlFor="notas-53c900b712"` e hidratou com `notas-addc8e652c`, e disse-o:
   * «A tree hydrated but some attributes … didn't match. This won't be patched
   * up.» O `htmlFor` fica a apontar para um id que não existe — carregar no
   * rótulo deixa de pôr o cursor na caixa.
   *
   * O defeito viveu escondido porque ninguém montava o componente; foi o E2E,
   * depois de ele entrar no estúdio, que o apanhou.
   *
   * Aqui prende-se a propriedade directamente: desenhar no SERVIDOR e desenhar
   * no CLIENTE têm de dar o mesmo id. O `useId` é determinístico pela posição
   * na árvore, portanto dá; um sorteio não dá nunca.
   */
  it("hidrata sem queixa, e o id do servidor sobrevive", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("react");

    const alvo = <NotasInternas valor="" onChange={() => {}} />;
    const caixa = document.createElement("div");
    caixa.innerHTML = renderToString(alvo);
    document.body.appendChild(caixa);
    const idDoServidor = caixa.querySelector("textarea")?.id;
    const rotuloDoServidor = caixa.querySelector("label")?.getAttribute("for");

    const queixas: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void queixas.push(args);
    try {
      await act(async () => {
        hydrateRoot(caixa, alvo);
      });
    } finally {
      console.error = original;
    }

    // Controlo positivo: o HTML do servidor trouxe mesmo um id, e o rótulo
    // apontava para ele. Sem isto o resto do teste podia passar a comparar
    // `undefined` com `undefined`.
    expect(idDoServidor).toBeTruthy();
    expect(rotuloDoServidor).toBe(idDoServidor);

    // O React diz «didn't match the client properties» quando o id foi
    // sorteado outra vez. Com o `useId` não há queixa nenhuma.
    const texto = queixas.map((q) => q.join(" ")).join("\n");
    expect(texto).not.toMatch(/hydrat/i);

    // E depois de hidratar, o rótulo continua a apontar para a caixa que está
    // no ecrã — que é o que se perdia («this won't be patched up»).
    const depois = caixa.querySelector("textarea");
    expect(depois?.id).toBe(idDoServidor);
    expect(caixa.querySelector("label")?.getAttribute("for")).toBe(idDoServidor);
    caixa.remove();
  });
});
