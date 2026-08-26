// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import FundirTemas from "./FundirTemas";
import ThemeCopyDialog from "./ThemeCopyDialog";
import AjudaGlossario from "./AjudaGlossario";
import ShortcutsModal from "./ShortcutsModal";
import PasskeysDialog from "./PasskeysDialog";
import NewQuoteModal from "./NewQuoteModal";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS DIÁLOGOS DO BACK OFFICE SÃO FOLHAS INFERIORES NO TELEMÓVEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Eram seis caixas escritas à mão, cada uma com a sua cópia do `role="dialog"`,
 * do Escape, da armadilha de foco e do trinco do scroll — e nenhuma com a
 * camada de história, portanto o gesto de voltar do iPhone saía do back office
 * em vez de fechar a caixa. Passaram todas pelo `FolhaOuDialogo`.
 *
 * O que este ficheiro guarda é o que se perde numa refactorização distraída: a
 * caixa continuar a MUDAR DE FORMA (encostada ao fundo no telemóvel, centrada
 * no computador) e continuar a ter uma saída de teclado. Não é o aspecto — é a
 * diferença entre adaptar e esticar.
 *
 * O contrato completo do primitivo (aria-modal, botão de fechar, arrasto)
 * está em `ui/adaptativo.test.tsx`; aqui prende-se cada CONSUMIDOR a ele, que
 * é por onde se desfaz.
 */

/** O mesmo `matchMedia` falso do `ui/adaptativo.test.tsx`, e pela mesma razão:
 *  sem ele o jsdom responde `false` a tudo e o teste afirmava só o valor por
 *  omissão — que é, precisamente, a forma de telemóvel. */
function simularAparelho({ largura, toque }: { largura: number; toque: boolean }) {
  const ouvintes = new Set<() => void>();
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
      addEventListener: (_: string, cb: () => void) => ouvintes.add(cb),
      removeEventListener: (_: string, cb: () => void) => ouvintes.delete(cb),
      addListener: (cb: () => void) => ouvintes.add(cb),
      removeListener: (cb: () => void) => ouvintes.delete(cb),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

const TELEMOVEL = { largura: 375, toque: true };
const DESKTOP = { largura: 1440, toque: false };

const tema = (id: string, name: string, extra: Partial<ThemeSummary> = {}): ThemeSummary => ({
  id,
  name,
  imageCount: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});
const ORIGEM = tema("t-1", "Italia");
const TEMAS = [ORIGEM, tema("t-2", "Provença", { imageCount: 40 })];

/** Uma resposta que serve a qualquer das rotas que estes diálogos chamam ao
 *  abrir. Nenhum destes testes é sobre o que a rota devolve. */
const respostaVazia = () =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ dispositivos: [] }),
  }) as Response;

/** Os seis, montados abertos com o mínimo que cada um precisa. */
const DIALOGOS: { nome: string; montar: (onClose: () => void) => React.ReactElement }[] = [
  {
    nome: "Juntar temas",
    montar: (onClose) => (
      <FundirTemas sourceTheme={ORIGEM} themes={TEMAS} onClose={onClose} onDone={() => {}} />
    ),
  },
  {
    nome: "Copiar fotos para outro tema",
    montar: (onClose) => (
      <ThemeCopyDialog
        sourceTheme={ORIGEM}
        themes={TEMAS}
        paths={["a.jpg", "b.jpg"]}
        onClose={onClose}
        onDone={() => {}}
      />
    ),
  },
  { nome: "Ajuda e glossário", montar: (onClose) => <AjudaGlossario open onClose={onClose} /> },
  { nome: "Atalhos de teclado", montar: (onClose) => <ShortcutsModal open onClose={onClose} /> },
  { nome: "Os meus dispositivos", montar: (onClose) => <PasskeysDialog open onClose={onClose} /> },
  {
    nome: "Novo pedido",
    montar: (onClose) => (
      <ToastProvider>
        <NewQuoteModal open onClose={onClose} onCreated={() => {}} />
      </ToastProvider>
    ),
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => respostaVazia()),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(DIALOGOS)("$nome", ({ montar }) => {
  /**
   * A conta que motiva isto está no briefing: um diálogo centrado a 375 px é
   * uma caixa a flutuar com margens inúteis dos dois lados e com o botão de
   * fechar no canto mais longe do polegar. A folha usa a largura toda e põe as
   * acções em baixo, onde o polegar está.
   */
  it("no telemóvel encosta ao fundo; no computador fica centrada", async () => {
    simularAparelho(TELEMOVEL);
    const { unmount } = render(montar(() => {}));
    await waitFor(() => expect(screen.getByRole("dialog").className).toContain("mt-auto"));
    unmount();

    simularAparelho(DESKTOP);
    render(montar(() => {}));
    await waitFor(() => expect(screen.getByRole("dialog").className).toContain("m-auto"));
  });

  it("o Escape fecha", async () => {
    simularAparelho(DESKTOP);
    const fechar = vi.fn();
    render(montar(fechar));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(fechar).toHaveBeenCalled();
  });
});

/**
 * ── AS DUAS QUE SE TRANCAM, E PORQUÊ ───────────────────────────────────────
 *
 * «Se falhar, não perder trabalho.» Uma fusão de temas e uma cópia de 300 fotos
 * correm em voltas de rede: cada volta é atómica, mas o que fica de uma
 * interrompida é um tema com menos fotos e outro com mais. As duas já
 * protegiam o clique no fundo com um `&& !running` escrito à mão — o que não
 * tinham era o Escape trancado no telemóvel, nem a camada de história.
 *
 * Estes dois testes são os que o `bloqueado` do primitivo existe para passar.
 */
describe("a meio de uma operação por lotes, isto não se fecha", () => {
  /** Um `fetch` que nunca responde: deixa o diálogo preso em «a correr», que é
   *  exactamente o estado que se quer exercitar. */
  function fetchQueNuncaResponde() {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
  }

  const CASOS = [
    {
      nome: "Juntar temas",
      montar: (onClose: () => void) => (
        <FundirTemas sourceTheme={ORIGEM} themes={TEMAS} onClose={onClose} onDone={() => {}} />
      ),
      // Sem destino escolhido o botão está desactivado.
      arrancar: () => {
        fireEvent.click(screen.getByRole("radio", { name: /Provença/ }));
        fireEvent.click(screen.getByRole("button", { name: "Juntar os temas" }));
      },
    },
    {
      nome: "Copiar fotos",
      montar: (onClose: () => void) => (
        <ThemeCopyDialog
          sourceTheme={ORIGEM}
          themes={TEMAS}
          paths={["a.jpg", "b.jpg"]}
          onClose={onClose}
          onDone={() => {}}
        />
      ),
      arrancar: () => {
        fireEvent.click(screen.getByRole("button", { name: /Copiar 2 fotos/ }));
      },
    },
  ];

  it.each(CASOS)(
    "$nome: nem o Escape nem o fundo fecham enquanto corre",
    async ({ montar, arrancar }) => {
      simularAparelho(TELEMOVEL);
      fetchQueNuncaResponde();
      const fechar = vi.fn();
      render(montar(fechar));
      await screen.findByRole("dialog");

      arrancar();
      // O «Cancelar» vira «Parar»: é o sinal de que a operação arrancou, e é a
      // saída que impede isto de ser uma barreira.
      await screen.findByRole("button", { name: "Parar" });

      fireEvent.keyDown(document, { key: "Escape" });
      const fundo = screen.getByRole("dialog").parentElement as HTMLElement;
      fireEvent.mouseDown(fundo);

      expect(fechar).not.toHaveBeenCalled();
      // E o «×» também não: a saída é o «Parar», que fecha a volta a correr em
      // vez de a cortar.
      expect(screen.getByRole("button", { name: "Fechar" })).toBeDisabled();
    },
  );
});

/**
 * Num telemóvel a lista de atalhos é uma folha inteira a ensinar teclas que o
 * aparelho não tem. O botão que a abre já era `pointer-coarse:hidden` na
 * gaveta de navegação; faltava o conteúdo dizer o mesmo.
 */
describe("os atalhos que precisam mesmo de um teclado", () => {
  it("os grupos sem contrapartida no toque escondem-se no dedo; o «Geral» fica", () => {
    simularAparelho(TELEMOVEL);
    render(<ShortcutsModal open onClose={() => {}} />);

    const grupo = (titulo: string) => screen.getByText(titulo).parentElement as HTMLElement;
    // O jsdom não avalia media queries sobre classes — o que se prende aqui é
    // o CONTRATO das classes, como nos testes do `MenuDeAccoes`.
    expect(grupo("Navegar — pressiona G, depois…").className).toContain("pointer-coarse:hidden");
    expect(grupo("Estúdio de propostas").className).toContain("pointer-coarse:hidden");
    expect(grupo("Organização de propostas — com um cartão focado").className).toContain(
      "pointer-coarse:hidden",
    );
    // O «Geral» sobrevive: cada uma das suas seis linhas tem um botão à vista
    // no telemóvel, portanto lê-se como um índice do que a barra faz.
    expect(grupo("Geral").className ?? "").not.toContain("pointer-coarse:hidden");
  });
});

/**
 * Catorze campos num telemóvel. Eram `sm:grid-cols-2`, e `sm:` pergunta pelo
 * ECRÃ — a pergunta errada para uma caixa. É o engano que o MOBILE-AUDIT diz
 * ser o mais fácil de repetir neste back office.
 */
describe("o formulário do «Novo pedido»", () => {
  it("as colunas medem a caixa e não o ecrã", () => {
    simularAparelho(TELEMOVEL);
    render(
      <ToastProvider>
        <NewQuoteModal open onClose={() => {}} onCreated={() => {}} />
      </ToastProvider>,
    );
    const grelha = screen.getByLabelText(/Nome/).closest("div.grid") as HTMLElement;
    expect(grelha.className).toContain("@min-[26rem]:grid-cols-2");
    expect(grelha.className).not.toContain("sm:grid-cols-2");
    // O contentor tem de existir, senão a consulta não tem sobre o que medir.
    expect(grelha.parentElement?.className).toContain("@container");
  });
});
