// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import BibliotecaServicos, { type ServicoDaBiblioteca } from "./BibliotecaServicos";

/**
 * A biblioteca serve para o mesmo serviço não sair escrito de maneira diferente
 * conforme o dia. Estes testes prendem o que a torna usável: encontrar, ver o
 * que se escolhe, e não esconder o que está incompleto.
 */

const servico = (over: Partial<ServicoDaBiblioteca>): ServicoDaBiblioteca => ({
  id: "s1",
  nome: "Arranjos de mesa",
  descricao: "Arranjos baixos em tons de branco e verde.",
  nomeEn: "Table arrangements",
  descricaoEn: "Low arrangements in white and green.",
  categoria: "Flores",
  ...over,
});

function montar(servicos: ServicoDaBiblioteca[] | { erro: string }) {
  const onEscolher = vi.fn();
  const onFechar = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      "erro" in servicos
        ? { ok: false, status: 503, json: async () => ({ error: servicos.erro }) }
        : { ok: true, status: 200, json: async () => servicos },
    ),
  );
  render(
    <ToastProvider>
      <BibliotecaServicos onEscolher={onEscolher} onFechar={onFechar} />
    </ToastProvider>,
  );
  return { onEscolher, onFechar };
}

beforeEach(() => cleanup());
afterEach(() => vi.unstubAllGlobals());

describe("escolher", () => {
  it("mostra o nome e a descrição, agrupados por categoria", async () => {
    montar([
      servico({ id: "a", nome: "Arco floral", categoria: "Flores" }),
      servico({ id: "b", nome: "Coordenação do dia", categoria: "Coordenação" }),
    ]);
    await waitFor(() => expect(screen.getByText("Arco floral")).toBeTruthy());
    expect(screen.getByText("Flores")).toBeTruthy();
    expect(screen.getByText("Coordenação")).toBeTruthy();
  });

  it("devolve o serviço escolhido ao editor", async () => {
    const { onEscolher } = montar([servico({})]);
    await waitFor(() => expect(screen.getByText("Arranjos de mesa")).toBeTruthy());
    await userEvent.click(screen.getByText("Arranjos de mesa"));
    expect(onEscolher).toHaveBeenCalledWith(expect.objectContaining({ nome: "Arranjos de mesa" }));
  });

  it("filtra pelo que se escreve", async () => {
    montar([
      servico({ id: "a", nome: "Arco floral" }),
      servico({ id: "b", nome: "Coordenação do dia" }),
    ]);
    await waitFor(() => expect(screen.getByText("Arco floral")).toBeTruthy());
    await userEvent.type(screen.getByLabelText(/Procurar na biblioteca/), "coord");
    expect(screen.queryByText("Arco floral")).toBeNull();
    expect(screen.getByText("Coordenação do dia")).toBeTruthy();
  });

  it("não oferece o que está arquivado", async () => {
    // Arquivado continua nas propostas antigas e sai do seletor — é para isso
    // que arquivar existe.
    montar([servico({ id: "a", nome: "Serviço antigo", arquivado: true })]);
    await waitFor(() => expect(screen.getByText(/biblioteca ainda está vazia/)).toBeTruthy());
  });
});

describe("o que está incompleto diz que está", () => {
  it("assinala um serviço sem versão inglesa", async () => {
    // Uma proposta em inglês com metade dos serviços em português lê-se como
    // descuido, e este é o momento em que dá para o evitar.
    montar([servico({ nomeEn: "", descricaoEn: "" })]);
    await waitFor(() => expect(screen.getByText("sem versão inglesa")).toBeTruthy());
  });

  it("um serviço completo não leva aviso nenhum", async () => {
    montar([servico({})]);
    await waitFor(() => expect(screen.getByText("Arranjos de mesa")).toBeTruthy());
    expect(screen.queryByText("sem versão inglesa")).toBeNull();
  });
});

describe("quando corre mal", () => {
  it("mostra o que o servidor disse, em vez de uma lista vazia", async () => {
    // Uma lista vazia leria como "a biblioteca está vazia" — e a diferença
    // entre isso e "a tabela não existe" é a diferença entre encolher os
    // ombros e ir correr o schema.sql.
    montar({ erro: "A biblioteca de serviços ainda não tem tabela na base de dados." });
    await waitFor(() => expect(screen.getByText(/ainda não tem tabela/)).toBeTruthy());
  });

  it("com a biblioteca vazia, diz o que fazer a seguir", async () => {
    montar([]);
    await waitFor(() => expect(screen.getByText(/Escreva os serviços à mão/)).toBeTruthy());
  });
});
