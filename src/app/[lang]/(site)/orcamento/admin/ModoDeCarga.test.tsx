// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ModoDeCarga from "./ModoDeCarga";
import type { PropItem } from "@/lib/inventory-types";

/**
 * O modo de carga é o único ecrã do back office desenhado para ser usado de pé,
 * numa quinta, com uma mão. O que estes testes guardam é o que faz isso
 * funcionar — e sobretudo o que faz isso funcionar SEM REDE.
 */

const item = (id: string, name: string, quantity = 4): PropItem => ({
  id,
  name,
  category: "Vasos e Jarras",
  quantity,
  condition: "bom",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

const ITENS = [item("a", "Jarras de vidro"), item("b", "Castiçais", 12), item("c", "Toalhas", 6)];

const desenhar = (itens = ITENS) => render(<ModoDeCarga itens={itens} onSair={() => {}} />);

const linha = (nome: string) => screen.getByRole("button", { name: new RegExp(nome) });
const contador = () => screen.getByRole("status").textContent;

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("modo de carga", () => {
  it("conta o que já está riscado", async () => {
    desenhar();
    expect(contador()).toBe("0 de 3 carregados");
    fireEvent.click(linha("Jarras de vidro"));
    await waitFor(() => expect(contador()).toBe("1 de 3 carregados"));
  });

  it("voltar a tocar desrisca — enganos acontecem com a carrinha a meio", async () => {
    desenhar();
    fireEvent.click(linha("Castiçais"));
    await waitFor(() => expect(contador()).toBe("1 de 3 carregados"));
    fireEvent.click(linha("Castiçais"));
    await waitFor(() => expect(contador()).toBe("0 de 3 carregados"));
  });

  /**
   * O ponto principal do ecrã: numa quinta a rede falha, e uma lista de carga
   * que precise de rede é uma lista que não serve exactamente quando é precisa.
   * O que está riscado vive no telemóvel e sobrevive a fechar o browser.
   */
  it("o que está riscado sobrevive a fechar e reabrir, sem rede nenhuma", async () => {
    const { unmount } = desenhar();
    fireEvent.click(linha("Jarras de vidro"));
    fireEvent.click(linha("Toalhas"));
    await waitFor(() => expect(contador()).toBe("2 de 3 carregados"));
    unmount();

    // Nem sequer há `fetch` neste teste: se o ecrã dependesse da rede, isto
    // rebentava em vez de contar dois.
    desenhar();
    await waitFor(() => expect(contador()).toBe("2 de 3 carregados"));
  });

  /**
   * Se contasse tudo o que alguma vez foi riscado, o "12 de 34" passava a
   * mentir assim que ela mudasse de categoria — e a contagem é a única coisa
   * que este ecrã tem de acertar.
   */
  it("conta só o que está na lista à frente dela", async () => {
    const { unmount } = desenhar();
    fireEvent.click(linha("Castiçais"));
    await waitFor(() => expect(contador()).toBe("1 de 3 carregados"));
    unmount();

    // Mudou o filtro: os castiçais já não estão na lista.
    desenhar([ITENS[0], ITENS[2]]);
    await waitFor(() => expect(contador()).toBe("0 de 2 carregados"));
  });

  it("diz quando está tudo carregado", async () => {
    desenhar();
    for (const nome of ["Jarras de vidro", "Castiçais", "Toalhas"]) fireEvent.click(linha(nome));
    expect(await screen.findByText("Está tudo carregado.")).toBeInTheDocument();
  });

  it("limpar volta a zero", async () => {
    desenhar();
    fireEvent.click(linha("Jarras de vidro"));
    await waitFor(() => expect(contador()).toBe("1 de 3 carregados"));
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(contador()).toBe("0 de 3 carregados"));
  });

  /**
   * O «Limpar» apagava TUDO o que alguma vez fora riscado, incluindo o que
   * pertence a outro filtro — e aparecia/desaparecia consoante a contagem DESTA
   * lista. A carga faz-se por categorias: risca-se os vasos, sai-se, muda-se o
   * filtro, entra-se nas toalhas. Um «Limpar» ali dado para refazer as duas
   * toalhas levava atrás os doze vasos que já estavam na carrinha — sem aviso e
   * sem forma de desfazer. Ao voltar à categoria anterior lia-se "0 de 14" e
   * carregava-se outra vez o que já lá estava.
   *
   * É a mesma razão do teste acima: este ecrã fala sempre da lista à frente dela.
   */
  it("limpar não apaga o que foi riscado noutro filtro", async () => {
    const { unmount } = desenhar();
    fireEvent.click(linha("Jarras de vidro"));
    fireEvent.click(linha("Castiçais"));
    await waitFor(() => expect(contador()).toBe("2 de 3 carregados"));
    unmount();

    // Mudou o filtro: só as toalhas estão à frente dela.
    const so = desenhar([ITENS[2]]);
    fireEvent.click(linha("Toalhas"));
    await waitFor(() => expect(contador()).toBe("1 de 1 carregados"));
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    await waitFor(() => expect(contador()).toBe("0 de 1 carregados"));
    so.unmount();

    // De volta à lista inteira: as jarras e os castiçais continuam carregados.
    desenhar();
    await waitFor(() =>
      expect(contador(), "o «Limpar» de uma lista apagou marcações de outra").toBe(
        "2 de 3 carregados",
      ),
    );
  });

  /** A linha inteira é o alvo: um quadrado de 20 px ao sol, com a outra mão
   *  ocupada, é onde se falha o toque. */
  it("a linha inteira é que é o botão, e é alta", () => {
    desenhar();
    const l = linha("Jarras de vidro");
    expect(l.tagName).toBe("BUTTON");
    expect(l.style.minHeight).toBe("64px");
    // A quantidade vai na linha — é o que se conta ao carregar.
    expect(l.textContent).toContain("4");
  });

  it("um localStorage indisponível não parte o ecrã", async () => {
    // Janela privada, política do browser: acontece, e aqui não pode custar
    // mais do que perder a marcação.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    desenhar();
    expect(contador()).toBe("0 de 3 carregados");
    fireEvent.click(linha("Jarras de vidro"));
    await waitFor(() => expect(contador()).toBe("1 de 3 carregados"));
    vi.restoreAllMocks();
  });

  it("avisa que está sem rede, sem deixar de funcionar", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    desenhar();
    expect(await screen.findByText(/Sem rede — a lista continua a funcionar/)).toBeInTheDocument();
    fireEvent.click(linha("Toalhas"));
    await waitFor(() => expect(contador()).toBe("1 de 3 carregados"));
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  /** Guardar isto no servidor seria transformar uma sessão de trabalho num
   *  registo do negócio — e obrigar a rede onde ela não existe. */
  it("é honesto sobre onde a marcação fica", () => {
    desenhar();
    expect(screen.getByText(/neste telemóvel/)).toBeInTheDocument();
  });
});
