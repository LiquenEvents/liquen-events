// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Contract } from "@/lib/contract-types";
import { __resetListCache } from "./useCachedList";
import Contratos from "./Contratos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CONTRATOS ESTAVAM MONTADOS DUAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um `<ul md:hidden>` com um cartão por contrato E um `<table>` de sete colunas
 * `hidden md:block`, os dois no DOM ao mesmo tempo, os dois a ler e a escrever
 * o mesmo `expanded`. É o defeito que o `useMedida.ts:16-21` descreve — duas
 * árvores, dois estados, a mesma chave — e num telemóvel custava, em cada
 * desenho, uma tabela inteira de nós que ninguém vê.
 *
 * O corte também estava errado: `md:` são 768 px, que este back office não usa
 * (`ui/adaptativo.ts:53-60`), e é EXACTAMENTE a largura de um iPad em retrato —
 * uma janela onde sete colunas não cabem, e onde o MOBILE-AUDIT encontrou os
 * quatro achados Críticos.
 *
 * O que se afirma aqui é o contrato do primitivo, o mesmo que o
 * `ui/adaptativo.test.tsx` já guarda para o `TabelaOuCartoes`: a 375 px NÃO HÁ
 * tabela nenhuma no DOM, e a partir de 1024 há uma tabela a sério, com nome.
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
/** O iPad em retrato: a largura onde o `md:` fazia entrar a tabela de sete colunas. */
const IPAD_RETRATO = { largura: 768, toque: true };
const COMPUTADOR = { largura: 1280, toque: false };

const CONTRATO: Contract = {
  id: "ct-1",
  quoteId: "LQ-001",
  proposalId: "PR-001",
  clientName: "Ana e Rui",
  clientEmail: "ana@exemplo.pt",
  termsVersion: "2026-01",
  termsSnapshot: "Termos e condições do estúdio.",
  status: "aceite",
  createdAt: "2026-05-01T10:00:00.000Z",
  acceptedAt: "2026-05-12T14:30:00.000Z",
  acceptedName: "Ana Ribeiro",
  acceptedIp: "1.2.3.4",
} as Contract;

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
          json: async () => [CONTRATO],
        }) as unknown as Response,
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Espera pela leitura da lista (o ecrã desenha um esqueleto até lá). */
async function montar() {
  render(<Contratos />);
  await waitFor(() => expect(screen.getAllByText("Ana e Rui").length).toBeGreaterThan(0));
}

describe("Contratos — uma forma de cada vez", () => {
  it("a 375 px não existe `<table>` nenhuma no DOM", async () => {
    simularAparelho(TELEMOVEL);
    await montar();

    expect(
      screen.queryByRole("table"),
      "a tabela de sete colunas voltou a ficar montada por baixo dos cartões",
    ).toBeNull();
    // E o cartão está mesmo lá, com o seu botão de abrir os termos.
    expect(screen.getByRole("button", { name: "Ver termos" })).toBeInTheDocument();
  });

  /** O corte é o da casa — `CORTES.desktop` (1024), ou seja `lg:` — e não os
   *  768 px do `md:`, que é onde um iPad em retrato apanhava sete colunas. */
  it("a 768 px — um iPad em retrato — continuam a ser cartões", async () => {
    simularAparelho(IPAD_RETRATO);
    await montar();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a 1280 px existe uma tabela a sério, com nome", async () => {
    simularAparelho(COMPUTADOR);
    await montar();

    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Contratos" })).toBeInTheDocument(),
    );
    // Uma linha por contrato, e nenhum cartão montado por baixo dela.
    expect(screen.queryAllByRole("list", { name: "Contratos" })).toHaveLength(0);
  });
});
