// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  chaveDoRascunho,
  esquecerRascunho,
  fraseDoQueMudou,
  guardarRascunho,
  haQuantoTempo,
  lerRascunho,
  oQueMudou,
  type CamposDoPedido,
} from "./rascunho-do-pedido";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A REDE DE SEGURANÇA DO PAINEL DE UM PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que se prende aqui é o contrato de uma rede de segurança: não pode partir
 * a coisa que protege, não pode devolver lixo, e tem de saber dizer o que
 * mudou — porque um resgate que não diz o que vai repor é uma aposta.
 */

const CHEIO: CamposDoPedido = {
  preco: "4.206,60",
  notas: "Falar com a quinta sobre a hora de montagem",
  estado: "pendente",
  responsavel: "Catarina",
  motivoDePerda: "",
  data: "2027-09-27",
  convidados: "80",
  local: "Torre de Palma",
  nome: "Melanie e Sebastien",
  email: "melanie@exemplo.pt",
  telefone: "912345678",
};

beforeEach(() => localStorage.clear());

describe("guardar e ler", () => {
  it("o que se guarda é o que se lê", () => {
    guardarRascunho("LQ-1", CHEIO, "2026-08-21T18:00:00.000Z");
    expect(lerRascunho("LQ-1")).toEqual({
      id: "LQ-1",
      em: "2026-08-21T18:00:00.000Z",
      campos: CHEIO,
    });
  });

  it("sem nada guardado, não há rascunho", () => {
    expect(lerRascunho("LQ-1")).toBeNull();
  });

  it("o rascunho de um pedido não serve a outro", () => {
    guardarRascunho("LQ-1", CHEIO, "2026-08-21T18:00:00.000Z");
    expect(lerRascunho("LQ-2")).toBeNull();
  });

  it("esquecer esquece mesmo", () => {
    guardarRascunho("LQ-1", CHEIO, "2026-08-21T18:00:00.000Z");
    esquecerRascunho("LQ-1");
    expect(lerRascunho("LQ-1")).toBeNull();
  });

  /**
   * DESCONFIAR DO QUE ESTÁ GUARDADO.
   *
   * O `localStorage` é escrito por versões antigas do programa e por outras
   * abas. Um rascunho a que falte um campo repunha `undefined` por cima de um
   * preço — vale mais não oferecer resgate nenhum.
   */
  it.each([
    ["lixo que não é JSON", "isto não é json"],
    ["um id de outro pedido", JSON.stringify({ id: "LQ-9", em: "x", campos: CHEIO })],
    ["sem carimbo de hora", JSON.stringify({ id: "LQ-1", campos: CHEIO })],
    [
      "um campo em falta",
      JSON.stringify({ id: "LQ-1", em: "2026-08-21T18:00:00.000Z", campos: { preco: "10" } }),
    ],
    [
      "um campo que não é texto",
      JSON.stringify({
        id: "LQ-1",
        em: "2026-08-21T18:00:00.000Z",
        campos: { ...CHEIO, convidados: 80 },
      }),
    ],
  ])("deita fora %s", (_nome, cru) => {
    localStorage.setItem(chaveDoRascunho("LQ-1"), cru);
    expect(lerRascunho("LQ-1")).toBeNull();
  });

  it("um localStorage que recusa escrever não parte a edição", () => {
    const original = localStorage.setItem;
    // Uma janela privada, ou o disco cheio: a rede de segurança falha, e é só
    // isso que falha.
    localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => guardarRascunho("LQ-1", CHEIO, "2026-08-21T18:00:00.000Z")).not.toThrow();
    localStorage.setItem = original;
  });
});

describe("o que mudou", () => {
  it("iguais é nada", () => {
    expect(oQueMudou(CHEIO, CHEIO)).toEqual([]);
  });

  it("um espaço a mais não é uma alteração", () => {
    // Senão a barra de resgate aparecia por causa de um `trim` do servidor.
    expect(oQueMudou({ ...CHEIO, nome: "  Melanie e Sebastien " }, CHEIO)).toEqual([]);
  });

  it("nomeia os campos diferentes", () => {
    const mudou = oQueMudou({ ...CHEIO, preco: "5.000,00", data: "2027-10-02" }, CHEIO);
    expect(mudou).toEqual(["preco", "data"]);
  });
});

describe("a frase", () => {
  it("um campo diz o campo", () => {
    expect(fraseDoQueMudou(["preco"])).toBe("o preço");
  });
  it("dois campos ligam-se com «e»", () => {
    expect(fraseDoQueMudou(["preco", "data"])).toBe("o preço e a data");
  });
  it("muitos campos não viram uma parede de texto", () => {
    expect(fraseDoQueMudou(["preco", "data", "local", "nome"])).toBe("o preço, a data e mais 2");
  });
  it("nenhum campo não diz nada", () => {
    expect(fraseDoQueMudou([])).toBe("");
  });
});

describe("há quanto tempo", () => {
  const agora = new Date("2026-08-21T18:00:00.000Z");
  const menos = (min: number) => new Date(agora.getTime() - min * 60000).toISOString();

  it.each([
    [0, "agora mesmo"],
    [1, "há 1 minuto"],
    [12, "há 12 minutos"],
    [60, "há 1 hora"],
    [180, "há 3 horas"],
    [60 * 24, "há 1 dia"],
    [60 * 24 * 3, "há 3 dias"],
  ])("%i minutos atrás lê-se «%s»", (min, esperado) => {
    expect(haQuantoTempo(menos(min), agora)).toBe(esperado);
  });

  it("uma data estragada não inventa um tempo", () => {
    expect(haQuantoTempo("não é uma data", agora)).toBe("");
  });
});
