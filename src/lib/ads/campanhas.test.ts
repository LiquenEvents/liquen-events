import { describe, it, expect } from "vitest";
import {
  todasAsCampanhas,
  planoParaOrcamento,
  campanhasQueCabem,
  urlFinal,
  MINIMO_MENSAL_POR_CAMPANHA,
  DIAS_POR_MES,
  PAISES_INTERNACIONAIS,
} from "./campanhas";
import { POLOS, ESTILOS, caminhoPolo } from "./polos";
import { SITE } from "@/lib/site";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS CAMPANHAS NÃO PODEM SER REJEITADAS NEM APONTAR PARA O VAZIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas famílias de defeito, ambas caras e ambas silenciosas:
 *
 *  1. UM ANÚNCIO REJEITADO. O Google Ads recusa um título com mais de 30
 *     caracteres e uma descrição com mais de 90. A recusa é POR RECURSO: o
 *     anúncio entra na mesma com os títulos que passam, e um grupo pode ficar
 *     meses a servir com sete títulos em vez de quinze sem que ninguém repare.
 *     Menos títulos é menos combinações para a Google testar, e desempenho
 *     pior sem sintoma visível.
 *
 *  2. UM URL FINAL QUE NÃO É PÁGINA NENHUMA. É o defeito clássico das contas
 *     de Ads. Aqui é impossível por construção — os URL derivam do catálogo —
 *     mas "impossível por construção" é uma afirmação, e afirmações no código
 *     medem-se. Já apareceu neste projecto um comentário a garantir que as
 *     fotos do mosaico eram todas em paisagem, e quatro eram retrato.
 */

const MAX_TITULO = 30;
const MAX_DESCRICAO = 90;
const TOTAL = 60;

/** Os caminhos que o site GERA MESMO, derivados das mesmas fontes das páginas. */
const CAMINHOS_REAIS = new Set<string>([
  ...POLOS.map((p) => caminhoPolo(p.slug)),
  ...ESTILOS.map((e) => `/casamentos/estilo/${e.slug}`),
  "/casamentos/destination",
  // Páginas do site que já existiam e que algumas campanhas usam de destino.
  "/servicos/casamentos",
  "/orcamento",
  "/galeria",
  "/sobre",
]);

describe("estrutura de campanhas", () => {
  const campanhas = todasAsCampanhas(TOTAL);

  it("não passa por vacuidade", () => {
    expect(campanhas.length).toBe(POLOS.length + 1 + PAISES_INTERNACIONAIS.length);
    expect(campanhas.flatMap((c) => c.grupos).length).toBeGreaterThanOrEqual(15);
  });

  it("PT e EN nunca partilham campanha", () => {
    // Requisito explícito, e também a única forma de os relatórios por idioma
    // serem legíveis.
    for (const c of campanhas) {
      expect(["pt", "en"]).toContain(c.idioma);
      const ehEn = c.nome.startsWith("EN · ");
      expect(c.idioma === "en", `campanha "${c.nome}"`).toBe(ehEn);
    }
  });

  it("as campanhas nacionais segmentam por PRESENÇA e as internacionais por INTERESSE", () => {
    // Se isto se inverter, a conta passa a comprar exactamente as pessoas
    // erradas dos dois lados: curiosos estrangeiros nas campanhas PT, e
    // ninguém nas EN (o casal que interessa está em Londres, não em Faro).
    for (const c of campanhas) {
      expect(c.modoLocalizacao, `campanha "${c.nome}"`).toBe(
        c.idioma === "en" ? "interesse" : "presenca",
      );
    }
  });

  it("nenhuma keyword vai em correspondência ampla", () => {
    for (const c of campanhas) {
      for (const g of c.grupos) {
        for (const k of g.keywords) {
          expect(["exata", "frase"], `${c.nome} / ${g.nome} / "${k.texto}"`).toContain(
            k.correspondencia,
          );
        }
      }
    }
  });

  it("cada grupo tem 15 títulos e 4 descrições", () => {
    for (const c of campanhas) {
      for (const g of c.grupos) {
        expect(g.titulos.length, `${c.nome} / ${g.nome}`).toBe(15);
        expect(g.descricoes.length, `${c.nome} / ${g.nome}`).toBe(4);
      }
    }
  });

  it("nenhum título passa dos 30 caracteres", () => {
    const maus: string[] = [];
    for (const c of campanhas) {
      for (const g of c.grupos) {
        for (const titulo of g.titulos) {
          if (titulo.length > MAX_TITULO) {
            maus.push(`${c.nome} / ${g.nome}: "${titulo}" (${titulo.length})`);
          }
        }
      }
    }
    expect(maus, `títulos que a Google recusa:\n${maus.join("\n")}`).toEqual([]);
  });

  it("nenhuma descrição passa dos 90 caracteres", () => {
    const maus: string[] = [];
    for (const c of campanhas) {
      for (const g of c.grupos) {
        for (const d of g.descricoes) {
          if (d.length > MAX_DESCRICAO) {
            maus.push(`${c.nome} / ${g.nome}: "${d}" (${d.length})`);
          }
        }
      }
    }
    expect(maus, `descrições que a Google recusa:\n${maus.join("\n")}`).toEqual([]);
  });

  it("os títulos não repetem dentro do mesmo grupo", () => {
    // Títulos repetidos reduzem as combinações que a Google pode montar, com o
    // mesmo efeito de ter menos títulos — e não dão erro nenhum.
    for (const c of campanhas) {
      for (const g of c.grupos) {
        expect(new Set(g.titulos).size, `${c.nome} / ${g.nome}`).toBe(g.titulos.length);
      }
    }
  });

  it("o tom da marca não escorrega para clichés nem exclamações", () => {
    // "contido, editorial, sem exclamações e sem clichés de casamento" — foi
    // pedido por escrito, e é o tipo de requisito que se perde na terceira
    // alteração se não estiver preso a um teste.
    const PROIBIDO =
      /!|\bsonho\b|\bmágic|\binesquecív|\bdia mais feliz\b|\bconto de fadas\b|\bdream\b|\bmagical\b|\bunforgettable\b|\bfairy ?tale\b|\bhappiest day\b/i;
    const maus: string[] = [];
    for (const c of campanhas) {
      for (const g of c.grupos) {
        for (const texto of [...g.titulos, ...g.descricoes]) {
          if (PROIBIDO.test(texto)) maus.push(`${c.nome} / ${g.nome}: "${texto}"`);
        }
      }
    }
    expect(maus, `texto fora do tom da marca:\n${maus.join("\n")}`).toEqual([]);
  });

  it("os títulos das campanhas regionais nomeiam a região", () => {
    for (const polo of POLOS) {
      const c = campanhas.find((x) => x.nome === `PT · ${polo.slug}`);
      expect(c, `campanha do polo ${polo.slug}`).toBeTruthy();
      const regiao = polo.pt.regiao.split(/[\s,]/)[0];
      for (const g of c!.grupos) {
        const nomeiam = g.titulos.filter((t) => t.includes(regiao)).length;
        expect(
          nomeiam,
          `${g.nome}: nenhum dos 15 títulos diz "${regiao}". Um anúncio regional que ` +
            "não nomeia a região é um anúncio genérico e tem o desempenho de um.",
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("TODOS os URL finais correspondem a páginas que o site gera", () => {
    const orfaos: string[] = [];
    for (const c of campanhas) {
      for (const g of c.grupos) {
        if (!CAMINHOS_REAIS.has(g.caminho)) orfaos.push(`${c.nome} / ${g.nome} → ${g.caminho}`);
      }
    }
    expect(
      orfaos,
      "grupos a apontar para páginas que não existem — cliques pagos a aterrar em 404:\n" +
        orfaos.join("\n"),
    ).toEqual([]);
  });

  it("os URL finais das campanhas EN levam o prefixo /en", () => {
    // Sem o prefixo, um casal britânico aterra na versão portuguesa da página
    // e sai. É um erro de uma letra que custa a campanha inteira.
    for (const c of campanhas) {
      for (const g of c.grupos) {
        const url = urlFinal(g.caminho, c.idioma);
        expect(url.startsWith(SITE.url), url).toBe(true);
        expect(url.startsWith(`${SITE.url}/en/`), `${c.nome}: ${url}`).toBe(c.idioma === "en");
      }
    }
  });
});

describe("plano de orçamento", () => {
  /**
   * O ORÇAMENTO REAL DELA. Está escrito aqui em vez de num número solto porque
   * é a restrição que manda em toda a estrutura: 50 €/mês não é um orçamento
   * pequeno para oito campanhas — é um orçamento para UMA.
   */
  const MENSAL_REAL = 50;

  it("50 €/mês sustentam exactamente UMA campanha", () => {
    expect(campanhasQueCabem(MENSAL_REAL)).toBe(1);
    const plano = planoParaOrcamento(MENSAL_REAL, 3);
    expect(plano.campanhas.length).toBe(1);
    // E a que sobra é a de maior peso, não a primeira da lista.
    expect(plano.campanhas[0].nome).toBe("PT · alentejo");
  });

  it("não reparte o orçamento por campanhas que não cabem", () => {
    // Este é o defeito que a função existe para impedir. Repartir 50 € por
    // cinco campanhas dá cinco campanhas mortas, e no fim do mês o relatório
    // não distingue "esta região não compra" de "nunca foi testada".
    const plano = planoParaOrcamento(MENSAL_REAL, 1);
    expect(plano.pedidas).toBeGreaterThan(plano.campanhas.length);
    expect(plano.mensalAtribuido).toBeGreaterThanOrEqual(MENSAL_REAL - 1);
    expect(plano.mensalAtribuido).toBeLessThanOrEqual(MENSAL_REAL + 1);
  });

  it("gasta o orçamento pedido, seja qual for a escala", () => {
    for (const mensal of [50, 120, 400, 1500]) {
      const plano = planoParaOrcamento(mensal, 3);
      // Tolerância proporcional ao nº de campanhas: o orçamento vai para a
      // Google em euros/DIA arredondados ao cêntimo, e cada arredondamento
      // vale até meio cêntimo × 30,4 dias. Com dez campanhas isso são ~1,5 €/mês
      // de desvio possível — real, inevitável, e sem consequência nenhuma.
      const margem = 0.005 * plano.campanhas.length * DIAS_POR_MES + 0.5;
      expect(plano.mensalAtribuido, `${mensal} €/mês`).toBeGreaterThanOrEqual(mensal - margem);
      expect(plano.mensalAtribuido, `${mensal} €/mês`).toBeLessThanOrEqual(mensal + margem);
    }
  });

  it("nenhuma campanha gerada fica abaixo do mínimo viável", () => {
    for (const mensal of [50, 120, 400, 1500]) {
      for (const c of planoParaOrcamento(mensal, 3).campanhas) {
        const mensalDesta = c.orcamento * DIAS_POR_MES;
        expect(
          mensalDesta,
          `${c.nome} com ${mensal} €/mês ficaria com ${mensalDesta.toFixed(2)} €/mês`,
        ).toBeGreaterThanOrEqual(MINIMO_MENSAL_POR_CAMPANHA - 1);
      }
    }
  });

  it("assinala quando nem uma campanha é viável", () => {
    expect(planoParaOrcamento(20, 1).abaixoDoViavel).toBe(true);
    expect(planoParaOrcamento(50, 1).abaixoDoViavel).toBe(false);
    // E gera na mesma UMA campanha: zero campanhas não ajudariam ninguém.
    expect(planoParaOrcamento(20, 1).campanhas.length).toBe(1);
  });

  it("não espalha fino: cada campanha aberta fica acima do mínimo com folga", () => {
    // Com 500 €/mês a primeira versão abria DOZE campanhas, todas a 40 €/mês —
    // todas no limiar de não concluírem nada. Agora abre menos e financia-as.
    const plano = planoParaOrcamento(500, 3);
    expect(plano.campanhas.length).toBeLessThanOrEqual(7);
    for (const c of plano.campanhas) {
      expect(c.orcamento * DIAS_POR_MES, c.nome).toBeGreaterThan(MINIMO_MENSAL_POR_CAMPANHA * 1.4);
    }
  });

  it("corta as keywords ao que o orçamento consegue testar", () => {
    // 50 €/mês compram ~83 cliques. Espalhados por 47 keywords dariam menos de
    // dois cliques cada — e com dois cliques não se pode dizer se uma keyword
    // é boa ou má. O relatório encheria-se de "0 conversões" que parecem um
    // veredicto e são apenas ausência de dados.
    const plano = planoParaOrcamento(MENSAL_REAL, 3);
    const total = plano.campanhas[0].grupos.reduce((s, g) => s + g.keywords.length, 0);
    expect(total).toBeLessThanOrEqual(16);
    expect(total).toBeGreaterThanOrEqual(6);
    // Nenhum grupo fica sem keywords — um grupo vazio não serve anúncios.
    for (const g of plano.campanhas[0].grupos) {
      expect(g.keywords.length, g.nome).toBeGreaterThanOrEqual(1);
    }
    // E a primeira keyword continua a ser a da cidade mais importante do polo.
    expect(plano.campanhas[0].grupos[0].keywords[0].texto).toContain("Évora");
  });

  it("com orçamento grande não corta nada", () => {
    const plano = planoParaOrcamento(2000, 1);
    const alentejo = plano.campanhas.find((c) => c.nome === "PT · alentejo")!;
    const total = alentejo.grupos.reduce((s, g) => s + g.keywords.length, 0);
    expect(total).toBeGreaterThan(30);
  });

  it("mais orçamento abre mais campanhas, por ordem de prioridade", () => {
    const pequeno = planoParaOrcamento(50, 3).campanhas.map((c) => c.nome);
    const grande = planoParaOrcamento(600, 3).campanhas.map((c) => c.nome);
    expect(grande.length).toBeGreaterThan(pequeno.length);
    // O que já estava aberto continua aberto — não se troca de região só
    // porque entrou dinheiro.
    for (const nome of pequeno) expect(grande).toContain(nome);
  });
});
