// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import EmailDoEnvio from "./EmailDoEnvio";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DO EMAIL A 390 px
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este é dos ecrãs mais importantes do back office e usa-se no telemóvel — é lá
 * que ela está, entre dois eventos, quando decide mandar a proposta. Um painel
 * que só caiba no portátil é um painel que a obriga a esperar pela noite.
 *
 * O que se prende aqui é o que o jsdom pode mesmo garantir: tudo alcançável num
 * ecrã estreito, nada com largura fixa maior do que ele, e as duas coisas que
 * num telemóvel partem sempre a linha — o endereço de quem recebe e o nome
 * comprido do PDF em anexo — com quebra permitida em vez de empurrarem a
 * página para o lado.
 */

const RASCUNHO = {
  rascunho: {
    chave: "registo-formal",
    nome: "Registo formal",
    assunto: "A vossa proposta — Líquen Events",
    texto: "Olá Maria & Zé,\n\nSegue a proposta: {{link_proposta}}",
    origem: "guardado",
    avisos: [],
  },
  porPreencher: [{ chave: "evento_data", rotulo: "Data" }],
  porOmissao: "registo-formal",
  remetente: "Catarina Gaspar",
  destinatario: {
    nome: "Maria Madalena & José Alberto",
    email: "mariamadalena.josealberto@umdominiobastantecomprido.pt",
  },
  modelos: [
    { chave: "registo-formal", nome: "Registo formal", temEsteIdioma: true },
    { chave: "conversa-primeira", nome: "Primeira conversa", temEsteIdioma: true },
  ],
};

const fetchMock = vi.fn(
  async () => ({ ok: true, status: 200, json: async () => RASCUNHO }) as unknown as Response,
);

const doc = {
  clientNames: "Maria Madalena & José Alberto",
  eventDate: "3 de julho de 2027",
  ref: "PO Teste",
} as unknown as ProposalDoc;

function Estudio() {
  const [corpo, setCorpo] = useState("");
  const [assunto, setAssunto] = useState("");
  return (
    <EmailDoEnvio
      quoteId="q1"
      doc={doc}
      idioma="pt"
      mensagem=""
      activo
      corpo={corpo}
      onCorpo={setCorpo}
      assunto={assunto}
      onAssunto={setAssunto}
      onModelo={() => {}}
      bytesDoAnexo={2_400_000}
      bytesMedidos
    />
  );
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  // 390×844 — o telemóvel de referência da casa.
  window.innerWidth = 390;
  window.innerHeight = 844;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const montar = async () => {
  const r = render(<Estudio />);
  await waitFor(() =>
    expect((screen.getByLabelText("Texto do email") as HTMLTextAreaElement).value).toContain("Olá"),
  );
  return r;
};

describe("o ecrã do email cabe num telemóvel de 390 px", () => {
  it("nada tem largura fixa maior do que o ecrã", async () => {
    const { container } = await montar();
    const tudo = Array.from(container.querySelectorAll<HTMLElement>("*"));
    // CONTROLO POSITIVO: uma afirmação de ausência sobre uma lista vazia é
    // verdadeira e não diz nada. O painel está mesmo desenhado.
    expect(tudo.length).toBeGreaterThan(20);
    for (const el of tudo) {
      const largura = el.style.width || el.style.minWidth;
      const px = /^(\d+)px$/.exec(largura ?? "");
      if (px) expect(Number(px[1])).toBeLessThanOrEqual(390);
    }
  });

  /**
   * A grelha de «Para» e «Assina» só se divide em duas colunas a partir de
   * `sm`. A 390 px empilha — em duas colunas, um endereço de email fica com
   * 180 px para caber e sai do ecrã.
   */
  it("quem recebe e quem assina empilham, e só se dividem nos ecrãs maiores", async () => {
    await montar();
    const grelha = screen.getByText("Para").closest("dl")!;
    expect(grelha.className).toContain("grid-cols-1");
    expect(grelha.className).toContain("sm:grid-cols-2");
  });

  /**
   * As duas cadeias que não têm espaços por onde partir: o endereço do casal e
   * o nome do PDF. Sem quebra permitida, é a PÁGINA que passa a andar para o
   * lado — e a barra do «Enviar», que está encostada ao fundo, vai com ela.
   */
  it("o endereço e o nome do anexo podem partir a linha", async () => {
    await montar();
    const email = screen.getByText(/umdominiobastantecomprido/);
    expect(email.className).toMatch(/break-(words|all)/);
    const anexo = screen.getByText(/\.pdf/);
    expect(anexo.className).toMatch(/break-(words|all)/);
  });

  it("tudo o que decide o envio continua alcançável", async () => {
    await montar();
    expect(screen.getByLabelText("Modelo")).toBeTruthy();
    expect(screen.getByLabelText("Assunto")).toBeTruthy();
    expect(screen.getByLabelText("Texto do email")).toBeTruthy();
    expect(screen.getByText("Para")).toBeTruthy();
    expect(screen.getByText("Assina")).toBeTruthy();
    expect(screen.getByText("Anexo")).toBeTruthy();
    // O aviso das variáveis a descoberto não é uma coisa que se esconda para
    // caber: é o que impede o «Olá ,».
    expect(screen.getByText(/Ficou por preencher/)).toBeTruthy();
    expect(screen.getByText(/Ver como o cliente o recebe/)).toBeTruthy();
  });

  /**
   * A caixa do texto é o controlo mais alto do painel. Num telemóvel, uma
   * altura fixa em linhas com `resize` bloqueado deixava-a a ler o email por
   * uma frincha; `resize-y` devolve-lhe o controlo.
   */
  it("a caixa do texto cresce e não obriga a rolar por dentro para ler tudo", async () => {
    await montar();
    const caixa = screen.getByLabelText("Texto do email");
    expect(caixa.className).toContain("resize-y");
    expect(caixa.className).toContain("w-full");
  });
});
