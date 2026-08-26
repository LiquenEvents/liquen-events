// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __resetListCache } from "./useCachedList";
import Inventario from "./Inventario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LINHA EM EDIÇÃO ESTAVA ESCRITA DUAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O inventário montava as duas formas ao mesmo tempo — um `<Card md:hidden>`
 * com os cartões e um `<Card hidden md:block>` com a tabela de seis colunas — e
 * portanto os CINCO CAMPOS da edição em linha existiam em duplicado, ligados ao
 * mesmo `editForm` e com o mesmo `aria-label` cada um.
 *
 * O que isso custava, por ordem de gravidade:
 *
 *   · dois `<input aria-label="Quantidade">` vivos para a mesma quantidade —
 *     um invisível, mas presente para o leitor de ecrã e para o `Tab`;
 *   · os testes deste ecrã tinham de escrever `getAllByLabelText(…)[0]` para
 *     escolher um dos dois, e escolhiam-no às cegas;
 *   · uma tabela de seis colunas desenhada por inteiro num telemóvel de 375 px,
 *     em cada tecla escrita, para nunca ser vista.
 *
 * E o corte era `md:` (768 px), que esta casa não usa (`ui/adaptativo.ts:53-60`)
 * e que é exactamente a largura de um iPad em retrato — onde as seis colunas,
 * com um campo de texto em cada uma, não cabem.
 */

/** Um `matchMedia` que responde a partir de uma largura e de um ponteiro. */
function simularAparelho({ largura, toque }: { largura: number; toque: boolean }) {
  vi.stubGlobal("matchMedia", (mq: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min
      ? largura >= Number(min[1])
      : mq.includes("hover: hover")
        ? !toque
        : mq.includes("pointer: coarse")
          ? toque
          : false;
    return {
      matches,
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

const TELEMOVEL = { largura: 375, toque: true };
/** O iPad em retrato: a largura onde o `md:` fazia entrar a tabela. */
const IPAD_RETRATO = { largura: 768, toque: true };
const COMPUTADOR = { largura: 1280, toque: false };

const ARCO = {
  id: "a1",
  name: "Arco de cerimónia",
  category: "Decoração",
  quantity: 2,
  unit: "un",
  condition: "bom" as const,
  location: "Armazém A, prateleira 3",
  notes: "",
};

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => [ARCO],
        }) as unknown as Response,
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function montar() {
  render(<Inventario />);
  await waitFor(() => expect(screen.getAllByText("Arco de cerimónia").length).toBeGreaterThan(0));
}

/** Os cinco campos da edição em linha, pelo rótulo que os nomeia. */
const CAMPOS = ["Nome", "Categoria", "Quantidade", "Estado", "Localização"];

describe("Inventário — uma forma de cada vez", () => {
  it("a 375 px não existe `<table>` nenhuma no DOM", async () => {
    simularAparelho(TELEMOVEL);
    await montar();

    expect(
      screen.queryByRole("table"),
      "a tabela de seis colunas voltou a ficar montada por baixo dos cartões",
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  /** O corte é o da casa — `CORTES.desktop` (1024), ou seja `lg:` — e não os
   *  768 px do `md:`, onde seis colunas com campos de texto não cabem. */
  it("a 768 px — um iPad em retrato — continuam a ser cartões", async () => {
    simularAparelho(IPAD_RETRATO);
    await montar();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a 1280 px existe uma tabela a sério, com nome", async () => {
    simularAparelho(COMPUTADOR);
    await montar();

    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Inventário" })).toBeInTheDocument(),
    );
    expect(screen.queryAllByRole("list", { name: "Inventário" })).toHaveLength(0);
  });

  it("os campos da edição em linha existem UMA vez só, não duas", async () => {
    simularAparelho(TELEMOVEL);
    const user = userEvent.setup();
    await montar();

    await user.click(screen.getByRole("button", { name: "Editar" }));

    for (const campo of CAMPOS) {
      expect(
        screen.getAllByLabelText(campo),
        `«${campo}» voltou a existir em duplicado — dois campos vivos para o mesmo valor`,
      ).toHaveLength(1);
    }
    // E as acções da edição também: um «Guardar» só, não dois.
    expect(screen.getAllByRole("button", { name: "Guardar" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Cancelar" })).toHaveLength(1);
  });
});
