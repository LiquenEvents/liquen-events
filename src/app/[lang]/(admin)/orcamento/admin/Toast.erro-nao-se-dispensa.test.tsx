// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "./Toast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ERRO NÃO SE DISPENSA SOZINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro existe por causa de um defeito medido: o relógio de 4 s do
 * `Toast` era armado para TODOS os avisos, incluindo os de erro. A única
 * notícia de que uma gravação, um envio ou um carregamento falhou aparecia no
 * canto e ia-se embora quatro segundos depois — sem gesto nenhum de quem
 * estava a trabalhar, e sem sítio nenhum onde a voltar a ler.
 *
 * É exactamente o caso da WCAG 2.2.1: conteúdo que desaparece por si tem de
 * poder ser dispensado por quem o lê. Quem estivesse a escrever num campo, a
 * olhar para outro canto do ecrã, ou simplesmente a ler mais devagar do que
 * quatro segundos, ficava a achar que tinha corrido tudo bem.
 *
 * O sucesso pode ir-se — a página por baixo já mostra o resultado. O erro sai
 * pelo «Fechar» e mais nada. As três verificações abaixo prendem as três
 * pontas: o erro fica, o sucesso vai-se, e o erro continua a ter saída.
 *
 * (Nada aqui é geometria: o jsdom não tem disposição nenhuma. O que se mede é
 * o CICLO DE VIDA do aviso, que é onde o defeito estava.)
 */

function Disparador() {
  const { toast } = useToast();
  return (
    <>
      <button onClick={() => toast("A gravação falhou", "error")}>falhar</button>
      <button onClick={() => toast("Gravado", "success")}>gravar</button>
    </>
  );
}

/** O tempo que o aviso conta antes de se ir embora, com folga. */
const MUITO_DEPOIS_DO_RELOGIO = 30_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function montar() {
  render(
    <ToastProvider>
      <Disparador />
    </ToastProvider>,
  );
}

describe("Aviso de erro", () => {
  it("continua no ecrã muito depois de o relógio dos avisos ter passado", () => {
    montar();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "falhar" }));
    });
    expect(screen.getByText("A gravação falhou")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(MUITO_DEPOIS_DO_RELOGIO);
    });

    expect(screen.getByText("A gravação falhou")).toBeInTheDocument();
  });

  it("um sucesso, esse, dispensa-se sozinho — senão a pilha nunca esvaziava", () => {
    montar();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "gravar" }));
    });
    expect(screen.getByText("Gravado")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(MUITO_DEPOIS_DO_RELOGIO);
    });

    expect(screen.queryByText("Gravado")).not.toBeInTheDocument();
  });

  it("o erro que fica tem de ter saída: o «Fechar» dispensa-o", () => {
    montar();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "falhar" }));
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    // A saída segura o nó montado enquanto a animação corre; passado o tempo
    // dela, o aviso tem mesmo de ter deixado a árvore.
    act(() => {
      vi.advanceTimersByTime(MUITO_DEPOIS_DO_RELOGIO);
    });

    expect(screen.queryByText("A gravação falhou")).not.toBeInTheDocument();
  });

  it("passar o rato por cima e sair não rearma o relógio de um erro", () => {
    montar();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "falhar" }));
    });
    const caixa = screen.getByText("A gravação falhou").closest("div") as HTMLElement;

    // Era por aqui que o defeito voltava pela porta das traseiras: o `resume()`
    // do `mouseleave` armava um relógio novo em qualquer aviso.
    act(() => {
      fireEvent.mouseEnter(caixa);
      fireEvent.mouseLeave(caixa);
      vi.advanceTimersByTime(MUITO_DEPOIS_DO_RELOGIO);
    });

    expect(screen.getByText("A gravação falhou")).toBeInTheDocument();
  });
});
