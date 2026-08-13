import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type MoodBoard, type ProposalDoc } from "./proposal-doc";
import {
  alturaDaLegenda,
  caixasDaCapa,
  caixasDoMoodboard,
  linhasDaLegendaAprox,
  type LayoutDeMoodboard,
} from "./proposal-geometria";
import { ordemDasFotos } from "./proposal-moodboard";
import { pixelsForBox } from "./proposal-image";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CADA FOTO À MEDIDA DA CAIXA — E NUNCA MAIS PEQUENA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O gerador descarregava sempre o ORIGINAL de 2200 px, mesmo para uma célula de
 * mood board desenhada com ~266 px: 28× os bytes e ~30× os pixéis a
 * descodificar, para o `sharp` deitar fora quase tudo a seguir.
 *
 * Agora pergunta-se onde a foto vai ser desenhada e pede-se o tamanho que essa
 * caixa justifica. Isto pode correr mal de duas maneiras opostas, e as duas
 * saem caras:
 *
 *  · **pedir grande de mais** — volta-se ao problema, sem ninguém dar por isso;
 *  · **pedir pequeno de mais** — uma fotografia AMPLIADA e mole numa proposta
 *    que vai para um casal. Esta é pior, e é silenciosa: o PDF sai na mesma.
 *
 * Por isso todos os testes aqui verificam O QUE FOI BUSCADO, não o aspecto do
 * ficheiro. É a única forma de ver a diferença.
 */

const st = vi.hoisted(() => ({
  /** `(ref)` de cada ida buscar o ORIGINAL. */
  originais: [] as string[],
  /** `(ref)` de cada ida buscar a MINIATURA. */
  miniaturas: [] as string[],
  /** Dimensões da miniatura que o duplo devolve, por referência. */
  tamanhoDaMini: {} as Record<string, { w: number; h: number } | null>,
  /** Referências para as quais nem o original existe. */
  semOriginal: new Set<string>(),
  /** `(ref)` de cada ida buscar a DERIVADA DA CAPA. */
  capas: [] as string[],
  /** Dimensões da derivada de capa que já está guardada, por referência. */
  capaGuardada: {} as Record<string, { w: number; h: number } | null>,
  /** O que foi ESCRITO no bucket das capas: referência e dimensões. */
  capasEscritas: [] as { ref: string; w: number; h: number }[],
  /** Dimensões do original que o duplo devolve (por omissão, 2200×1467). */
  tamanhoDoOriginal: {} as Record<string, { w: number; h: number }>,
}));

/** Um JPEG verdadeiro das dimensões pedidas — o `sharp` tem de o conseguir ler.
 *  Guardado por tamanho: a varredura das disposições pede o mesmo ficheiro
 *  centenas de vezes e encodá-lo de novo em cada uma era o custo do teste. */
const jpegs = new Map<string, Promise<Buffer>>();
function jpeg(w: number, h: number): Promise<Buffer> {
  const chave = `${w}x${h}`;
  const feito = jpegs.get(chave);
  if (feito) return feito;
  const novo = sharp({ create: { width: w, height: h, channels: 3, background: "#8a6d2f" } })
    .jpeg()
    .toBuffer();
  jpegs.set(chave, novo);
  return novo;
}

vi.mock("./proposal-storage", () => ({
  fetchProposalImageBytes: async (ref: string) => {
    st.originais.push(ref);
    if (st.semOriginal.has(ref)) return null;
    const t = st.tamanhoDoOriginal[ref] ?? { w: 2200, h: 1467 };
    return jpeg(t.w, t.h);
  },
  fetchProposalThumbBytes: async (ref: string) => {
    st.miniaturas.push(ref);
    const t = st.tamanhoDaMini[ref];
    return t ? jpeg(t.w, t.h) : null;
  },
  fetchProposalCoverBytes: async (ref: string) => {
    st.capas.push(ref);
    const t = st.capaGuardada[ref];
    return t ? jpeg(t.w, t.h) : null;
  },
  uploadProposalCover: async (ref: string, bytes: Buffer) => {
    const m = await sharp(bytes).metadata();
    st.capasEscritas.push({ ref, w: m.width ?? 0, h: m.height ?? 0 });
    return true;
  },
}));

vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const pdf = vi.hoisted(() => ({ docs: [] as ProposalDoc[] }));
vi.mock("./proposal-doc-pdf", async (importOriginal) => ({
  // A GEOMETRIA é real: é ela que decide os tamanhos, e substituí-la por um
  // duplo faria estes testes medir uma página que não existe.
  caixasDoCollage: (await importOriginal<typeof import("./proposal-doc-pdf")>()).caixasDoCollage,
  caixasDaCapa: (await importOriginal<typeof import("./proposal-doc-pdf")>()).caixasDaCapa,
  renderProposalDocPdfWithReport: vi.fn(async (doc: ProposalDoc) => {
    pdf.docs.push(doc);
    return { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), truncations: [], undrawnImages: 0 };
  }),
}));

const { renderStoredProposalDocPdfWithReport } = await import("./proposal-doc-render");

/**
 * Uma proposta com a capa e um mood board de `n` fotos.
 *
 * A DISPOSIÇÃO é dita em cada teste, e não deixada à sugestão: as cinco dão
 * caixas de tamanhos muito diferentes (a célula pequena do «destaque» com seis
 * fotos pede 266×195 px, a do «mosaico» pede 415×299), e um teste sobre TAMANHOS
 * que não diga qual a página que está a medir mede a página que calhar.
 */
function docCom(capa: string[], board: string[], porCima: Partial<MoodBoard> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "R",
    clientNames: "M & Z",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Évora",
    guests: "80 pax",
    ceremony: "Civil",
    time: "16h00",
    weddingPlanners: "—",
    coverImages: capa,
    serviceGroups: [{ letter: "a)", title: "T", items: [{ label: "L", desc: "D" }] }],
    moodBoards: board.length
      ? [{ title: "Cerimónia", layout: "destaque", images: board, ...porCima }]
      : [],
    budgetItems: ["X"],
    totalLabel: "Total",
    totalText: "1 €",
  });
}

/** Uma miniatura de 400 px do lado maior, como o navegador as fabrica. */
const MINI_NORMAL = { w: 400, h: 267 };

beforeEach(() => {
  st.originais = [];
  st.miniaturas = [];
  st.tamanhoDaMini = {};
  st.semOriginal = new Set();
  st.capas = [];
  st.capaGuardada = {};
  st.capasEscritas = [];
  st.tamanhoDoOriginal = {};
  pdf.docs = [];
});

describe("que tamanho é descarregado para cada sítio", () => {
  /**
   * O TESTE QUE INTERESSA. Seis fotos num mood board: a primeira é o destaque
   * (grande, precisa do original) e as cinco da grelha são células pequenas —
   * é para essas que a miniatura chega e é aí que estão os megabytes.
   */
  it("as células pequenas do mood board recebem a MINIATURA, não o original", async () => {
    const refs = Array.from({ length: 6 }, (_, i) => `q-1/f${i}.jpg`);
    for (const r of refs) st.tamanhoDaMini[r] = MINI_NORMAL;

    await renderStoredProposalDocPdfWithReport(docCom([], refs));

    // O destaque (índice 0) é grande: vai direito ao original.
    expect(st.originais, "o destaque tem de vir em original").toContain("q-1/f0.jpg");
    // As cinco pequenas não podem ter ido buscar o original.
    for (const r of refs.slice(1)) {
      expect(st.originais, `${r} foi buscado em original para uma célula pequena`).not.toContain(r);
      expect(st.miniaturas).toContain(r);
    }
  });

  /**
   * A capa corre de topo a fundo da A4 e a 160 DPI pede ~617×1323 px. Nenhuma
   * miniatura de 400 px lá chega — e nem sequer se deve TENTAR, senão é uma ida
   * ao Storage deitada fora por fotografia.
   */
  it("a capa vai direita ao original, sem sequer tentar a miniatura", async () => {
    st.tamanhoDaMini["q-1/capa.jpg"] = MINI_NORMAL;
    await renderStoredProposalDocPdfWithReport(docCom(["q-1/capa.jpg", ""], []));
    expect(st.originais).toEqual(["q-1/capa.jpg"]);
    expect(st.miniaturas, "pediu uma miniatura que de certeza não servia").toEqual([]);
  });

  /**
   * Uma foto muito comprida tem uma miniatura de 400×133. A célula pede
   * 266×194: o lado MAIOR chega e o menor não. Uma regra sobre o lado maior
   * deixava passar exactamente estas — ampliadas.
   */
  it("uma miniatura panorâmica de mais é recusada e sobe ao original", async () => {
    const refs = Array.from({ length: 6 }, (_, i) => `q-1/f${i}.jpg`);
    for (const r of refs) st.tamanhoDaMini[r] = MINI_NORMAL;
    st.tamanhoDaMini["q-1/f3.jpg"] = { w: 400, h: 133 }; // 3:1

    await renderStoredProposalDocPdfWithReport(docCom([], refs));

    expect(st.miniaturas, "nem sequer olhou para a miniatura").toContain("q-1/f3.jpg");
    expect(st.originais, "aceitou uma miniatura que ia ser ampliada").toContain("q-1/f3.jpg");
  });

  it("sem miniatura nenhuma, tudo funciona como antes", async () => {
    const refs = Array.from({ length: 6 }, (_, i) => `q-1/f${i}.jpg`);
    await renderStoredProposalDocPdfWithReport(docCom([], refs));
    expect(st.originais.sort()).toEqual(refs.sort());
  });

  /**
   * A SEGUNDA PASSAGEM, e a razão de ela existir.
   *
   * A disposição depende de QUANTAS fotos o mood board tem. Com seis, as
   * células da grelha medem 266×194 px e a miniatura de 400×267 cobre-as. Com
   * CINCO — porque uma falhou — as mesmas células passam a 266×299, e a
   * miniatura deixa de chegar: seria ampliada, e o PDF saía com uma fotografia
   * mole sem aviso nenhum.
   *
   * A 1.ª passagem não pode saber isto: nessa altura ainda não se sabe qual vai
   * falhar. É por isso que existe uma segunda.
   */
  it("quando uma foto falha e as outras crescem, as miniaturas sobem ao original", async () => {
    const refs = Array.from({ length: 6 }, (_, i) => `q-1/f${i}.jpg`);
    for (const r of refs) st.tamanhoDaMini[r] = MINI_NORMAL;
    // A primeira é o destaque e não tem original nenhum: some, e as outras
    // cinco crescem.
    st.semOriginal.add("q-1/f0.jpg");

    await renderStoredProposalDocPdfWithReport(docCom([], refs));

    // As cinco sobreviventes tinham miniatura aceite para 266×194; a 266×299
    // já não serve, portanto TÊM de ter subido ao original.
    for (const r of refs.slice(1)) {
      expect(st.miniaturas, `${r}: a 1.ª passagem devia ter tentado a miniatura`).toContain(r);
      expect(
        st.originais,
        `${r}: ficou com uma miniatura numa caixa maior — sai ampliada no PDF`,
      ).toContain(r);
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MEDIDA CONTRA A CAIXA VERDADEIRA — as cinco disposições, não uma
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O resolvedor media todas as páginas pela grelha do arranjo em «destaque», com
 * o argumento de que a caixa do destaque é a maior de todas. Só é a maior no
 * índice 0: em «filas» com quatro fotos, a segunda caixa pede 452×301 px e a
 * medição previa 266×299 — a miniatura passava e era AMPLIADA na página.
 *
 * Este teste varre as disposições, os números de fotos, o recorte e três
 * conjuntos de formas, e mede o que interessa: **os bytes que chegam ao gerador
 * cobrem a caixa onde a foto vai ser desenhada?** Não é a medição da 1.ª
 * passagem que se verifica (essa é uma aposta a poupar bytes, e o pior que lhe
 * pode acontecer é uma ida ao armazenamento deitada fora) — é a garantia, que
 * mora na 2.ª passagem, onde as formas já são conhecidas.
 */
describe("nenhuma fotografia chega ao gerador mais pequena do que a sua caixa", () => {
  const LAYOUTS: LayoutDeMoodboard[] = [
    "filas",
    "fila-unica",
    "mosaico",
    "destaque",
    "texto-e-imagem",
  ];

  /** Três conjuntos de formas: só deitadas, só ao alto, e uma página misturada
   *  (que é o caso das propostas a sério, e o que faz as filas mudar de altura). */
  const CONJUNTOS: Record<string, (n: number) => number[]> = {
    deitadas: (n) => Array.from({ length: n }, () => 1.5),
    "ao alto": (n) => Array.from({ length: n }, () => 0.67),
    misturadas: (n) => Array.from({ length: n }, (_, i) => [1.5, 0.67, 2.4][i % 3]),
  };

  /** Põe no armazenamento o original (2200 px no lado maior) e a miniatura (400)
   *  de cada foto, com a forma pedida. */
  function comAsFormas(refs: string[], formas: number[]) {
    refs.forEach((ref, i) => {
      const a = formas[i];
      const lado = (l: number) =>
        a >= 1 ? { w: l, h: Math.round(l / a) } : { w: Math.round(l * a), h: l };
      st.tamanhoDoOriginal[ref] = lado(2200);
      st.tamanhoDaMini[ref] = lado(400);
    });
  }

  it("varrendo disposições, contagens, recorte e formas", async () => {
    for (const n of [1, 2, 4, 6, 10]) {
      for (const layout of LAYOUTS) {
        for (const semRecorte of [false, true]) {
          for (const [nomeDasFormas, conjunto] of Object.entries(CONJUNTOS)) {
            st.originais = [];
            st.miniaturas = [];
            st.tamanhoDaMini = {};
            st.tamanhoDoOriginal = {};
            pdf.docs = [];

            const refs = Array.from({ length: n }, (_, i) => `q-1/f${i}.jpg`);
            const formas = conjunto(n);
            comAsFormas(refs, formas);
            await renderStoredProposalDocPdfWithReport(
              docCom([], refs, {
                layout,
                enquadramento: semRecorte ? "forma-da-foto" : undefined,
              }),
            );

            const onde = `${layout}${semRecorte ? " sem recorte" : ""}, ${n} fotos ${nomeDasFormas}`;
            const entregues = pdf.docs[0].moodBoards?.[0].images ?? [];
            expect(entregues, onde).toHaveLength(n);
            // A caixa VERDADEIRA é a que o gerador vai calcular: com as formas
            // dos bytes que recebeu, que é a última palavra sobre a página.
            const medidas = await Promise.all(
              entregues.map((b64) => sharp(Buffer.from(b64, "base64")).metadata()),
            );
            const caixas = caixasDoMoodboard(
              layout,
              medidas.map((m) => (m.width ?? 1) / (m.height ?? 1)),
              alturaDaLegenda(linhasDaLegendaAprox(undefined)),
              semRecorte,
            );
            medidas.forEach((m, i) => {
              const alvo = pixelsForBox(caixas[i].w, caixas[i].h, "collage");
              const quem = `${onde}, foto ${i}: ${m.width}×${m.height} para uma caixa de ${alvo.width}×${alvo.height}`;
              expect(m.width ?? 0, quem).toBeGreaterThanOrEqual(alvo.width);
              expect(m.height ?? 0, quem).toBeGreaterThanOrEqual(alvo.height);
            });
          }
        }
      }
    }
  });

  /**
   * ── A FOTO QUE MANDA NA PÁGINA ────────────────────────────────────────────
   *
   * O desenho permuta a foto marcada como principal para a caixa grande
   * (`ordemDasFotos`, a mesma função do estúdio). A medição era feita pela
   * posição no ARRAY: marcar a sexta pedia-lhe a miniatura de uma célula de
   * 266×111 px e desenhava-a na caixa de 56% da mancha, que pede 714×613.
   */
  it("a foto marcada como principal é pedida no tamanho da CAIXA GRANDE", async () => {
    const refs = Array.from({ length: 10 }, (_, i) => `q-1/f${i}.jpg`);
    for (const r of refs) st.tamanhoDaMini[r] = MINI_NORMAL;

    await renderStoredProposalDocPdfWithReport(docCom([], refs, { principal: 5 }));

    expect(
      st.originais,
      "a principal ficou com uma miniatura de célula pequena para a caixa de 56% da mancha",
    ).toContain("q-1/f5.jpg");
    // E só ela: as outras nove são células pequenas e continuam a vir em
    // miniatura — incluindo a primeira do array, que já não é a do destaque.
    expect(st.originais).toEqual(["q-1/f5.jpg"]);
    for (const r of refs.filter((r) => r !== "q-1/f5.jpg")) {
      expect(st.miniaturas, `${r} devia ter vindo em miniatura`).toContain(r);
    }
  });

  /**
   * ── A 11.ª FOTO NÃO É A CAPA ─────────────────────────────────────────────
   *
   * A página desenha dez. A décima primeira ficava sem caixa, e uma caixa a
   * `null` é o sinal de «isto é a CAPA»: recortava-se a tira alta de 617×1323
   * px e escrevia-se no armazenamento a derivada de uma fotografia que nem
   * sequer é impressa. Trabalho de `sharp` e escritas por nada.
   */
  it("a 11.ª foto de um mood board não vai pelo caminho da capa", async () => {
    const refs = Array.from({ length: 11 }, (_, i) => `q-1/f${i}.jpg`);
    for (const r of refs) st.tamanhoDaMini[r] = MINI_NORMAL;

    await renderStoredProposalDocPdfWithReport(docCom([], refs));

    expect(st.capas, "procurou a derivada de capa de uma foto de mood board").toEqual([]);
    expect(st.capasEscritas, "escreveu no armazenamento a capa de uma foto que não é capa").toEqual(
      [],
    );
    // Continua a ser buscada — é isso que a faz contar para o aviso de fotos a
    // mais —, e pela caixa mais pequena da página, que é o que ela merece.
    expect(st.miniaturas).toContain("q-1/f10.jpg");
    expect(st.originais).toEqual(["q-1/f0.jpg"]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MARCA «PRINCIPAL» SOBREVIVE ÀS FOTOS QUE FALTAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotos que não resolvem saem da lista, e a lista é reescrita compactada. A
 * marca é um ÍNDICE dessa lista: sem a trazer atrás, uma foto em falta faz «a
 * principal» passar a apontar para outra fotografia — a página sai com a foto
 * errada em grande e ninguém lhe tocou.
 */
describe("a marca da foto principal depois da compactação", () => {
  /** O board como o gerador o recebeu. */
  const recebido = () => pdf.docs[0].moodBoards?.[0] as MoodBoard;

  it("uma foto em falta antes dela puxa a marca para trás", async () => {
    const refs = Array.from({ length: 6 }, (_, i) => `q-1/f${i}.jpg`);
    st.semOriginal.add("q-1/f1.jpg");

    await renderStoredProposalDocPdfWithReport(docCom([], refs, { principal: 4 }));

    expect(recebido().images).toHaveLength(5);
    expect(recebido().principal, "a marca ficou a apontar para outra fotografia").toBe(3);
  });

  it("com todas a resolver, a marca fica onde estava", async () => {
    const refs = Array.from({ length: 6 }, (_, i) => `q-1/f${i}.jpg`);
    await renderStoredProposalDocPdfWithReport(docCom([], refs, { principal: 4 }));
    expect(recebido().principal).toBe(4);
  });

  it("se for a PRÓPRIA marcada a faltar, deixa de haver marca", async () => {
    // Não pode apontar para o lugar que ela deixou: quem lá ficar não foi
    // escolhida para mandar na página. Sem marca, manda a primeira — que é o
    // que sempre aconteceu antes de haver marcas.
    const refs = Array.from({ length: 6 }, (_, i) => `q-1/f${i}.jpg`);
    st.semOriginal.add("q-1/f4.jpg");

    await renderStoredProposalDocPdfWithReport(docCom([], refs, { principal: 4 }));

    expect(recebido().images).toHaveLength(5);
    expect(recebido().principal).toBeUndefined();
  });

  /** A permutação e a compactação têm de contar a mesma história: a foto que
   *  fica em primeiro no desenho é a que foi marcada, não a que calhou. */
  it("a permutação do desenho continua a apanhar a foto certa", async () => {
    const refs = Array.from({ length: 6 }, (_, i) => `q-1/f${i}.jpg`);
    st.semOriginal.add("q-1/f0.jpg");

    await renderStoredProposalDocPdfWithReport(docCom([], refs, { principal: 3 }));

    const mb = recebido();
    // f0 saiu; f3 é agora a posição 2, e é ela que `ordemDasFotos` põe primeiro.
    expect(mb.principal).toBe(2);
    expect(ordemDasFotos(mb)[0]).toBe(2);
    expect(mb.images).toHaveLength(5);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DERIVADA DA CAPA — o recorte feito uma vez, não a cada PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A tira da capa é a fatia mais cara do documento: 617×1323 px recortados de um
 * original de 2200 px, ~250 ms de `sharp` por tira, duas tiras, em CADA geração
 * — sempre para produzir exactamente os mesmos bytes.
 *
 * Como nos outros testes deste ficheiro, o que se verifica é O QUE FOI BUSCADO
 * e O QUE FOI GUARDADO, não o aspecto do ficheiro: é a única forma de ver a
 * diferença entre pagar o recorte uma vez e pagá-lo para sempre.
 */
describe("a derivada da capa", () => {
  /** Os pixéis que a tira da capa merece, vindos da geometria verdadeira. */
  const ALVO = pixelsForBox(caixasDaCapa()[0].w, caixasDaCapa()[0].h, "cover");

  it("existindo, é usada — e o original nem chega a ser descarregado", async () => {
    st.capaGuardada["q-1/capa.jpg"] = { w: ALVO.width, h: ALVO.height };

    await renderStoredProposalDocPdfWithReport(docCom(["q-1/capa.jpg", ""], []));

    expect(st.capas, "nem sequer procurou a derivada").toEqual(["q-1/capa.jpg"]);
    expect(st.originais, "descarregou o original de 2200 px tendo a tira já recortada").toEqual([]);
  });

  it("não existindo, é feita e GUARDADA com os pixéis exactos da caixa", async () => {
    await renderStoredProposalDocPdfWithReport(docCom(["q-1/capa.jpg", ""], []));

    expect(st.originais, "tinha de cair para o original desta vez").toEqual(["q-1/capa.jpg"]);
    expect(st.capasEscritas).toEqual([{ ref: "q-1/capa.jpg", w: ALVO.width, h: ALVO.height }]);
  });

  /**
   * Guardar uma derivada mais pequena do que a caixa seria guardar uma tira que
   * nunca serve — e obrigava quem a fosse buscar a medi-la para descobrir isso.
   * O `resizeToBox` não amplia (não se inventam pixéis), portanto a resposta
   * certa é não haver derivada nenhuma e a foto seguir pelo caminho de sempre.
   */
  it("de um original pequeno de mais, não se guarda derivada nenhuma", async () => {
    st.tamanhoDoOriginal["q-1/pequena.jpg"] = { w: 800, h: 1200 };

    await renderStoredProposalDocPdfWithReport(docCom(["q-1/pequena.jpg", ""], []));

    expect(st.originais).toEqual(["q-1/pequena.jpg"]);
    expect(st.capasEscritas, "guardou uma tira que não chega para a caixa").toEqual([]);
  });

  /**
   * Uma derivada de uma versão ANTERIOR da geometria (a caixa mudou de tamanho)
   * seria uma fotografia ampliada na primeira página da proposta. Mede-se antes
   * de confiar, exactamente como se faz com as miniaturas.
   */
  it("uma derivada pequena de mais é recusada e sobe ao original", async () => {
    st.capaGuardada["q-1/capa.jpg"] = { w: 400, h: 858 };

    await renderStoredProposalDocPdfWithReport(docCom(["q-1/capa.jpg", ""], []));

    expect(st.capas).toEqual(["q-1/capa.jpg"]);
    expect(st.originais, "aceitou uma derivada que ia ser ampliada").toEqual(["q-1/capa.jpg"]);
  });
});
