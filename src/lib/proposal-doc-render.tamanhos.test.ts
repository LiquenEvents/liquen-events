import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";

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
}));

/** Um JPEG verdadeiro das dimensões pedidas — o `sharp` tem de o conseguir ler. */
async function jpeg(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#8a6d2f" } })
    .jpeg()
    .toBuffer();
}

vi.mock("./proposal-storage", () => ({
  fetchProposalImageBytes: async (ref: string) => {
    st.originais.push(ref);
    return st.semOriginal.has(ref) ? null : jpeg(2200, 1467);
  },
  fetchProposalThumbBytes: async (ref: string) => {
    st.miniaturas.push(ref);
    const t = st.tamanhoDaMini[ref];
    return t ? jpeg(t.w, t.h) : null;
  },
}));

vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const pdf = vi.hoisted(() => ({ docs: [] as ProposalDoc[] }));
vi.mock("./proposal-doc-pdf", async (importOriginal) => ({
  // A GEOMETRIA é real: é ela que decide os tamanhos, e substituí-la por um
  // duplo faria estes testes medir uma página que não existe.
  caixasDoCollage: (await importOriginal<typeof import("./proposal-doc-pdf")>()).caixasDoCollage,
  renderProposalDocPdfWithReport: vi.fn(async (doc: ProposalDoc) => {
    pdf.docs.push(doc);
    return { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), truncations: [] };
  }),
}));

const { renderStoredProposalDocPdfWithReport } = await import("./proposal-doc-render");

/** Uma proposta com a capa e um mood board de `n` fotos. */
function docCom(capa: string[], board: string[]): ProposalDoc {
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
    moodBoards: board.length ? [{ title: "Cerimónia", images: board }] : [],
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
