// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { relatarErro } from "./relatar-erro";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONTAR UM ERRO SEM CONTAR O QUE ESTAVA NO ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas, e a segunda é a que mais importa.
 *
 * O erro tem de CHEGAR: um erro que deita a página abaixo costuma ser seguido
 * de um recarregamento, e um `fetch` normal morre com a página. Por isso o
 * `sendBeacon`, que o browser entrega depois de a página se ir embora.
 *
 * E NÃO PODE LEVAR MAIS NADA. Um formulário de proposta a meio tem lá dentro o
 * nome e o email de um casal; isso não pode viajar por causa de um erro de
 * desenho.
 */

let enviados: string[] = [];
let beaconAceita = true;

beforeEach(() => {
  enviados = [];
  beaconAceita = true;
  vi.stubGlobal("navigator", {
    userAgent: "iPhone",
    sendBeacon: (_url: string, corpo: Blob) => {
      if (!beaconAceita) return false;
      // O `Blob` do jsdom não dá o texto de forma síncrona; guarda-se o que se
      // consegue e lê-se pelo `fetch` no outro caminho.
      enviados.push((corpo as unknown as { __texto?: string }).__texto ?? "beacon");
      return true;
    },
  });
  vi.stubGlobal(
    "Blob",
    class {
      __texto: string;
      constructor(partes: string[]) {
        this.__texto = partes.join("");
      }
    },
  );
  /**
   * Um endereço COM query, e é isso que faz a regra do `pathname` valer.
   *
   * Sem isto, o `location` do ambiente de teste não tem query nenhuma e
   * «não contém `?`» era verdade tanto para o `pathname` como para o `href` —
   * um teste que passava com o defeito reposto. Apanhado pela verificação ao
   * contrário, que é para isso que ela serve.
   */
  vi.stubGlobal("location", {
    pathname: "/orcamento/admin",
    href: "https://liquen.test/orcamento/admin?token=SEGREDO&pedido=LIQ-1",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: { body?: string }) => {
      enviados.push(init?.body ?? "");
      return { ok: true } as Response;
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("o relato de um erro", () => {
  it("vai pelo `sendBeacon`, que sobrevive a um recarregamento", () => {
    relatarErro(new Error("rebentou"));
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toContain("rebentou");
  });

  it("cai no `fetch` quando o beacon recusa", () => {
    // O beacon tem um tecto de bytes por origem e devolve `false` quando o
    // ultrapassa. Aí o relato não se pode perder em silêncio.
    beaconAceita = false;
    relatarErro(new Error("rebentou"));
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toContain("rebentou");
  });

  it("leva a mensagem, o rasto e a marca — e o caminho SEM a query", () => {
    const erro = Object.assign(new Error("falhou"), { stack: "at Estudio (x.js:1)" });
    relatarErro(erro, "a1b2c3");
    const corpo = JSON.parse(enviados[0]);
    expect(corpo.mensagem).toBe("falhou");
    expect(corpo.rasto).toContain("Estudio");
    expect(corpo.marca).toBe("a1b2c3");
    // `location.pathname`, e não `href`: um `?token=…` não tem que viajar.
    expect(corpo.onde).toBe("/orcamento/admin");
    expect(String(corpo.onde ?? ""), "o relato levou a query atrás").not.toContain("?");
    expect(enviados[0], "um token viajou dentro do relato").not.toContain("SEGREDO");
  });

  it("NÃO leva mais nada — só os campos previstos", () => {
    /**
     * A regra que protege os dados do casal. Se alguém acrescentar aqui um
     * «estado da página» para ajudar a depurar, este teste cai — e é para cair.
     */
    relatarErro(new Error("falhou"), "m1");
    const corpo = JSON.parse(enviados[0]) as Record<string, unknown>;
    expect(Object.keys(corpo).sort()).toEqual(["aparelho", "marca", "mensagem", "onde", "rasto"]);
  });

  it("corta a mensagem e o rasto antes de os mandar", () => {
    relatarErro(Object.assign(new Error("m".repeat(1000)), { stack: "r".repeat(9000) }));
    const corpo = JSON.parse(enviados[0]);
    expect(corpo.mensagem.length).toBe(300);
    expect(corpo.rasto.length).toBe(2000);
  });

  it("NUNCA lança — é chamado de dentro de um ecrã que já está a tratar de um erro", () => {
    /**
     * Um erro aqui seria o segundo, em cima do primeiro, e sem ninguém para o
     * apanhar. Por isso o corpo inteiro está dentro de um `try`.
     */
    vi.stubGlobal("navigator", {
      get userAgent(): string {
        throw new Error("até isto pode rebentar");
      },
    });
    expect(() => relatarErro(new Error("x"))).not.toThrow();
  });

  it("um erro que não é um `Error` também se conta", () => {
    relatarErro("caiu tudo");
    expect(JSON.parse(enviados[0]).mensagem).toContain("caiu tudo");
  });
});
