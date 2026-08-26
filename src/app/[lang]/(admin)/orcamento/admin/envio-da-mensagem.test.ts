import { describe, it, expect } from "vitest";
import { resumoDoEnvio } from "./envio-da-mensagem";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O HISTÓRICO NÃO PODE JURAR UM ENVIO QUE NÃO ACONTECEU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um pedido que entrou por telefonema não tem email. A rota grava a mensagem à
 * mesma e responde que o email não saiu. O aviso vermelho do mensageiro dura o
 * tempo do ecrã aberto; esta linha dura para sempre — e é ela que se lê meses
 * depois para saber o que se disse a quem.
 *
 * A frase é escrita a partir daqui pelos DOIS sítios que a guardam (a zona de
 * comunicações do dossiê e a gaveta do pedido). Escrita à mão em cada um, já
 * divergiu uma vez.
 */
describe("a frase que fica no histórico", () => {
  it("diz «enviada» quando o email saiu", () => {
    expect(resumoDoEnvio({ emailed: true })).toBe("Mensagem enviada ao cliente");
  });

  it("diz que NÃO saiu quando não saiu — e di-lo sem rodeios", () => {
    const frase = resumoDoEnvio({ emailed: false, emailError: "Este pedido não tem email." });
    expect(frase).toBe("Mensagem registada — o e-mail não saiu, o cliente não recebeu");
    // O que se lê tem de conter as duas metades: ficou registada, e ele não a
    // recebeu. Uma sem a outra manda a pessoa para a conclusão errada.
    expect(frase).toMatch(/registada/i);
    expect(frase).toMatch(/não recebeu/i);
  });

  it("a razão do servidor não entra na linha do histórico", () => {
    // É uma frase de duas linhas com instruções para AGORA («acrescenta o email
    // do cliente para lhe poderes escrever daqui»). O histórico quer o facto,
    // curto e legível numa lista de trinta linhas.
    expect(
      resumoDoEnvio({ emailed: false, emailError: "Acrescenta o email do cliente." }),
    ).not.toMatch(/Acrescenta/);
  });

  it("sem informação nenhuma, assume que saiu", () => {
    // É o que estes ecrãs sempre fizeram até haver forma de saber. Afirmar uma
    // falha que não se mediu é a mesma espécie de mentira, virada ao contrário.
    expect(resumoDoEnvio(undefined)).toBe("Mensagem enviada ao cliente");
  });
});
