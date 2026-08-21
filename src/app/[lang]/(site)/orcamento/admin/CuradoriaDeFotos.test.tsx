// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ThemeImage } from "@/lib/theme-types";
import { CuradoriaDeFotos } from "./CuradoriaDeFotos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA FOTO DE CADA VEZ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «percorrer 40 fotos parecidas numa grelha de miniaturas leva a
 * escolhas distraídas. Uma de cada vez, em grande, permite decidir com atenção —
 * e é mais rápido, não mais lento.»
 *
 * O que se prende aqui é o contrato do modo: cada foto custa UMA decisão, a
 * decisão é reversível, e no fim diz-se o que ficou escolhido antes de
 * confirmar seja o que for.
 */

const FOTOS: ThemeImage[] = Array.from({ length: 4 }, (_, i) => ({
  path: `t1/foto-${i + 1}.jpg`,
  url: `https://cdn.test/foto-${i + 1}.jpg`,
  thumbUrl: `https://cdn.test/mini-${i + 1}.jpg`,
}));

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

/** Um arrasto, do ponto A ao ponto B. */
function arrastar(alvo: HTMLElement, dx: number, dy = 0) {
  (alvo as HTMLElement & { setPointerCapture: () => void }).setPointerCapture = () => {};
  fireEvent.pointerDown(alvo, { clientX: 200, clientY: 300, pointerId: 1 });
  fireEvent.pointerMove(alvo, { clientX: 200 + dx, clientY: 300 + dy, pointerId: 1 });
  fireEvent.pointerUp(alvo, { clientX: 200 + dx, clientY: 300 + dy, pointerId: 1 });
}

const cartao = () => screen.getByRole("group", { name: /^Foto \d+ de \d+/ });

afterEach(cleanup);

describe("a curadoria", () => {
  it("mostra uma foto de cada vez, e diz quantas faltam", () => {
    montar();
    expect(screen.getByText("1 de 4")).toBeTruthy();
    // Uma imagem só — é o ponto todo do modo.
    expect(document.querySelectorAll("img")).toHaveLength(1);
  });

  it("deslizar para a direita inclui e avança", () => {
    const { aoDecidir } = montar();
    arrastar(cartao(), 120);
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", true);
    expect(screen.getByText("2 de 4")).toBeTruthy();
  });

  it("para a esquerda salta — e saltar não é escolher", () => {
    const { aoDecidir } = montar();
    arrastar(cartao(), -120);
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", false);
    expect(screen.getByText("2 de 4")).toBeTruthy();
  });

  it("para cima abre em grande, sem decidir nada", () => {
    const { aoDecidir, aoVerGrande } = montar();
    arrastar(cartao(), 0, -120);
    expect(aoVerGrande).toHaveBeenCalledWith(0);
    expect(aoDecidir).not.toHaveBeenCalled();
    expect(screen.getByText("1 de 4"), "ver não avança").toBeTruthy();
  });

  it("um arrasto curto não decide nada", () => {
    const { aoDecidir } = montar();
    // Trinta pixéis é um toque trémulo, não um gesto.
    arrastar(cartao(), 30);
    expect(aoDecidir).not.toHaveBeenCalled();
    expect(screen.getByText("1 de 4")).toBeTruthy();
  });

  it("na diagonal, ganha o eixo que andou mais", () => {
    // Sem esta regra, um arrasto inclinado decidia por acidente ao subir.
    const { aoDecidir, aoVerGrande } = montar();
    arrastar(cartao(), 120, -80);
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", true);
    expect(aoVerGrande).not.toHaveBeenCalled();
  });

  it("os botões fazem o mesmo que os dedos", () => {
    const { aoDecidir } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", true);
    fireEvent.click(screen.getByRole("button", { name: /Saltar/ }));
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-2.jpg", false);
  });

  it("e as setas do teclado também — quem navega por teclado não desliza", () => {
    const { aoDecidir, aoVerGrande } = montar();
    fireEvent.keyDown(cartao(), { key: "ArrowRight" });
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", true);
    fireEvent.keyDown(cartao(), { key: "ArrowLeft" });
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-2.jpg", false);
    fireEvent.keyDown(cartao(), { key: "ArrowUp" });
    expect(aoVerGrande).toHaveBeenCalledWith(2);
  });

  /**
   * ANULAR É ANULAR MESMO.
   *
   * Uma foto incluída por engano tem de SAIR da selecção, não só voltar ao
   * ecrã: um «anular» que desfaz metade é pior do que nenhum, porque dá a
   * sensação de ter desfeito.
   */
  it("anular tira a foto da selecção e volta atrás", () => {
    const { aoDecidir } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    aoDecidir.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Anular/ }));
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", false);
    expect(screen.getByText("1 de 4")).toBeTruthy();
  });

  it("anular uma que foi SALTADA não tira nada — só volta", () => {
    const { aoDecidir } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Saltar/ }));
    aoDecidir.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Anular/ }));
    expect(aoDecidir).not.toHaveBeenCalled();
    expect(screen.getByText("1 de 4")).toBeTruthy();
  });

  it("sem nada decidido, não há o que anular", () => {
    montar();
    expect(screen.getByRole("button", { name: /Anular/ })).toBeDisabled();
  });

  it("no fim, diz o que ficou escolhido antes de confirmar", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    fireEvent.click(screen.getByRole("button", { name: /Saltar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    fireEvent.click(screen.getByRole("button", { name: /Saltar/ }));
    expect(screen.getByText("Escolheste 2 fotos.")).toBeTruthy();
    // O resumo é de miniaturas: o que se confirma são fotografias, e uma lista
    // de caminhos não diz nada sobre elas.
    expect(document.querySelectorAll("img")).toHaveLength(2);
  });

  it("e quando não se escolheu nenhuma, di-lo sem drama", () => {
    montar({ images: FOTOS.slice(0, 1) });
    fireEvent.click(screen.getByRole("button", { name: /Saltar/ }));
    expect(screen.getByText("Passaste por todas e não escolheste nenhuma.")).toBeTruthy();
  });

  /**
   * NO TETO DO LOTE, INCLUIR NÃO FAZ NADA — MAS SALTAR FAZ.
   *
   * Sem esta distinção, a curadoria ficava presa na mesma foto sem dizer
   * porquê: o botão de incluir não respondia e o de saltar também não, porque
   * era o mesmo caminho.
   */
  it("no teto do lote, saltar continua a funcionar", () => {
    const { aoDecidir } = montar({ podeEscolherMais: false });
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    expect(aoDecidir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Saltar/ }));
    expect(aoDecidir).toHaveBeenCalledWith("t1/foto-1.jpg", false);
  });

  it("uma foto que já está na proposta di-lo na própria foto", () => {
    montar({ usadas: new Set(["t1/foto-1.jpg"]) });
    expect(screen.getByText("Já nesta proposta")).toBeTruthy();
    expect(cartao().getAttribute("aria-label")).toContain("já nesta proposta");
  });

  it("«Ver em grelha» sai sem decidir nada", () => {
    const { aoSair, aoDecidir } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Ver em grelha" }));
    expect(aoSair).toHaveBeenCalled();
    expect(aoDecidir).not.toHaveBeenCalled();
  });
});
