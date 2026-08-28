import { describe, it, expect } from "vitest";
import { respostaPdf } from "./pdf-resposta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF DA PROPOSTA DESCARREGA — E OS DOIS CAMINHOS FAZEM O MESMO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela sobre o botão do PDF no email: «isto não funciona. quero que vá
 * direto ao pdf da proposta ultra rápido. que se faça download.»
 *
 * A rota do PDF tem dois caminhos, e faziam coisas diferentes:
 *
 *   · ficheiro JÁ guardado → reencaminha para o endereço assinado do
 *     armazenamento, criado com `download: nome` — descarrega.
 *   · ficheiro por desenhar → desenha e responde por aqui — e aqui estava
 *     `inline`, ou seja abria dentro do visualizador do browser.
 *
 * O mesmo botão tinha dois comportamentos conforme o ficheiro já lá estivesse
 * ou não. E o caminho `inline` é justamente o que apanha o pior momento: a
 * primeira abertura, ou a primeira depois de uma revisão. Num iPhone com 4G
 * fraco, um PDF de megabytes a abrir no visualizador é um ecrã branco a
 * encher-se aos poucos, sem nada que diga que está a trabalhar.
 */

const pedido = () => new Request("https://liquen.test/api/proposta/x/pdf");
const bytes = () => Buffer.from("%PDF-1.4 fingido") as Buffer<ArrayBuffer>;

describe("a resposta do PDF", () => {
  it("descarrega quando quem chama o pede, com o nome com que seguiu no email", () => {
    const r = respostaPdf(pedido(), bytes(), {
      nome: "Proposta-Liquen-Events-Melanie-e-Sebastien.pdf",
      descarregar: true,
    });
    expect(r.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Proposta-Liquen-Events-Melanie-e-Sebastien.pdf"',
    );
  });

  /**
   * O contrato usa a MESMA função e abre-se para ler, não para arquivar. Se
   * alguém trocar a omissão, isto cai — e é essa a razão de existir.
   */
  it("continua a abrir no visualizador quando ninguém pede para descarregar", () => {
    const r = respostaPdf(pedido(), bytes(), { nome: "Contrato.pdf" });
    expect(r.headers.get("Content-Disposition")).toBe('inline; filename="Contrato.pdf"');
  });

  /** Um 304 tem de trazer os mesmos cabeçalhos, senão o browser fica sem saber. */
  it("mantém a decisão num 304", () => {
    const primeira = respostaPdf(pedido(), bytes(), { nome: "P.pdf", descarregar: true });
    const etag = primeira.headers.get("ETag")!;
    const segunda = respostaPdf(
      new Request("https://liquen.test/api/proposta/x/pdf", {
        headers: { "if-none-match": etag },
      }),
      bytes(),
      { nome: "P.pdf", descarregar: true },
    );
    expect(segunda.status).toBe(304);
    expect(segunda.headers.get("Content-Disposition")).toBe('attachment; filename="P.pdf"');
  });
});
