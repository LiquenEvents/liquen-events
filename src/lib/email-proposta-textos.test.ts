import { describe, it, expect } from "vitest";
import { textosDoEmailDaProposta } from "./email-proposta-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE LEVA A PROPOSTA FALA A LÍNGUA DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas exigências, e são as duas que este ficheiro guarda:
 *
 *  1. O PORTUGUÊS NÃO MUDA UMA VÍRGULA. Estas frases são as que saem desde
 *     sempre no email da proposta; foram tiradas da rota para aqui sem lhes
 *     tocar. Um casal português tem de receber, palavra por palavra, o email
 *     que receberia antes desta funcionalidade existir.
 *  2. O INGLÊS É INGLÊS ATÉ AO FIM. Não é meio traduzido: o assunto, o título,
 *     o cumprimento, a frase, o botão e o nome do ficheiro em anexo. Um único
 *     «Olá» ou «Ver» que sobrasse era a marca de duas mãos no mesmo email, que
 *     é precisamente o que se está a corrigir.
 */
describe("textosDoEmailDaProposta", () => {
  const pt = textosDoEmailDaProposta("pt");
  const en = textosDoEmailDaProposta("en");

  it("o português é EXACTAMENTE o que a rota mandava antes", () => {
    expect(pt.assunto).toBe("Proposta para o seu evento — Líquen Events");
    expect(pt.titulo).toBe("A sua proposta — Líquen Events");
    expect(pt.ola).toBe("Olá");
    expect(pt.intro).toBe(
      "Segue em anexo a proposta personalizada para o seu evento. Pode vê-la e responder online através do botão abaixo.",
    );
    expect(pt.introEmTexto).toBe("Segue em anexo a proposta personalizada para o seu evento.");
    expect(pt.botao).toBe("Ver e responder à proposta →");
    expect(pt.verOnline).toBe("Ver e responder online:");
    expect(pt.nomeDoAnexo("q1")).toBe("Proposta-Liquen-q1.pdf");
  });

  it("o inglês está todo escrito, sem um campo por traduzir", () => {
    // Compara-se com o português: um campo esquecido sai igual nas duas
    // línguas, e é assim que se apanha sem ter de escrever aqui a tradução
    // toda outra vez.
    expect(en.assunto).not.toBe(pt.assunto);
    expect(en.titulo).not.toBe(pt.titulo);
    expect(en.ola).not.toBe(pt.ola);
    expect(en.intro).not.toBe(pt.intro);
    expect(en.introEmTexto).not.toBe(pt.introEmTexto);
    expect(en.botao).not.toBe(pt.botao);
    expect(en.verOnline).not.toBe(pt.verOnline);
    expect(en.nomeDoAnexo("q1")).not.toBe(pt.nomeDoAnexo("q1"));
  });

  it("e não tem uma palavra portuguesa lá dentro", () => {
    // As palavras que mais facilmente sobrevivem a uma tradução apressada,
    // porque são curtas e estão no meio de markup.
    const tudo = [en.assunto, en.titulo, en.ola, en.intro, en.introEmTexto, en.botao, en.verOnline]
      .join(" ")
      .toLowerCase();
    for (const palavra of ["olá", "proposta", "anexo", "evento", "responder", "seu", "sua"]) {
      expect(tudo).not.toContain(palavra);
    }
    // O nome da casa não é uma palavra portuguesa: é o nome dela, e fica.
    expect(en.assunto).toContain("Líquen Events");
  });

  it("o anexo inglês distingue-se do português na pasta de transferências", () => {
    // Um casal que receba as duas versões (acontece: a portuguesa aos pais, a
    // inglesa ao casal) não pode ficar com «Proposta-Liquen-q1 (1).pdf».
    expect(en.nomeDoAnexo("q1")).toBe("Proposal-Liquen-q1.pdf");
  });

  it("o que não é uma língua conhecida cai no português", () => {
    // Defesa em profundidade: quem chama já resolveu a língua com o
    // `idiomaDaProposta`, mas esta folha nunca pode devolver `undefined` e
    // fazer sair um email com buracos.
    expect(textosDoEmailDaProposta("fr" as never)).toEqual(pt);
  });
});
