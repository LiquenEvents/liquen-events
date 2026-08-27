// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProposalDoc } from "@/lib/proposal-doc";
import EmailDoEnvio from "./EmailDoEnvio";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O EMAIL À VISTA ANTES DE SEGUIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que estes testes prendem é o pedido dela, por ordem: o texto abre PRONTO
 * («se ninguém quiser alterar esse texto, coloca esse texto para mandar»),
 * quem recebe e quem assina estão à vista, o modelo troca-se num toque sem
 * perder o que se escreveu, e o aviso das variáveis a descoberto — «nada pior
 * do que enviar "Olá ,"» — aparece com os rótulos que o SERVIDOR mandou.
 *
 * E o que nunca pode acontecer: este ecrã não envia nada.
 */

const RASCUNHO = {
  rascunho: {
    chave: "registo-formal",
    nome: "Registo formal",
    assunto: "A vossa proposta — Líquen Events",
    texto: "Olá Maria & Zé,\n\nSegue a proposta: {{link_proposta}}\n\nAté já.",
    origem: "guardado",
    avisos: [],
  },
  porPreencher: [],
  porOmissao: "registo-formal",
  remetente: "Catarina Gaspar",
  destinatario: { nome: "Maria & Zé", email: "casal@exemplo.pt" },
  modelos: [
    { chave: "registo-formal", nome: "Registo formal", temEsteIdioma: true },
    { chave: "conversa-primeira", nome: "Primeira conversa", temEsteIdioma: true },
  ],
};

/** A resposta que o servidor dá por modelo. O teste muda-a antes do clique. */
let resposta: Record<string, unknown> = RASCUNHO;
let estadoHttp = 200;
const pedidos: { url: string; corpo: Record<string, unknown> }[] = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  pedidos.push({ url, corpo: JSON.parse(String(init?.body ?? "{}")) });
  return {
    ok: estadoHttp < 400,
    status: estadoHttp,
    json: async () => resposta,
  } as unknown as Response;
});

const doc = {
  clientNames: "Maria & Zé",
  eventDate: "3 de julho de 2027",
  ref: "PO Teste",
} as unknown as ProposalDoc;

/** O estúdio em miniatura: é ele que guarda o corpo, porque é ele que o envia. */
function Estudio({ mensagem = "", bytes = 2_400_000 }: { mensagem?: string; bytes?: number }) {
  const [corpo, setCorpo] = useState("");
  const [assunto, setAssunto] = useState("");
  const [modelo, setModelo] = useState("");
  /** O nome do ficheiro vive no DOCUMENTO, e o estúdio é quem o guarda — como
   *  no produto. Sem este ciclo completo, o teste do campo provava só que o
   *  `onChange` dispara, e não que o que se escreve chega ao anexo. */
  const [nome, setNome] = useState<string | undefined>(undefined);
  return (
    <>
      <EmailDoEnvio
        quoteId="q1"
        doc={{ ...doc, nomeDoFicheiro: nome }}
        idioma="pt"
        mensagem={mensagem}
        activo
        corpo={corpo}
        onCorpo={setCorpo}
        assunto={assunto}
        onAssunto={setAssunto}
        onModelo={setModelo}
        bytesDoAnexo={bytes}
        bytesMedidos={false}
        onNomeDoFicheiro={(n) => setNome(n.trim() ? n : undefined)}
      />
      {/* O que o estúdio tem na mão para enviar, à vista do teste. */}
      <output data-testid="modelo-do-envio">{modelo}</output>
    </>
  );
}

const caixa = () => screen.getByLabelText("Texto do email") as HTMLTextAreaElement;

beforeEach(() => {
  resposta = RASCUNHO;
  estadoHttp = 200;
  pedidos.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EmailDoEnvio", () => {
  it("abre com o texto dela já resolvido, pronto a sair sem se lhe tocar", async () => {
    render(<Estudio />);
    await waitFor(() => expect(caixa().value).toContain("Olá Maria & Zé,"));
    // Os dados daquele casal estão lá dentro, e o assunto também abre feito.
    expect(caixa().value).toContain("Até já.");
    expect((screen.getByLabelText("Assunto") as HTMLInputElement).value).toBe(
      "A vossa proposta — Líquen Events",
    );
    // O modelo dela é o que abre — e é o que o estúdio leva para a cópia.
    expect(screen.getByTestId("modelo-do-envio")).toHaveTextContent("registo-formal");
  });

  it("mostra quem recebe e quem assina — e quem assina não é um campo", async () => {
    render(<Estudio />);
    await waitFor(() => expect(screen.getByText(/casal@exemplo\.pt/)).toBeTruthy());
    // «Catarina Gaspar» aparece duas vezes — aqui e na nota da pré-visualização
    // que diz que a assinatura da casa entra sozinha. O que interessa é ESTE:
    // o nome ao lado de «Assina», que é quem vai assinar o email.
    expect(screen.getByText("Assina").parentElement).toHaveTextContent("Catarina Gaspar");
    // CONTROLO POSITIVO da ausência: há campos editáveis neste ecrã (o assunto
    // e o texto), portanto «não há campo para quem assina» diz alguma coisa.
    expect(screen.getByLabelText("Assunto")).toBeTruthy();
    expect(screen.queryByLabelText(/assina/i)).toBeNull();
    expect(screen.queryByDisplayValue("Catarina Gaspar")).toBeNull();
  });

  it("confirma o anexo: o nome do ficheiro e o tamanho", async () => {
    render(<Estudio />);
    await waitFor(() => expect(caixa().value).toContain("Olá"));
    // O nome sai da mesma função que nomeia o anexo no servidor.
    expect(screen.getByText("Anexo").parentElement).toHaveTextContent(
      "Proposta-Liquen-Events-Maria-e-Ze-03-07-2027.pdf",
    );
    expect(screen.getByText(/2,3 MB \(estimado\)/)).toBeTruthy();
  });

  it("troca de modelo num toque, e o texto novo entra na caixa", async () => {
    render(<Estudio />);
    await waitFor(() => expect(caixa().value).toContain("Olá Maria & Zé,"));

    resposta = {
      ...RASCUNHO,
      rascunho: {
        ...RASCUNHO.rascunho,
        chave: "conversa-primeira",
        nome: "Primeira conversa",
        assunto: "Depois da nossa conversa",
        texto: "Olá Maria & Zé,\n\nFoi um gosto falar convosco.",
      },
    };
    await userEvent.selectOptions(screen.getByLabelText("Modelo"), "conversa-primeira");
    await waitFor(() => expect(caixa().value).toContain("Foi um gosto falar convosco."));
    expect(pedidos.at(-1)!.corpo.modelo).toBe("conversa-primeira");
    expect(screen.getByTestId("modelo-do-envio")).toHaveTextContent("conversa-primeira");
  });

  /**
   * Trocar de modelo com texto escrito à mão não pode ser um caminho sem volta
   * — é meia hora de trabalho a desaparecer num toque.
   */
  it("o texto escrito à mão volta com um clique depois de uma troca de modelo", async () => {
    render(<Estudio />);
    await waitFor(() => expect(caixa().value).toContain("Olá Maria & Zé,"));
    await userEvent.clear(caixa());
    await userEvent.type(caixa(), "Escrevi isto à mão.");

    resposta = {
      ...RASCUNHO,
      rascunho: { ...RASCUNHO.rascunho, chave: "conversa-primeira", texto: "Outro texto." },
    };
    await userEvent.selectOptions(screen.getByLabelText("Modelo"), "conversa-primeira");
    await waitFor(() => expect(caixa().value).toBe("Outro texto."));

    await userEvent.click(screen.getByRole("button", { name: /Repor o meu texto/ }));
    expect(caixa().value).toBe("Escrevi isto à mão.");
  });

  /**
   * ── «NADA PIOR DO QUE ENVIAR "OLÁ ,"» ──────────────────────────────────
   *
   * A lista vem PRONTA do servidor — é ele que sabe distinguir a variável que
   * ficou à vista da que o `{{#se}}` do modelo dela já cobriu. O ecrã mostra os
   * rótulos e mais nada.
   */
  it("avisa com os rótulos que o servidor mandou", async () => {
    resposta = {
      ...RASCUNHO,
      porPreencher: [
        { chave: "evento_data", rotulo: "Data" },
        { chave: "evento_local", rotulo: "Local" },
      ],
    };
    render(<Estudio />);
    await waitFor(() => expect(screen.getByText(/Ficou por preencher/)).toBeTruthy());
    expect(screen.getByText("Data, Local")).toBeTruthy();
  });

  /** CONTROLO POSITIVO do teste acima: sem nada a descoberto, nenhum aviso. */
  it("sem variáveis a descoberto não há aviso nenhum", async () => {
    render(<Estudio />);
    await waitFor(() => expect(caixa().value).toContain("Olá"));
    expect(screen.queryByText(/Ficou por preencher/)).toBeNull();
  });

  /**
   * Um modelo que não existe (ou sem versão inglesa) devolve 409. O ecrã diz a
   * frase e continua a servir — nada disto travou envio nenhum, porque nada
   * disto enviou coisa nenhuma.
   */
  it("um modelo em falta não deixa o ecrã em branco", async () => {
    estadoHttp = 409;
    resposta = { error: "Não há nenhum modelo «registo-formal».", modeloEmFalta: "registo-formal" };
    render(<Estudio />);
    await waitFor(() => expect(screen.getByText(/Não há nenhum modelo/)).toBeTruthy());
    expect(screen.getByLabelText("Texto do email")).toBeTruthy();
  });

  /**
   * ── ESTE ECRÃ NÃO ENVIA NADA ───────────────────────────────────────────
   *
   * Preparar o email é uma leitura. O envio é o botão do estúdio, com a
   * confirmação à frente. O controlo positivo é a primeira linha: o ecrã fala
   * MESMO com o servidor, portanto «nunca chamou a rota do envio» não passa
   * por um componente que não faz rede nenhuma.
   */
  it("nunca chama a rota do envio", async () => {
    render(<Estudio />);
    await waitFor(() => expect(caixa().value).toContain("Olá"));
    expect(pedidos.every((p) => p.url.includes("/email-rascunho"))).toBe(true);
    expect(pedidos.some((p) => p.url.includes("/proposta-doc"))).toBe(false);
    expect(pedidos.length).toBeGreaterThan(0);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O NOME DO FICHEIRO, ESCRITO POR ELA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «gostava de poder editar o nome do pdf que vai ser gerado».
 *
 * O campo fica um dedo abaixo da linha que MOSTRA o nome, e o que se escreve
 * aparece ali enquanto se escreve — a limpeza (letras, números e hífenes) nunca
 * pode ser uma surpresa descoberta na caixa de correio do cliente.
 */
describe("o nome do anexo", () => {
  const campo = () => screen.getByLabelText("Nome do ficheiro") as HTMLInputElement;
  const linhaDoAnexo = () => screen.getByText(/\.pdf/).textContent ?? "";

  it("por omissão, é o composto — a casa, o casal e a data", async () => {
    render(<Estudio />);
    await screen.findByLabelText("Texto do email");
    expect(linhaDoAnexo()).toContain("Proposta-Liquen-Events-Maria-e-Ze-03-07-2027.pdf");
    // E a caixa está vazia, com o composto como sugestão: quem não quer mexer
    // não vê um campo já preenchido a pedir-lhe uma decisão.
    expect(campo().value).toBe("");
    expect(campo().placeholder).toContain("Proposta-Liquen-Events");
  });

  it("o que se escreve passa a ser o nome do anexo", async () => {
    render(<Estudio />);
    await screen.findByLabelText("Texto do email");
    fireEvent.change(campo(), { target: { value: "Proposta Torre de Palma" } });
    expect(linhaDoAnexo()).toContain("Proposta-Torre-de-Palma.pdf");
  });

  it("e a limpeza vê-se acontecer, em vez de aparecer na caixa de correio", async () => {
    render(<Estudio />);
    await screen.findByLabelText("Texto do email");
    fireEvent.change(campo(), { target: { value: "Proposta Ana & José" } });
    expect(linhaDoAnexo()).toContain("Proposta-Ana-e-Jose.pdf");
    // O que ela escreveu fica como ela o escreveu — é o nome DELA; o que muda
    // é o ficheiro que sai.
    expect(campo().value).toBe("Proposta Ana & José");
  });

  it("«Automático» devolve o nome composto", async () => {
    render(<Estudio />);
    await screen.findByLabelText("Texto do email");
    fireEvent.change(campo(), { target: { value: "Outro nome" } });
    expect(linhaDoAnexo()).toContain("Outro-nome.pdf");
    fireEvent.click(screen.getByRole("button", { name: /Automático/ }));
    expect(campo().value).toBe("");
    expect(linhaDoAnexo()).toContain("Proposta-Liquen-Events-Maria-e-Ze-03-07-2027.pdf");
  });

  it("e o botão só aparece quando há alguma coisa para desfazer", async () => {
    render(<Estudio />);
    await screen.findByLabelText("Texto do email");
    expect(screen.queryByRole("button", { name: /Automático/ })).toBeNull();
  });
});
