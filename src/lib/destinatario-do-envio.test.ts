import { describe, it, expect } from "vitest";
import { destinatarioDoEnvio, eEnderecoDaCasa } from "./destinatario-do-envio";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARA QUEM É QUE ESTA PROPOSTA VAI, AFINAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «a proposta para "Melanie e Sebastien" ia para
 * franciscomariagaspar6@gmail.com. Nada avisa que o destinatário não é o
 * cliente. Um aviso discreto evita que um teste escape para envio real.»
 *
 * Duas metades. A primeira é que o endereço APAREÇA — é o que resolve o caso
 * dela, e prende-se no ecrã. A segunda é esta: que o único aviso a sério seja
 * o que se sabe com certeza, e que os endereços legítimos passem calados.
 */

describe("um endereço da casa", () => {
  it.each([
    "liquen.alentejo@gmail.com",
    "LIQUEN.ALENTEJO@GMAIL.COM",
    "liquenalentejo@gmail.com",
    "geral@liquenevents.pt",
    "catarina@liquenevents.com",
  ])("%s é nosso", (email) => {
    expect(eEnderecoDaCasa(email)).toBe(true);
  });

  it.each([
    "melanie@exemplo.pt",
    "geral@quinta.pt",
    "franciscomariagaspar6@gmail.com",
    "liquidacoes@empresa.pt",
  ])("%s não é", (email) => {
    expect(eEnderecoDaCasa(email)).toBe(false);
  });
});

describe("o que dizer sobre o destinatário", () => {
  it("um email de cliente passa calado — só o endereço", () => {
    // Um aviso que dispara em endereços legítimos ensina-se a ignorar, e o
    // próximo — o que interessa — ignora-se com ele. A maioria dos endereços
    // de casamento não tem o nome de ninguém lá dentro.
    const d = destinatarioDoEnvio("geral@quinta.pt");
    expect(d.endereco).toBe("geral@quinta.pt");
    expect(d.valido).toBe(true);
    expect(d.aviso).toBeNull();
  });

  it("um endereço da casa avisa que a proposta ia para nós", () => {
    const d = destinatarioDoEnvio("liquen.alentejo@gmail.com");
    expect(d.valido).toBe(true);
    expect(d.aviso).toContain("endereço da casa");
  });

  it("sem email, diz o que vai acontecer em vez de ficar calado", () => {
    // «Guardada mas não enviada» é o desfecho, e tem de se saber ANTES.
    const d = destinatarioDoEnvio("");
    expect(d.valido).toBe(false);
    expect(d.aviso).toContain("não sai");
  });

  it("um email estragado cita-o, para se ver o que está lá escrito", () => {
    const d = destinatarioDoEnvio("melanie@");
    expect(d.valido).toBe(false);
    expect(d.aviso).toContain("«melanie@»");
  });

  it("os espaços à volta não fazem um email diferente", () => {
    expect(destinatarioDoEnvio("  melanie@exemplo.pt ").endereco).toBe("melanie@exemplo.pt");
  });

  it("e um email nulo é o mesmo que não haver email", () => {
    expect(destinatarioDoEnvio(null).valido).toBe(false);
    expect(destinatarioDoEnvio(undefined).valido).toBe(false);
  });
});
