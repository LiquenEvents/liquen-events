// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProposalBuilder from "./ProposalBuilder";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE APAGA E NÃO VOLTA, NO CONSTRUTOR SIMPLES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas acções irreversíveis viviam aqui sem pergunta, sem anular e sem sequer
 * um aviso depois — a linha desaparecia e mais nada:
 *
 *  · o «×» de uma LINHA do orçamento;
 *  · os três atalhos de MODELO («Pacote único», «Por componentes», «Última
 *    proposta»), que não acrescentam nada: substituem a tabela inteira. Doze
 *    linhas escritas à mão saíam com uma carregada num botão cinzento que fica
 *    mesmo por cima delas.
 *
 * Cada uma ganhou UMA das duas protecções, e não as duas — pergunta-se o que é
 * raro e caro, oferece-se anular o que é frequente e barato de refazer. A razão
 * de cada escolha está escrita em `ProposalBuilder.tsx`, ao pé da função.
 *
 * O que estes testes prendem é o que separa uma pergunta útil de um «Tens a
 * certeza?»: que a frase NOMEIA a coisa, que DIZ O NÚMERO, e que responder
 * «não» (ou «Anular») devolve exactamente o que lá estava sem escrever nada.
 */

const quote = {
  id: "q1",
  name: "Maria & Zé",
  email: "maria@example.pt",
  category: "casamentos",
  eventType: "casamentos",
  status: "novo",
  createdAt: "2026-01-01T00:00:00.000Z",
  quotedPrice: 3000,
} as unknown as Quote;

/** O rascunho do servidor responde sempre «não tenho nada», para o ecrã abrir
 *  com a tabela de arranque e não com um orçamento de outro dia. */
const fetchMock = vi.fn(async () => {
  return { ok: true, status: 200, json: async () => ({ ok: true, draft: null }) } as Response;
});

function desenhar() {
  render(
    <ToastProvider>
      <ProposalBuilder quote={quote} />
    </ToastProvider>,
  );
  return userEvent.setup();
}

/** Escreve uma linha do orçamento: a descrição, a quantidade e o unitário. */
async function escreverLinha(
  user: ReturnType<typeof userEvent.setup>,
  i: number,
  descricao: string,
  qt: string,
  unit: string,
) {
  const desc = screen.getByLabelText(`Descrição da linha ${i}`);
  await user.clear(desc);
  if (descricao) await user.type(desc, descricao);
  const quantidade = screen.getByLabelText(`Quantidade da linha ${i}`);
  await user.clear(quantidade);
  await user.type(quantidade, qt);
  const preco = screen.getByLabelText(`Preço unitário da linha ${i}`);
  await user.clear(preco);
  await user.type(preco, unit);
  await user.tab();
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("remover uma linha — anular, e não pergunta", () => {
  it("a linha sai já, e o «Anular» diz qual era e quanto tirou ao total", async () => {
    const user = desenhar();
    await escreverLinha(user, 1, "Decoração floral", "2", "150");
    await user.click(screen.getByRole("button", { name: /Adicionar linha/i }));
    await escreverLinha(user, 2, "Coordenação do dia", "1", "400");

    await user.click(screen.getAllByRole("button", { name: /Remover linha/i })[0]);

    // Sem caixa nenhuma pelo meio: compor uma tabela É tirar e pôr linhas, e
    // uma pergunta a cada «×» é um editor que ninguém usa.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // A linha saiu mesmo.
    expect(screen.queryByDisplayValue("Decoração floral")).toBeNull();

    // E a barra NOMEIA a linha e dá o NÚMERO que ela tirou ao total (2 × 150).
    const barra = screen.getByText(/Pode anular durante/).textContent ?? "";
    expect(barra).toMatch(/Decoração floral/);
    expect(barra).toMatch(/300,00/);
  });

  it("anular devolve a linha inteira — descrição, quantidade e preço", async () => {
    const user = desenhar();
    await escreverLinha(user, 1, "Decoração floral", "2", "150");
    await user.click(screen.getByRole("button", { name: /Adicionar linha/i }));
    await escreverLinha(user, 2, "Coordenação do dia", "1", "400");

    await user.click(screen.getAllByRole("button", { name: /Remover linha/i })[0]);
    await user.click(screen.getByRole("button", { name: /^Anular$/ }));

    // Volta ao sítio onde estava, com os três campos como estavam — e não uma
    // linha em branco com o nome certo.
    expect(screen.getByLabelText("Descrição da linha 1")).toHaveValue("Decoração floral");
    expect(screen.getByLabelText("Quantidade da linha 1")).toHaveValue(2);
    expect(screen.getByLabelText("Preço unitário da linha 1")).toHaveValue("150");
    // A que ficou continua onde ficou: anular repõe, não duplica.
    expect(screen.getByLabelText("Descrição da linha 2")).toHaveValue("Coordenação do dia");
    // E a oferta desaparece: anulada uma vez, não fica a pedir de novo.
    expect(screen.queryByText(/Pode anular durante/)).toBeNull();
  });
});

describe("os atalhos de modelo — pergunta, e não anular", () => {
  it("a pergunta conta as linhas escritas e o que elas somam", async () => {
    const user = desenhar();
    await escreverLinha(user, 1, "Decoração floral", "2", "150");
    await user.click(screen.getByRole("button", { name: /Adicionar linha/i }));
    await escreverLinha(user, 2, "Coordenação do dia", "1", "400");

    await user.click(screen.getByRole("button", { name: /^Pacote único$/ }));

    const pergunta = screen.getByRole("alertdialog").textContent ?? "";
    // O NÚMERO de linhas que se perdem, e o que elas somam (300 + 400).
    expect(pergunta).toMatch(/2 linhas já escritas/);
    expect(pergunta).toMatch(/700,00/);
    // NOMEIA o atalho que as vai substituir — os três botões estão lado a lado.
    expect(pergunta).toMatch(/Pacote único/);
    // E diz a consequência, em vez de não dizer nada.
    expect(pergunta).toMatch(/não volta atrás/i);
    expect(pergunta).not.toMatch(/certeza/i);

    // A tabela ainda não mexeu: a pergunta é ANTES, não um aviso depois.
    expect(screen.getByLabelText("Descrição da linha 1")).toHaveValue("Decoração floral");
  });

  it("cancelar não perde nada nem escreve nada", async () => {
    const user = desenhar();
    await escreverLinha(user, 1, "Decoração floral", "2", "150");
    await user.click(screen.getByRole("button", { name: /Adicionar linha/i }));
    await escreverLinha(user, 2, "Coordenação do dia", "1", "400");

    await user.click(screen.getByRole("button", { name: /^Pacote único$/ }));
    await user.click(screen.getByRole("button", { name: /^Cancelar$/ }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    // As duas linhas continuam lá, inteiras.
    expect(screen.getByLabelText("Descrição da linha 1")).toHaveValue("Decoração floral");
    expect(screen.getByLabelText("Preço unitário da linha 1")).toHaveValue("150");
    expect(screen.getByLabelText("Descrição da linha 2")).toHaveValue("Coordenação do dia");
    // E não fica uma barra de «Anular» a oferecer o resgate de nada: cancelar
    // não apagou coisa nenhuma.
    expect(screen.queryByText(/Pode anular durante/)).toBeNull();
  });

  it("e confirmar substitui mesmo — o caminho feliz não mudou", async () => {
    const user = desenhar();
    await escreverLinha(user, 1, "Decoração floral", "2", "150");
    await user.click(screen.getByRole("button", { name: /Adicionar linha/i }));
    await escreverLinha(user, 2, "Coordenação do dia", "1", "400");

    await user.click(screen.getByRole("button", { name: /^Pacote único$/ }));
    await user.click(screen.getByRole("button", { name: /^Substituir$/ }));

    expect(screen.getByLabelText("Descrição da linha 1")).toHaveValue(
      "Organização e produção do evento",
    );
    expect(screen.queryByLabelText("Descrição da linha 2")).toBeNull();
  });

  it("com a tabela por escrever, o modelo entra sem pergunta nenhuma", async () => {
    // É como a tabela está quando estes botões servem para o que foram feitos.
    // Uma tarefa que não é destrutiva não pode ser atrasada por uma caixa.
    const user = desenhar();
    // Uma tabela mesmo em branco: sem descrição e a zero. (Limpar o campo do
    // preço não basta — um texto a meio de ser escrito não apaga o número que
    // lá está, de propósito; ver o comentário no campo.)
    await escreverLinha(user, 1, "", "1", "0");

    await user.click(screen.getByRole("button", { name: /^Pacote único$/ }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Descrição da linha 1")).toHaveValue(
      "Organização e produção do evento",
    );
  });
});
