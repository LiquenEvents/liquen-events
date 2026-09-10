// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import Temas from "./Temas";
import { SAIDA_MS } from "./ui/saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NA BIBLIOTECA, QUEM SEGURA O NÓ É O PAI — E ESTE FICHEIRO PROVA-O
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três caixas desta vista fechavam a seco, e as três pela MESMA razão, que é
 * diferente da dos outros ecrãs desta ronda: não era a caixa que não sabia
 * sair, era o `Temas.tsx` que a desmontava no fotograma do gesto.
 *
 *   · a folha de FUNDIR TEMAS e a de COPIAR FOTOS passavam `aberto` escrito a
 *     verdadeiro ao `FolhaOuDialogo` — que ganhou saída na ronda anterior, mas
 *     dispara-a quando o `aberto` CAI. Com ele fixo, nunca havia um fotograma
 *     em que caísse: a saída existia e este ecrã não a apanhava;
 *   · e o VISUALIZADOR desaparecia com o `zoomAt` a passar a `null`.
 *
 * A alteração é do lado do pai — e o pai é este ficheiro, não um dos dois
 * gigantes partilhados. Isto monta a biblioteca a sério e prende as duas metades
 * do gesto: o fecho acontece no instante, e o nó fica.
 *
 * ── E OS DADOS VÃO CONGELADOS ─────────────────────────────────────────────
 *
 * Um pai que desmonta leva os dados com ele: o `aFundir` cai para `null` no
 * mesmo instante em que fecha. Sem congelar o último valor aberto, o que ficava
 * a apagar-se durante 200 ms era uma folha sem tema nenhum — ou um erro. É o
 * `useNoEcraAteSair`, e é isso que o último teste deste ficheiro mede.
 */

const THEME = {
  id: "t1",
  name: "Clássico Intemporal",
  notes: "",
  imageCount: 3,
  truncated: false,
  arquivado: false,
  kind: "tema" as const,
};

type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): Res => ({ ok: true, status: 200, json: async () => body });

/** Uma foto com miniatura: com miniatura não há fila de carregamento nenhuma,
 *  e a grelha desenha-a sem se ter de encenar um `load` que o jsdom não dá. */
const FOTO = {
  path: "temas/t1/1.jpg",
  url: "https://exemplo/1.jpg",
  thumbUrl: "https://exemplo/1m.jpg",
};

/** Dois temas, para haver para onde fundir. */
const DOIS = [
  { ...THEME, id: "t1", name: "Clássico Intemporal", imageCount: 3 },
  { ...THEME, id: "t2", name: "Zen", imageCount: 12 },
];

function servidor() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const caminho = String(url).split("?")[0];
      if (caminho === "/api/temas") return Promise.resolve(ok(DOIS));
      if (caminho.endsWith("/imagens"))
        return Promise.resolve(ok({ ok: true, images: [FOTO], total: 1 }));
      return Promise.resolve(ok({}));
    }),
  );
}

function simularMovimento({ menos }: { menos: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    (mq: string) =>
      ({
        matches: mq.includes("reduce") ? menos : false,
        media: mq,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  );
}

const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

async function assentar() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Abre a folha de fundir temas a partir do cartão do primeiro tema. */
async function abrirAFusao() {
  render(
    <ToastProvider>
      <Temas />
    </ToastProvider>,
  );
  await assentar();
  // Pelo menu do cartão: as acções do tema passaram a viver dentro do «⋯»
  // (ponto 9 da auditoria do `docs/APPLE-TEMAS.md`).
  fireEvent.click(screen.getAllByRole("button", { name: /Acções de Clássico Intemporal/ })[0]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Juntar a outro tema…" }));
  return await screen.findByRole("dialog", { name: /Juntar “Clássico Intemporal” a/ });
}

beforeEach(() => {
  simularMovimento({ menos: false });
  servidor();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

describe("a folha de fundir temas fica montada a sair", () => {
  it("o pai já não a arranca no fotograma do gesto", async () => {
    const folha = await abrirAFusao();
    // Controlo negativo: aberta, é uma folha a sério e com a ENTRADA da casa.
    expect(classes(folha)).toContain("bo-entrada");
    expect(classes(folha)).not.toContain("bo-saida");
    expect(folha.hasAttribute("inert")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    // Para quem ouve o ecrã acabou já; para os olhos ficam 200 ms de imagem.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(folha.isConnected).toBe(true);
    expect(classes(folha)).toContain("bo-saida");
    expect(classes(folha)).not.toContain("bo-entrada");
    expect(folha.hasAttribute("inert")).toBe(true);

    await act(async () => {
      await new Promise((r) => setTimeout(r, SAIDA_MS + 60));
    });
    expect(folha.isConnected).toBe(false);
  });

  /**
   * ── E ESTE É O TESTE QUE IMPEDE UM TOQUE DE SE PERDER ────────────────────
   *
   * A moldura do `FolhaOuDialogo` é um `fixed inset-0`: cobre a biblioteca
   * inteira. Uma folha a desvanecer-se por cima da grelha de temas continuava a
   * ser o alvo do toque enquanto lá estivesse — e o gesto seguinte de quem
   * acaba de fundir dois temas é carregar num terceiro.
   *
   * Este teste não espera um único milissegundo depois do gesto.
   */
  it("e larga os toques da biblioteca no primeiro fotograma", async () => {
    const folha = await abrirAFusao();
    const moldura = folha.parentElement as HTMLElement;

    /* Controlo negativo, e é a sério: aberta, esta moldura APANHA os toques —
       um `mousedown` nela é o clique no fundo, e fecha a folha. Sem esta parte,
       o que vem a seguir passava com uma moldura que nunca apanhou nada. */
    expect(moldura.className).toContain("inset-0");
    expect(classes(moldura)).not.toContain("pointer-events-none");
    fireEvent.mouseDown(moldura);
    expect(screen.queryByRole("dialog")).toBeNull();

    // NADA de esperas aqui. É o primeiro fotograma — e o perigo está no ecrã.
    expect(folha.isConnected).toBe(true);
    expect(classes(moldura)).toContain("pointer-events-none");
  });

  it("a página destranca no instante, com a folha ainda no ecrã", async () => {
    const folha = await abrirAFusao();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(document.body.style.overflow).not.toBe("hidden");
    expect(folha.isConnected).toBe(true);
  });

  /**
   * ── E O QUE SAI NÃO MUDA DE CONTEÚDO A MEIO DA SAÍDA ─────────────────────
   *
   * O `onClose` põe o `aFundir` a `null` no instante do gesto — é isso que
   * fecha. Se a folha continuasse a ler o estado do pai enquanto se apaga, os
   * 200 ms seguintes eram uma folha sem tema de origem: o nome no cabeçalho
   * desaparecia (ou rebentava) precisamente no fotograma em que ela devia estar
   * a apagar-se, e a última coisa que se lia dela era uma frase partida.
   */
  it("continua a dizer de que tema era, com o estado do pai já limpo", async () => {
    const folha = await abrirAFusao();
    expect(folha.textContent).toContain("Clássico Intemporal");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(folha.isConnected).toBe(true);
    expect(folha.textContent).toContain("Clássico Intemporal");
  });
});

describe("quem pediu menos movimento não espera pela saída", () => {
  it("a folha desaparece no instante, sem passar por saída nenhuma", async () => {
    simularMovimento({ menos: true });
    const folha = await abrirAFusao();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(folha.isConnected).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DENTRO DE UM TEMA: A FOLHA DE COPIAR E O VISUALIZADOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As outras duas caixas que este ficheiro desmontava. O contrato do
 * visualizador está preso à parte (`PhotoLightbox.saida.test.tsx`); o que se
 * mede aqui é a metade que só o PAI pode dar — segurar o nó os 200 ms com o
 * estado dele já limpo.
 */

/** Abre a pasta do primeiro tema, com uma foto lá dentro. */
async function abrirAPasta() {
  render(
    <ToastProvider>
      <Temas />
    </ToastProvider>,
  );
  await assentar();
  const cartao = screen
    .getAllByRole("button", { name: /Clássico Intemporal/ })
    .find((b) => b.getAttribute("aria-haspopup") !== "menu")!;
  fireEvent.click(cartao);
  await screen.findByRole("button", { name: "Eliminar tema" });
  await assentar();
}

describe("dentro de um tema, as duas caixas ficam montadas a sair", () => {
  it("o visualizador fica a apagar-se depois de o `zoomAt` cair", async () => {
    await abrirAPasta();
    fireEvent.click(await screen.findByRole("button", { name: /Ver a foto 1 em grande/ }));
    const lupa = await screen.findByRole("dialog", { name: "Foto 1 de 1" });
    // Controlo negativo: aberto, cobre o ecrã, entra com a palavra da casa e
    // apanha os toques da grelha que está por baixo.
    expect(classes(lupa)).toContain("bo-entrada");
    expect(classes(lupa)).not.toContain("bo-saida");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    // Sem esperar um milissegundo: já não é um diálogo, já não apanha toques —
    // e ainda está no ecrã, que é o que faz isto medir alguma coisa.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(lupa.isConnected).toBe(true);
    expect(classes(lupa)).toContain("bo-saida");
    expect(lupa.hasAttribute("inert")).toBe(true);
    // E a grelha por baixo volta a rolar já.
    expect(document.body.style.overflow).not.toBe("hidden");

    await act(async () => {
      await new Promise((r) => setTimeout(r, SAIDA_MS + 60));
    });
    expect(lupa.isConnected).toBe(false);
  });

  it("a folha de copiar fotos leva a contagem congelada, e não uma contagem a zero", async () => {
    await abrirAPasta();
    // A célula inteira é o alvo da seleção, e tem `role="checkbox"`.
    fireEvent.click(await screen.findByRole("checkbox", { name: /Selecionar foto 1 de 1/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Copiar para…" }));
    const folha = await screen.findByRole("dialog", { name: /1 foto selecionada/ });
    expect(classes(folha)).toContain("bo-entrada");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(folha.isConnected).toBe(true);
    expect(classes(folha)).toContain("bo-saida");
    // E continua a dizer o que dizia: os `paths` vão congelados, senão a última
    // coisa que se lia desta folha era uma contagem errada.
    expect(folha.textContent).toContain("1 foto selecionada");
  });
});
