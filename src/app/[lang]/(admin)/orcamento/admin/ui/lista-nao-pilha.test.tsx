// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { TabelaOuCartoes } from "./TabelaOuCartoes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA LISTA, E NÃO UMA PILHA DE CAIXAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Passo do redesenho que ela aprovou, no ecrã dos Pedidos. Cada linha era um
 * cartão com moldura própria, canto próprio e fundo próprio, com 8 px de ar
 * entre eles. Vinte pedidos eram vinte molduras — e vinte molduras não são uma
 * lista: são vinte coisas separadas que por acaso estão em cima umas das outras.
 *
 * A moldura sobe para o GRUPO e sai de cada linha; o que separa passa a ser um
 * fio. Não é um desenho novo — é o mesmo movimento que os três números do
 * dinheiro da Visão Geral já tinham feito, com a razão escrita lá: «três caixas
 * com ar entre elas gastam três vezes a mesma margem».
 *
 * ── O QUE ESTE FICHEIRO GUARDA ────────────────────────────────────────────
 *
 * Que a pilha não volta. É a mudança mais fácil de desfazer sem querer: basta
 * alguém acrescentar um `rounded-xl border` a uma linha para «dar destaque», e
 * a partir daí meia lista tem moldura e a outra meia não.
 *
 * E que a linha continua a RESPONDER ao toque. Ao tirar a moldura tirou-se
 * também o `hover:border` que dizia «isto é clicável»; se o realce da faixa
 * desaparecer, a lista fica bonita e morta.
 */

const ITENS = [
  { id: "a", nome: "Ana e Bruno" },
  { id: "b", nome: "Carla e Diogo" },
  { id: "c", nome: "Eva e Filipe" },
];

const COLUNAS = [{ chave: "nome", cabecalho: "Casal", celula: (i: (typeof ITENS)[0]) => i.nome }];

/** O jsdom não tem `matchMedia`; sem isto a primitiva resolve para telemóvel. */
function desenhar(aoAbrir?: (i: (typeof ITENS)[0]) => void) {
  return render(
    <TabelaOuCartoes
      itens={ITENS}
      chaveDe={(i) => i.id}
      colunas={COLUNAS}
      cartao={(i) => <span>{i.nome}</span>}
      aoAbrir={aoAbrir}
      legenda="Pedidos"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a lista do telemóvel", () => {
  it("tem UMA moldura, no grupo, e não uma por linha", async () => {
    desenhar();
    const ul = await waitFor(() => screen.getByRole("list", { name: "Pedidos" }));
    expect(ul.className, "o grupo perdeu a moldura").toMatch(/\bborder\b/);
    expect(ul.className, "o grupo perdeu o fio que separa as linhas").toMatch(/\bdivide-y\b/);
    // E deixou de haver ar entre caixas: o que separa é o fio, não o vazio.
    expect(ul.className).not.toMatch(/\bgap-\d/);
  });

  it("nenhuma linha traz moldura ou canto próprios", async () => {
    const aoAbrir = vi.fn();
    desenhar(aoAbrir);
    await waitFor(() => screen.getByRole("list", { name: "Pedidos" }));
    for (const b of screen.getAllByRole("button")) {
      // As chavetas SAEM antes de procurar. Sem isto, o
      // `transition-[background-color,border-color,…]` do primitivo do movimento
      // contém a palavra «border-color» e dava um falso positivo — um teste a
      // reprovar uma classe que não desenha moldura nenhuma.
      const classes = b.className.replace(/\[[^\]]*\]/g, "");
      expect(classes, `uma linha voltou a ter moldura: ${b.className}`).not.toMatch(
        /\bborder\b|\bborder-[a-z]/,
      );
      expect(classes, `uma linha voltou a ter canto: ${b.className}`).not.toMatch(/\brounded/);
    }
  });

  it("mas continua a responder ao toque — senão fica bonita e morta", async () => {
    desenhar(vi.fn());
    await waitFor(() => screen.getByRole("list", { name: "Pedidos" }));
    const primeira = screen.getAllByRole("button")[0];
    // Ao tirar a moldura tirou-se o `hover:border` que dizia «isto clica-se».
    // O realce passou para a FAIXA: numa mão que tapa metade do ecrã, um fundo
    // lê-se e um contorno de 1 px não.
    expect(primeira.className).toMatch(/hover:bg-/);
    expect(primeira.className).toMatch(/active:bg-/);
  });

  it("uma lista que não abre nada continua a ser uma lista", async () => {
    // Sem `aoAbrir` as linhas são `div` e não `button` — e a moldura do grupo
    // tem de continuar a ser do grupo.
    desenhar();
    const ul = await waitFor(() => screen.getByRole("list", { name: "Pedidos" }));
    expect(ul.querySelectorAll("li").length).toBe(3);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
