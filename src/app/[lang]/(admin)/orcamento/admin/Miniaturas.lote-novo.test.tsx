// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Miniaturas from "./Miniaturas";

vi.mock("./Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «VER AS OUTRAS N» — SÓ O LOTE NOVO ENTRA, E ENTRA COMO UM BLOCO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel corta a lista às oito pastas e oferece «Ver as outras N». Carregar
 * trocava oito linhas por sessenta e três no mesmo fotograma.
 *
 * ── O QUE ESTE FICHEIRO GUARDA ────────────────────────────────────────────
 *
 *  1. Que as OITO PRIMEIRAS não animam. Estavam no ecrã e não se mexeram;
 *     animá-las era pôr a lista inteira a piscar para dizer que lhe
 *     acrescentaram um pedaço — movimento a chamar atenção, que é a regra da
 *     casa ao contrário.
 *  2. Que o lote novo entra TODO AO MESMO TEMPO. É isso que faz dele um bloco
 *     e não N entradas: sem `--cena`, sem degrau, sem escada. «A escada é por
 *     bloco, nunca por linha» (`EventTasks.tsx:400-402`), e aqui a lista não
 *     tem tecto — este painel chega às dezenas de linhas.
 *  3. E que a palavra é a de um RÓTULO (`.bo-entrada`, quatro píxeis) e não a
 *     de um ecrã a apresentar-se (`.bo-cena`, 600 ms e doze píxeis). São
 *     linhas de texto de onze píxeis dentro de um painel de manutenção.
 */

function respostaDe(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Doze pastas por arranjar: quatro a mais do que o corte das oito. */
const LINHAS = Array.from({ length: 12 }, (_, i) => ({
  origem: "theme-assets",
  pasta: `pasta-${i}`,
  nome: `Tema ${i}`,
  daBiblioteca: true,
  fotos: 10,
  semMiniatura: 3,
  semVersaoLeve: 0,
  emFalta: 3,
}));

function contagem() {
  return {
    ok: true,
    linhas: LINHAS,
    fotos: 120,
    emFalta: 36,
    emFaltaEssenciais: 36,
    emFaltaLeves: 0,
    fotosSemMiniatura: 36,
    fotosSemVersaoLeve: 0,
    avisos: [],
  };
}

/** O `<li>` de um tema, pelo nome — que é como este painel os identifica. */
const linhaDe = (nome: string) => screen.getByText(nome).closest("li") as HTMLElement;

async function contarEExpandir() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => respostaDe(contagem())),
  );
  render(<Miniaturas />);
  await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
  await waitFor(() => expect(screen.getByText("Tema 0")).toBeInTheDocument());
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o lote que «Ver as outras» traz", () => {
  it("corta às oito e nenhuma das oito entra — não havia nada a apresentar", async () => {
    await contarEExpandir();
    expect(screen.queryByText("Tema 8"), "o corte das oito desapareceu").toBeNull();
    for (let i = 0; i < 8; i++) {
      expect(linhaDe(`Tema ${i}`).className).not.toContain("bo-entrada");
    }
  });

  it("e as que chegam entram — mas só elas", async () => {
    await contarEExpandir();
    await userEvent.click(screen.getByRole("button", { name: /Ver as outras 4/ }));

    await waitFor(() => expect(screen.getByText("Tema 11")).toBeInTheDocument());

    // As oito que já lá estavam continuam quietas.
    for (let i = 0; i < 8; i++) {
      expect(
        linhaDe(`Tema ${i}`).className,
        `a linha ${i} já estava no ecrã e voltou a entrar — a lista inteira pisca`,
      ).not.toContain("bo-entrada");
    }
    // As quatro novas entram.
    for (let i = 8; i < 12; i++) {
      expect(
        linhaDe(`Tema ${i}`).className,
        `a linha ${i} chegou de repente, sem vir de sítio nenhum`,
      ).toContain("bo-entrada");
    }
  });

  it("e entram TODAS AO MESMO TEMPO — um bloco, e não uma escada por linha", async () => {
    await contarEExpandir();
    await userEvent.click(screen.getByRole("button", { name: /Ver as outras 4/ }));
    await waitFor(() => expect(screen.getByText("Tema 11")).toBeInTheDocument());

    for (let i = 8; i < 12; i++) {
      const linha = linhaDe(`Tema ${i}`);
      // Nenhum degrau próprio: nem `--cena` no estilo, nem `.bo-cena`, nem um
      // atraso escrito à mão. Cinquenta linhas a chegar uma a uma é a lentidão
      // que o tecto do sexto degrau existe para evitar.
      expect(linha.style.getPropertyValue("--cena"), `a linha ${i} ganhou degrau próprio`).toBe("");
      expect(linha.className).not.toContain("bo-cena");
      expect(linha.className).not.toMatch(/\bdelay-/);
      // E a distância é a de um rótulo, não a de uma folha nem a de um fundo.
      expect(linha.className).not.toContain("bo-entrada-folha");
      expect(linha.className).not.toContain("bo-entrada-fundo");
    }
  });

  it("e «Mostrar menos» não deixa a entrada pendurada nas que ficam", async () => {
    await contarEExpandir();
    await userEvent.click(screen.getByRole("button", { name: /Ver as outras 4/ }));
    await waitFor(() => expect(screen.getByText("Tema 11")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Mostrar menos/ }));

    await waitFor(() => expect(screen.queryByText("Tema 11")).toBeNull());
    for (let i = 0; i < 8; i++) {
      expect(linhaDe(`Tema ${i}`).className).not.toContain("bo-entrada");
    }
  });
});
