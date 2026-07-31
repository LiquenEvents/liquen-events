import { describe, it, expect } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import {
  construirConversoes,
  csvConversoes,
  relatorio,
  NOME_CONVERSAO,
  FUSO,
} from "./conversoes-offline";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EXPORTADOR DE CONVERSÕES OFFLINE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro decide para que é que a Google vai optimizar durante os meses
 * seguintes. Um erro aqui não parte nada visível: produz um ficheiro que
 * carrega sem queixas e ensina o algoritmo a perseguir a coisa errada.
 *
 * Os três erros que mais custam, todos silenciosos:
 *
 *  1. ENVIAR O VALOR COM IVA. Inflaciona o ROAS em 23% e leva a Google a
 *     licitar mais alto do que o negócio aguenta. Este projecto já teve
 *     exactamente este erro noutro sítio (o `quotedPrice` gravado com IVA num
 *     campo rotulado "sem IVA"), portanto não é um risco teórico.
 *  2. EXCLUIR LINHAS EM SILÊNCIO. Seis conversões enviadas quando havia dez
 *     negócios fechados, sem explicação, leva alguém a concluir que a
 *     publicidade só trouxe seis e a cortar o orçamento.
 *  3. ENVIAR LINHAS QUE A GOOGLE RECUSA (conversão antes do clique, clique com
 *     mais de 90 dias). Aparecem como erro no carregamento, sem dizer porquê.
 */

const GCLID = "Cj0KCQjw1JeYBhD9ARIsAHtAtLLxTESTE0001";

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: "LIQ-TESTE-0001",
    submittedAt: "2026-01-10T09:00:00.000Z",
    status: "aceite",
    priceBreakdown: undefined as never,
    quotedPrice: 20000,
    adClick: `gclid:${GCLID}@2026-01-05T09:00:00.000Z`,
    lastUpdated: "2026-02-01T15:30:00.000Z",
    // O resto do QuoteFormData não é lido por este módulo.
    ...(over as object),
  } as unknown as Quote;
}

const semProposta = () => null;
const semContrato = () => undefined;

describe("construção das conversões", () => {
  it("gera uma linha por casamento fechado com identificador", () => {
    const r = construirConversoes([quote()], semProposta, semContrato);
    expect(r.examinados).toBe(1);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({
      id: GCLID,
      tipo: "gclid",
      quando: "2026-02-01 15:30:00",
      valor: 20000,
    });
  });

  it("envia o valor SEM IVA, não o que o cliente paga", () => {
    // `quotedPrice` é o campo "Preço final (sem IVA)". Se alguém trocar isto
    // pelo total com IVA, o ROAS aparece 23% melhor do que é e a Google licita
    // em cima de receita que não existe.
    const r = construirConversoes([quote({ quotedPrice: 20000 })], semProposta, semContrato);
    expect(r.linhas[0].valor).toBe(20000);
    expect(r.linhas[0].valor).not.toBe(24600);
  });

  it("usa a data de aceitação do contrato quando existe", () => {
    // É a data com significado legal, e a que a Google deve ver como momento
    // da conversão.
    const r = construirConversoes([quote()], semProposta, () => "2026-01-20T11:00:00.000Z");
    expect(r.linhas[0].quando).toBe("2026-01-20 11:00:00");
  });

  it("ignora pedidos que não estão fechados", () => {
    for (const status of ["pendente", "em_revisao", "cotado", "rejeitado"] as const) {
      const r = construirConversoes([quote({ status })], semProposta, semContrato);
      expect(r.examinados, status).toBe(0);
      expect(r.linhas, status).toHaveLength(0);
    }
  });

  it("ignora pedidos arquivados", () => {
    const r = construirConversoes([quote({ archived: true })], semProposta, semContrato);
    expect(r.examinados).toBe(0);
  });

  it("apanha também os identificadores de iOS", () => {
    for (const tipo of ["gbraid", "wbraid"] as const) {
      const r = construirConversoes(
        [quote({ adClick: `${tipo}:${GCLID}@2026-01-05T09:00:00.000Z` })],
        semProposta,
        semContrato,
      );
      expect(r.linhas[0].tipo, tipo).toBe(tipo);
    }
  });
});

describe("o que fica de fora, e porquê", () => {
  it("um casamento sem anúncio é excluído como caso NORMAL", () => {
    const r = construirConversoes([quote({ adClick: "" })], semProposta, semContrato);
    expect(r.linhas).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("sem-identificador");
  });

  it("recusa uma conversão anterior ao clique", () => {
    // A Google recusa-a. Acontece de verdade quando alguém corrige o estado de
    // um pedido antigo à mão.
    const r = construirConversoes(
      [quote({ adClick: `gclid:${GCLID}@2026-03-01T09:00:00.000Z` })],
      semProposta,
      semContrato,
    );
    expect(r.linhas).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("data-anterior-ao-clique");
  });

  it("recusa um clique com mais de 90 dias", () => {
    const r = construirConversoes(
      [
        quote({
          adClick: `gclid:${GCLID}@2026-01-05T09:00:00.000Z`,
          lastUpdated: "2026-06-01T09:00:00.000Z",
        }),
      ],
      semProposta,
      semContrato,
    );
    expect(r.linhas).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("fora-da-janela");
    expect(r.excluidos[0].detalhe).toContain("147 dias");
  });

  it("assinala um pedido fechado SEM valor gravado", () => {
    // É o único motivo de exclusão que ela pode e deve corrigir: um casamento
    // fechado sem preço final gravado não contribui para o ROAS de nada.
    const r = construirConversoes([quote({ quotedPrice: undefined })], semProposta, semContrato);
    expect(r.linhas).toHaveLength(0);
    expect(r.excluidos[0].motivo).toBe("sem-valor");
  });

  it("sobrevive a um identificador corrompido", () => {
    const r = construirConversoes(
      [quote({ adClick: "isto não é nada" })],
      semProposta,
      semContrato,
    );
    expect(r.excluidos[0].motivo).toBe("identificador-ilegivel");
  });

  it("nunca perde um fechado: cada um sai como linha OU como exclusão", () => {
    // A propriedade que impede o modo de falha nº 2. Se alguém acrescentar um
    // `continue` sem registar o motivo, este teste apanha-o.
    const quotes = [
      quote({ id: "A" }),
      quote({ id: "B", adClick: "" }),
      quote({ id: "C", quotedPrice: undefined }),
      quote({ id: "D", adClick: "lixo" }),
      quote({ id: "E", lastUpdated: "2026-06-01T09:00:00.000Z" }),
    ];
    const r = construirConversoes(quotes, semProposta, semContrato);
    expect(r.examinados).toBe(5);
    expect(r.linhas.length + r.excluidos.length).toBe(5);
    const refs = [...r.linhas.map((l) => l.ref), ...r.excluidos.map((e) => e.ref)].sort();
    expect(refs).toEqual(["A", "B", "C", "D", "E"]);
  });
});

describe("o ficheiro", () => {
  it("tem o cabeçalho de fuso horário que a Google exige", () => {
    const r = construirConversoes([quote()], semProposta, semContrato);
    const csv = csvConversoes(r.linhas, "gclid");
    expect(csv.split("\n")[0]).toBe(`Parameters:TimeZone=${FUSO}`);
    expect(csv.split("\n")[1]).toBe(
      "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
    );
    expect(csv).toContain(`${GCLID},${NOME_CONVERSAO},2026-02-01 15:30:00,20000.00,EUR`);
  });

  it("separa os identificadores de iOS num ficheiro com outra coluna", () => {
    // Não cabem no mesmo ficheiro: a Google pede uma coluna com nome diferente
    // para cada tipo. Misturá-los faz o carregamento falhar inteiro.
    const r = construirConversoes(
      [quote({ id: "A" }), quote({ id: "B", adClick: `gbraid:${GCLID}@2026-01-05T09:00:00.000Z` })],
      semProposta,
      semContrato,
    );
    expect(csvConversoes(r.linhas, "gclid").split("\n")).toHaveLength(4); // fuso + cab + 1 + ""
    const ios = csvConversoes(r.linhas, "gbraid");
    expect(ios.split("\n")[1].startsWith("GBRAID,")).toBe(true);
    expect(ios.split("\n")).toHaveLength(4);
  });

  it("o relatório nomeia o que precisa de acção e só conta o que é normal", () => {
    const r = construirConversoes(
      [
        quote({ id: "COM-ANUNCIO" }),
        quote({ id: "ORGANICO-1", adClick: "" }),
        quote({ id: "ORGANICO-2", adClick: "" }),
        quote({ id: "SEM-PRECO", quotedPrice: undefined }),
      ],
      semProposta,
      semContrato,
    );
    const texto = relatorio(r);
    expect(texto).toContain("Casamentos fechados examinados: 4");
    expect(texto).toContain("Conversões a enviar: 1");
    expect(texto).toContain("20000.00 € (sem IVA)");
    // O que ela tem de corrigir aparece nomeado…
    expect(texto).toContain("SEM-PRECO");
    // …e os orgânicos ficam contados, sem encher o relatório de ruído.
    expect(texto).toContain("2 × sem-identificador");
    expect(texto).not.toContain("ORGANICO-1");
  });
});
