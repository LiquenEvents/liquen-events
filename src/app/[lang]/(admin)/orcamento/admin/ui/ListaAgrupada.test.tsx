// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ListaAgrupada, LinhaAgrupada } from "./ListaAgrupada";
import { ListaAgrupada as DoBarril, LinhaAgrupada as LinhaDoBarril } from "./index";
import { PRESSAO } from "./movimento";

/**
 * A lista agrupada «como as Definições do macOS» ainda não está em ecrã
 * nenhum — chega na Fase 3 (o estúdio) e na Fase 5 (os Temas). O que se prende
 * aqui é o contrato de que esses ecrãs vão depender: a semântica de lista, o
 * nome e a nota, o alvo de 44 px, o `›` só quando a linha leva a algum lado, e
 * o cartão sem sombra (é conteúdo, não flutua).
 */

afterEach(cleanup);

describe("ListaAgrupada", () => {
  it("é uma lista a sério, nomeada pelo título e descrita pela nota", () => {
    render(
      <ListaAgrupada titulo="Evento" nota="A data vem do pedido.">
        <LinhaAgrupada rotulo="Data" valor="10 jun 2028" />
        <LinhaAgrupada rotulo="Convidados" valor={148} />
      </ListaAgrupada>,
    );
    const lista = screen.getByRole("list", { name: "Evento" });
    expect(lista).toHaveAccessibleDescription("A data vem do pedido.");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
  });

  it("sem título visível, aceita um nome por `aria-label`", () => {
    render(
      <ListaAgrupada aria-label="Resumo">
        <LinhaAgrupada rotulo="Total" valor="4.500,00 €" />
      </ListaAgrupada>,
    );
    expect(screen.getByRole("list", { name: "Resumo" })).toBeInTheDocument();
  });

  it("é um cartão de conteúdo: canto de cartão, fundo de superfície, fio entre as linhas e nenhuma sombra", () => {
    render(
      <ListaAgrupada titulo="Evento">
        <LinhaAgrupada rotulo="Data" valor="10 jun 2028" />
      </ListaAgrupada>,
    );
    const lista = screen.getByRole("list");
    expect(lista).toHaveClass(
      "rounded-card",
      "bg-[var(--bo-surface)]",
      "divide-y",
      "divide-[var(--bo-hairline)]",
    );
    expect(lista.className).not.toMatch(/shadow|backdrop|bo-material/);
    // Sem `overflow-hidden`: cortava o anel de foco das linhas encostadas à moldura.
    expect(lista).not.toHaveClass("overflow-hidden");
  });

  it("vem do barril dos primitivos", () => {
    expect(DoBarril).toBe(ListaAgrupada);
    expect(LinhaDoBarril).toBe(LinhaAgrupada);
  });
});

describe("LinhaAgrupada", () => {
  it("só de leitura: rótulo e valor, sem botão nem `›`", () => {
    render(
      <ListaAgrupada titulo="Evento">
        <LinhaAgrupada rotulo="Convidados" valor={148} />
      </ListaAgrupada>,
    );
    const linha = screen.getByRole("listitem");
    expect(within(linha).queryByRole("button")).toBeNull();
    expect(linha).not.toHaveTextContent("›");
    expect(within(linha).getByText("148")).toHaveClass("tabular-nums");
    expect(linha.firstElementChild).toHaveClass("min-h-11");
  });

  it("com `onClick`, a linha inteira é um botão de 44 px, com `›` escondido do leitor", () => {
    const abrir = vi.fn();
    render(
      <ListaAgrupada titulo="Evento">
        <LinhaAgrupada rotulo="Data" valor="10 jun 2028" onClick={abrir} />
      </ListaAgrupada>,
    );
    // O nome é o rótulo e o valor — o `›` é decoração e não entra.
    const botao = screen.getByRole("button", { name: "Data 10 jun 2028" });
    expect(botao).toHaveAttribute("type", "button");
    expect(botao).toHaveClass("min-h-11", "w-full");
    expect(botao.querySelector('[aria-hidden="true"]')).toHaveTextContent("›");
    fireEvent.click(botao);
    expect(abrir).toHaveBeenCalledOnce();
  });

  it("o rato pinta a faixa e não a escala; o carregar afunda, como todo o comando da casa", () => {
    render(
      <ListaAgrupada titulo="Evento">
        <LinhaAgrupada rotulo="Data" onClick={() => {}} />
      </ListaAgrupada>,
    );
    const botao = screen.getByRole("button", { name: "Data" });
    expect(botao.className).not.toMatch(/hover:scale/);
    expect(botao).toHaveClass("hover:bg-[var(--bo-tinta-3)]", "active:bg-[var(--bo-tinta-6)]");
    expect(botao.className).toContain(PRESSAO);
  });

  it("desactivada, não responde", () => {
    const abrir = vi.fn();
    render(
      <ListaAgrupada titulo="Evento">
        <LinhaAgrupada rotulo="Data" onClick={abrir} disabled />
      </ListaAgrupada>,
    );
    const botao = screen.getByRole("button", { name: "Data" });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    expect(abrir).not.toHaveBeenCalled();
  });

  it("um valor zero aparece — só `undefined`/`null` ficam de fora", () => {
    render(
      <ListaAgrupada titulo="Evento">
        <LinhaAgrupada rotulo="Convidados" valor={0} />
      </ListaAgrupada>,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
