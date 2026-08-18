import { describe, it, expect } from "vitest";
import {
  paragrafoDoQueMudou,
  resumoDaPropostaParaCopiar,
  textosDoEmailDaProposta,
} from "./email-proposta-textos";
import type { Mudanca } from "./orcamento/diferencas";
import type { ProposalMoney } from "./proposal-doc";

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
    expect(pt.botao).toBe("Ver a proposta →");
    expect(pt.verOnline).toBe("Ver online:");
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RESUMO PARA COLAR NO WHATSAPP
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("resumoDaPropostaParaCopiar", () => {
  const dados = {
    clientNames: "Maria & Zé",
    eventDate: "3 de julho de 2027",
    aPagar: "3.690,00 €",
  };

  it("as três linhas, em português", () => {
    const texto = resumoDaPropostaParaCopiar(dados, "pt");
    expect(texto).toBe(
      "Proposta Líquen Events, Maria & Zé\nData do evento: 3 de julho de 2027\nValor a pagar: 3.690,00 €",
    );
  });

  it("as três linhas, em inglês, sem uma palavra portuguesa", () => {
    const texto = resumoDaPropostaParaCopiar(dados, "en");
    expect(texto).toBe(
      "Líquen Events proposal, Maria & Zé\nEvent date: 3 de julho de 2027\nAmount to pay: 3.690,00 €",
    );
    // O nome e a data são texto dela — não se traduzem. Só os rótulos mudam.
    for (const palavra of ["data do evento", "valor a pagar", "proposta líquen"]) {
      expect(texto.toLowerCase()).not.toContain(palavra);
    }
  });

  it("o link só entra quando existe", () => {
    const sem = resumoDaPropostaParaCopiar(dados, "pt");
    expect(sem).not.toContain("http");
    const com = resumoDaPropostaParaCopiar(
      { ...dados, link: "https://liquen-events.com/proposta/abc.sig" },
      "pt",
    );
    expect(com.split("\n")).toHaveLength(4);
    expect(com).toContain("Proposta: https://liquen-events.com/proposta/abc.sig");
  });

  it("um link em branco não deixa uma linha vazia a apontar para nada", () => {
    const texto = resumoDaPropostaParaCopiar({ ...dados, link: "   " }, "pt");
    expect(texto.split("\n")).toHaveLength(3);
  });

  it("sem data marcada, diz que está por marcar em vez de deixar a linha em branco", () => {
    const texto = resumoDaPropostaParaCopiar({ ...dados, eventDate: "" }, "pt");
    expect(texto).toContain("Data do evento: por marcar");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PARÁGRAFO DO QUE MUDOU
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("paragrafoDoQueMudou", () => {
  const money = (gross: number): ProposalMoney => ({
    base: gross / 1.23,
    vat: gross - gross / 1.23,
    gross,
    vatRate: 0.23,
    mode: "incluido",
  });

  it("sem mudança nenhuma, não há parágrafo (primeira versão)", () => {
    expect(paragrafoDoQueMudou([], { antes: money(3500), depois: money(3500) }, "pt")).toBeNull();
  });

  it("só o total muda: uma frase, em português", () => {
    const mudancas: Mudanca[] = [
      { onde: "Total", tipo: "alterado", texto: "O total passou de 3.500,00 € para 4.200,00 €" },
    ];
    const texto = paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(4200) }, "pt");
    expect(texto).toBe("Desde a última proposta: o total passou de 3.500,00 € para 4.200,00 €.");
  });

  it("categoria e total juntos, em inglês, sem travessão longo", () => {
    const mudancas: Mudanca[] = [
      { onde: "Total", tipo: "alterado", texto: "…" },
      {
        onde: "Orçamento",
        tipo: "acrescentado",
        texto: 'Entrou "Wedding Coordinator" por 1.500,00 €',
      },
    ];
    const texto = paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(5000) }, "en");
    expect(texto).toBe(
      "Since the last proposal: there were changes to the budget; the total went from €3,500.00 to €5,000.00.",
    );
    expect(texto).not.toContain("—");
    // Nenhuma palavra portuguesa a meio da frase inglesa.
    for (const palavra of ["orçamento", "última", "desde"]) {
      expect(texto!.toLowerCase()).not.toContain(palavra);
    }
  });

  it("duas categorias juntam-se com 'e' / 'and'", () => {
    const mudancas: Mudanca[] = [
      { onde: "Orçamento", tipo: "acrescentado", texto: "x" },
      { onde: "Serviços", tipo: "acrescentado", texto: "y" },
    ];
    const pt = paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(3500) }, "pt");
    expect(pt).toBe("Desde a última proposta: houve alterações em o orçamento e os serviços.");
    const en = paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(3500) }, "en");
    expect(en).toBe("Since the last proposal: there were changes to the budget and the services.");
  });

  it("só o MODO de IVA muda (o casal paga o mesmo): sem parágrafo, em vez de inventar uma frase", () => {
    // `diferencas` regista este caso como uma mudança em "Total", mas o bruto
    // não se mexe — não há um "passou de X para Y" honesto para dizer aqui.
    const mudancas: Mudanca[] = [
      {
        onde: "Total",
        tipo: "alterado",
        texto: "O total passou a ser apresentado com IVA incluído",
      },
    ];
    expect(
      paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(3500) }, "pt"),
    ).toBeNull();
  });

  it("usa dinheiroDaProposta (o gross recebido), não uma conta própria", () => {
    // Uma prova directa de que a frase usa exactamente os números que lhe são
    // passados — que é o que `dinheiroDaProposta` (e não `resolveProposalMoney`)
    // já corrige a montante, em `diferencas.ts`.
    const mudancas: Mudanca[] = [{ onde: "Total", tipo: "alterado", texto: "…" }];
    const texto = paragrafoDoQueMudou(
      mudancas,
      { antes: money(1000), depois: money(1906.5) },
      "pt",
    );
    expect(texto).toContain("1.000,00 €");
    expect(texto).toContain("1.906,50 €");
  });

  it("categoria desconhecida (uma versão futura de diferencas.ts) não rebenta, só não entra na frase", () => {
    const mudancas: Mudanca[] = [{ onde: "Uma Categoria Nova", tipo: "alterado", texto: "x" }];
    expect(
      paragrafoDoQueMudou(mudancas, { antes: money(3500), depois: money(3500) }, "pt"),
    ).toBeNull();
  });
});
