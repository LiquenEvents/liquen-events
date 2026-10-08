// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Inspector } from "./Inspector";
import { Inspector as DoBarril } from "./index";
import { SAIDA_MS } from "./saida";

/**
 * O inspector ainda não está em ecrã nenhum — a Fase 3 é que o monta no
 * estúdio. O que se prende aqui é o contrato: as duas formas (coluna a partir
 * de `lg`, folha abaixo), o material opaco, o ⌘I, o Escape e o foco que entra
 * e volta.
 *
 * O jsdom não tem `matchMedia`; sem um falso tudo dá «não» e o `useAdaptativo`
 * resolve para telemóvel — o inspector seria sempre folha.
 */
function simularAparelho(largura: number, menosMovimento = false) {
  vi.stubGlobal("matchMedia", (mq: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min ? largura >= Number(min[1]) : mq.includes("reduce") ? menosMovimento : false;
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Quem tem o estado. O botão de fora é o que tinha o foco antes de abrir. */
function Anfitriao({ inicial = false, comCampo = false }: { inicial?: boolean; comCampo?: boolean }) {
  const [aberto, setAberto] = useState(inicial);
  return (
    <>
      <button onClick={() => setAberto((a) => !a)}>Mostrar o inspector</button>
      <input aria-label="Notas da proposta" />
      <div contentEditable suppressContentEditableWarning data-testid="rico" />
      <Inspector
        aberto={aberto}
        onFechar={() => setAberto(false)}
        titulo="Só para ti"
        atalho
        onAlternar={() => setAberto((a) => !a)}
      >
        {comCampo ? <input aria-label="Margem" /> : <p>Margem: 32%</p>}
      </Inspector>
    </>
  );
}

describe("a partir de lg, é uma coluna", () => {
  it("de 320 px, nomeada pelo título, opaca e sem vidro", () => {
    simularAparelho(1440);
    render(<Anfitriao inicial />);
    const painel = screen.getByRole("complementary", { name: "Só para ti" });
    expect(painel).toHaveClass("w-80", "bg-[var(--bo-elevado)]", "shadow-[var(--bo-sombra-suspensa)]");
    expect(painel.className).not.toMatch(/backdrop|bo-material|bo-vidro/);
    expect(screen.queryByRole("dialog")).toBeNull();
    // Antes de montar a largura não se sabe; quem esconde a coluna no
    // telemóvel, nesse instante, é o CSS.
    expect(painel).toHaveClass("max-lg:hidden");
  });

  it("e abaixo de lg, é uma folha", () => {
    simularAparelho(390);
    render(<Anfitriao inicial />);
    expect(screen.getByRole("dialog", { name: "Só para ti" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("vem do barril dos primitivos", () => {
    expect(DoBarril).toBe(Inspector);
  });
});

describe("⌘I", () => {
  it("abre e fecha, com ⌘ ou com Ctrl, e não deixa o browser fazer mais nada com ele", () => {
    simularAparelho(1440);
    render(<Anfitriao />);
    expect(screen.queryByRole("complementary")).toBeNull();

    const aberto = fireEvent.keyDown(document.body, { key: "i", metaKey: true });
    expect(aberto, "o ⌘I não foi travado").toBe(false); // preventDefault
    expect(screen.getByRole("complementary", { name: "Só para ti" })).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "I", ctrlKey: true });
    // A saída segura o nó 200 ms, mas ele já não é um painel para ninguém.
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("também dentro de um campo de texto", () => {
    simularAparelho(1440);
    render(<Anfitriao />);
    fireEvent.keyDown(screen.getByLabelText("Notas da proposta"), { key: "i", metaKey: true });
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("mas num `contenteditable` o ⌘I é itálico, e fica para ele", () => {
    simularAparelho(1440);
    render(<Anfitriao />);
    const rico = screen.getByTestId("rico");
    // O jsdom não calcula o `isContentEditable` a partir do atributo.
    Object.defineProperty(rico, "isContentEditable", { value: true });
    const naoTravado = fireEvent.keyDown(rico, { key: "i", metaKey: true });
    expect(naoTravado).toBe(true);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("um I sem modificador, ou com Shift, não faz nada", () => {
    simularAparelho(1440);
    render(<Anfitriao />);
    fireEvent.keyDown(document.body, { key: "i" });
    fireEvent.keyDown(document.body, { key: "I", metaKey: true, shiftKey: true });
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("o foco", () => {
  it("entra no painel quando ela o abre, e volta a quem o tinha quando fecha", () => {
    simularAparelho(1440);
    render(<Anfitriao comCampo />);
    const origem = screen.getByRole("button", { name: "Mostrar o inspector" });
    origem.focus();
    fireEvent.click(origem);
    expect(screen.getByLabelText("Margem")).toHaveFocus();

    fireEvent.keyDown(screen.getByLabelText("Margem"), { key: "Escape" });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(origem).toHaveFocus();
  });

  it("sem controlos no conteúdo, o foco vai para o «Fechar»", () => {
    simularAparelho(1440);
    render(<Anfitriao />);
    const origem = screen.getByRole("button", { name: "Mostrar o inspector" });
    origem.focus();
    fireEvent.click(origem);
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(origem).toHaveFocus();
  });

  it("um inspector que já vem aberto não puxa o foco para si", () => {
    simularAparelho(1440);
    render(<Anfitriao inicial comCampo />);
    expect(screen.getByLabelText("Margem")).not.toHaveFocus();
  });

  it("o Escape de fora do painel não é dele", () => {
    simularAparelho(1440);
    render(<Anfitriao inicial />);
    fireEvent.keyDown(screen.getByLabelText("Notas da proposta"), { key: "Escape" });
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });
});

describe("a saída", () => {
  it("segura o nó a apagar-se, fora da árvore e sem toques, e depois larga-o", () => {
    simularAparelho(1440);
    vi.useFakeTimers();
    render(<Anfitriao inicial />);
    const painel = screen.getByRole("complementary");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(painel).toBeInTheDocument();
    expect(painel).toHaveClass("bo-saida");
    expect(painel).toHaveAttribute("aria-hidden", "true");
    act(() => {
      vi.advanceTimersByTime(SAIDA_MS + 50);
    });
    expect(painel).not.toBeInTheDocument();
  });

  it("e quem pediu menos movimento não espera por ela", () => {
    simularAparelho(1440, true);
    render(<Anfitriao inicial />);
    const painel = screen.getByRole("complementary");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(painel).not.toBeInTheDocument();
  });
});
