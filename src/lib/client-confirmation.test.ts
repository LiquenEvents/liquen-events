import { describe, it, expect } from "vitest";
import { buildClientConfirmation } from "./client-confirmation";

describe("buildClientConfirmation", () => {
  it("builds a Portuguese quote confirmation with the reference in the body", () => {
    const { subject, html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    // The reference is deliberately NOT in the subject: it's ~28 chars and ate
    // the whole line on a phone. It lives in the preheader and the body.
    expect(subject).not.toContain("LIQ-ABC-1234");
    expect(subject).toMatch(/Recebemos/);
    expect(html).toContain("Olá Ana");
    expect(html).toContain("LIQ-ABC-1234");
    expect(text).toContain("LIQ-ABC-1234");
  });

  it("states no turnaround at all — not a date, not a window", () => {
    const { subject, html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    // In high season a number the team can't always hit does more damage than
    // the reassurance it buys, so the email promises care instead of speed.
    const timing =
      /\d+\s*(horas?|dias?)\s*úteis|segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira/i;
    expect(subject).not.toMatch(timing);
    expect(html).not.toMatch(timing);
    expect(text).not.toMatch(timing);
    expect(html).toContain("atenção que merece");
  });

  it("mirrors the event back in prose and in the recap", () => {
    const { html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: {
        typeLabel: "Casamento",
        date: "2027-02-23",
        guests: 120,
        location: "Évora",
        plural: true,
      },
    });
    // A frase leva a DATA e o LOCAL, não o tipo: ver o bloco «o tipo de evento
    // não entra na frase» mais abaixo para o porquê.
    expect(html).toContain("para 23 de fevereiro de 2027, em Évora");
    expect(html).toContain("23 de fevereiro de 2027");
    expect(html).toContain("cerca de 120");
    expect(html).toContain("Évora");
    // Plural register for a couple.
    expect(html).toContain("vosso pedido");
    expect(text).toContain("Casamento");
  });

  it("uses the singular register for non-couple events", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Jantar de Gala", plural: false },
    });
    expect(html).toContain("o seu pedido");
    expect(html).not.toContain("vosso pedido");
  });

  it("handles an open date with the seasons note", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Casamento", date: "", plural: true },
    });
    expect(html).toContain("ainda a definir");
    expect(html).toContain("fins de semana");
  });

  it("builds an English contact confirmation (no reference, no steps)", () => {
    const { subject, html } = buildClientConfirmation({
      locale: "en",
      name: "John",
    });
    expect(subject).toMatch(/received your message/);
    expect(html).toContain("Hello John");
    expect(html).not.toContain("LIQ-");
    // The 3-step ladder would be a lie with no proposal coming.
    expect(html).not.toContain("What happens next");
  });

  it("greets by first name only, and copes with an empty name", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "  Ana   Maria  Silva ",
    });
    expect(html).toContain("Olá Ana,");

    const bare = buildClientConfirmation({ locale: "pt", name: "   " });
    expect(bare.html).toContain("Olá,");
    expect(bare.html).not.toContain("Olá ,");
  });

  it("strips bidi overrides that would reverse the rendering", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana‮",
    });
    expect(html).not.toContain("‮");
  });

  it("is a complete document with a preheader and dark-mode support", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('lang="pt-PT"');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("mso-hide:all"); // hidden preheader
  });

  it("escapes HTML in the client-provided name", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img");
  });
});

/**
 * A confirmação do formulário público também é um email para um cliente — e
 * portanto leva a MESMA assinatura que as respostas escritas à mão, o envio da
 * proposta e o recibo. Era o único que tinha um fecho próprio.
 */
describe("buildClientConfirmation — assinatura da casa", () => {
  it("assina com o nome e o cargo da casa, no HTML e no texto", () => {
    const { html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    expect(html).toContain("Catarina Gaspar");
    expect(html).toContain("Manager");
    expect(text).toContain("Catarina Gaspar");
    expect(text).toContain("Manager");
  });

  it("assina também a versão inglesa — a assinatura é a mesma em todo o lado", () => {
    const { html } = buildClientConfirmation({ locale: "en", name: "John" });
    expect(html).toContain("Catarina Gaspar");
  });

  it("não repete os contactos duas vezes no mesmo email", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    const vezes = html.split("+351 919 259 820").length - 1;
    expect(vezes).toBe(1);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O TIPO DE EVENTO NÃO ENTRA NA FRASE — SÓ NA ETIQUETA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Uma auditoria a 92 dias de correio verdadeiro apanhou as três formas do
 * mesmo erro, todas na mesma frase de abertura:
 *
 *   «É um gosto receber o vosso pedido PARA O CASAMENTOS de 25 de janeiro»
 *   «It's a joy to receive your request FOR YOUR CASAMENTO on 12 June»
 *   «É um gosto receber o vosso pedido PARA O OUTRO de 15 de maio»
 *
 * O que lá caía era um rótulo de LISTA: plural, com barras, e um deles é
 * literalmente «Outro». Nenhum artigo serve para todos, e uma tabela de
 * géneros era uma máquina inteira para uma frase que se reescreve.
 *
 * A frase passa a falar da DATA e do LOCAL — as duas coisas que o cliente
 * quer ver confirmadas — e o tipo aparece onde nunca há concordância para
 * discordar: a linha «Evento:» do resumo e o pré-cabeçalho.
 */
describe("buildClientConfirmation — a frase de abertura não depende do tipo", () => {
  const base = { locale: "pt", name: "Ana", referenceId: "LIQ-ABC-1234" } as const;

  it("um rótulo no plural não é colado a um artigo no singular", () => {
    // Exactamente o que os anúncios enviam: sem `eventName`, o balde da
    // taxonomia («Casamentos») era o que sobrava para a frase.
    const { html, text } = buildClientConfirmation({
      ...base,
      event: { typeLabel: "Casamentos", date: "2027-01-25", location: "Évora", plural: true },
    });
    expect(text).toContain(
      "É um gosto receber o vosso pedido para 25 de janeiro de 2027, em Évora.",
    );
    expect(html).not.toContain("para o casamentos");
    expect(text).not.toContain("para o casamentos");
  });

  it("«Outro» deixa de ter de fazer sentido como substantivo", () => {
    // Sem tipo nenhum (é o que o «Outro» do formulário grava) a frase não
    // perde nada: continua a confirmar a data.
    const { text } = buildClientConfirmation({
      ...base,
      event: { date: "2027-05-15", plural: false },
    });
    expect(text).toContain("É um gosto receber o seu pedido para 15 de maio de 2027.");
    expect(text.toLowerCase()).not.toContain("para o outro");
    expect(text.toLowerCase()).not.toContain("for your other");
  });

  it("uma barra de lista («Batizado / Comunhão») não vai parar a meio da frase", () => {
    // Mesmo que a etiqueta chegue com a barra da lista pendente, a frase não
    // a pode ir buscar: «para o batizado / comunhão de 3 de maio» saiu assim.
    const { text } = buildClientConfirmation({
      ...base,
      event: { typeLabel: "Batizado / Comunhão", date: "2027-05-03", plural: true },
    });
    const abertura = text.split("\n").find((l) => l.startsWith("É um gosto"))!;
    expect(abertura).toBe(
      "É um gosto receber o vosso pedido para 3 de maio de 2027. Está agora nas mãos da nossa equipa.",
    );
    expect(abertura).not.toContain("/");
  });

  it("o email inglês diz tudo em inglês, incluindo o tipo na etiqueta", () => {
    const { text, html } = buildClientConfirmation({
      locale: "en",
      name: "Sarah",
      referenceId: "LIQ-ABC-1234",
      // A etiqueta chega já na língua de quem lê — é a rota que a resolve.
      event: { typeLabel: "Wedding", date: "2027-06-12", location: "Évora", plural: true },
    });
    expect(text).toContain("It's a joy to receive your request for 12 June 2027, in Évora.");
    expect(text).toContain("Event: Wedding");
    expect(text.toLowerCase()).not.toContain("casamento");
    expect(html.toLowerCase()).not.toContain("casamento");
  });

  /**
   * «É um gosto receber o vosso pedido para o casamento, em Evora.» — saiu
   * quatro vezes entre 5 e 10 de agosto. A vírgula separava a data do local,
   * e sem data ficou a separar coisa nenhuma.
   */
  it("sem data, não fica uma vírgula pendurada", () => {
    const { text } = buildClientConfirmation({
      ...base,
      event: { typeLabel: "Casamento", date: "", location: "Évora", plural: true },
    });
    expect(text).toContain("É um gosto receber o vosso pedido para um evento em Évora.");
    expect(text).not.toMatch(/pedido[^.\n]*,\s*em Évora/);

    const en = buildClientConfirmation({
      locale: "en",
      name: "Sarah",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Wedding", date: "", location: "Portugal", plural: true },
    });
    expect(en.text).toContain("It's a joy to receive your request for an event in Portugal.");
    expect(en.text).not.toMatch(/request[^.\n]*,\s*in Portugal/);
  });

  it("sem data e sem local, a frase acaba onde acaba", () => {
    const { text } = buildClientConfirmation({
      ...base,
      event: { typeLabel: "Casamento", plural: true },
    });
    expect(text).toContain("É um gosto receber o vosso pedido. Está agora nas mãos");
    expect(text).not.toMatch(/pedido\s*,/);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O EMAIL NÃO AFIRMA A GEOGRAFIA DO EVENTO DE QUEM O RECEBE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A 7 de agosto uma cliente com um casamento em Vermil, Guimarães, leu no
 * corpo «No Alentejo, a altura do ano muda por completo a luz…». O conselho é
 * verdadeiro; a geografia não era a dela. A nota da data em aberto é o único
 * parágrafo do email que fala do país, e fala dele sem prender ninguém a uma
 * região.
 *
 * O que PODE continuar a dizer Alentejo é a assinatura — a morada da casa é
 * quem somos, não onde é o evento.
 */
describe("buildClientConfirmation — a geografia do evento é a do cliente", () => {
  it("não põe o evento no Alentejo por omissão", () => {
    const { text, html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Casamento", date: "", location: "Vermil, Guimarães", plural: true },
    });
    // A nota das épocas está lá (é a data em aberto)…
    expect(text).toContain("fins de semana");
    // …mas não afirma uma região que pode não ser a do evento.
    expect(text).not.toMatch(/n[oa] Alentejo/i);
    expect(html).not.toMatch(/n[oa] Alentejo/i);
  });

  it("nem na versão inglesa", () => {
    const { text } = buildClientConfirmation({
      locale: "en",
      name: "Sarah",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Wedding", date: "", location: "Guimarães", plural: true },
    });
    expect(text).toContain("weekends");
    expect(text).not.toMatch(/in the Alentejo/i);
  });
});

/**
 * «Olá Vanessa martins,» e «Olá Francisco Maria Carrelhas Das Neves Da Palma
 * Gaspar,» — os dois saíram, a 27 e 28 de julho. Uma saudação usa o primeiro
 * nome: é mais curto, é como se trata alguém, e não há apelido em minúscula
 * para reparar.
 *
 * A CAIXA fica como a pessoa a escreveu, de propósito: «de», «da» e os nomes
 * estrangeiros são assim em muitos casos, e um corrector de maiúsculas erra
 * sempre com alguém — que é precisamente o dano que se quer evitar.
 */
describe("buildClientConfirmation — a saudação usa o primeiro nome", () => {
  it("corta o nome completo no primeiro nome, e não mexe na caixa", () => {
    const curto = buildClientConfirmation({ locale: "pt", name: "Vanessa martins" });
    expect(curto.text).toContain("Olá Vanessa,");
    expect(curto.text).not.toContain("martins");

    const comprido = buildClientConfirmation({
      locale: "pt",
      name: "Francisco Maria Carrelhas Das Neves Da Palma Gaspar",
    });
    expect(comprido.text).toContain("Olá Francisco,");
    expect(comprido.text).not.toContain("Carrelhas");
  });
});
