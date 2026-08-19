import { describe, it } from "vitest";
import { writeFileSync, readdirSync, readFileSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";
import { renderProposalDocPdfWithReport } from "@/lib/proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * GUIÃO DE MEDIÇÃO — não é um teste de regressão.
 *
 * Gera os sete casos pedidos no relatório IDEIAS-PDF.md, mede tempo, memória e
 * peso, e escreve tudo em `medicao/saida/`.
 *
 *   npx vitest run --config medicao/vitest.medicao.config.ts
 */

const RAIZ = path.join(process.cwd());
const SAIDA = path.join(RAIZ, "medicao", "saida");
mkdirSync(SAIDA, { recursive: true });

const DIR_FOTOS = path.join(RAIZ, "public", "imagens");
const catalogo = readdirSync(DIR_FOTOS)
  .filter((f) => /\.(jpe?g|JPG)$/.test(f))
  .map((f) => ({ nome: f, bytes: statSync(path.join(DIR_FOTOS, f)).size }))
  .sort((a, b) => b.bytes - a.bytes);

const cacheB64 = new Map<string, string>();
function foto(i: number): string {
  const f = catalogo[i % catalogo.length];
  const hit = cacheB64.get(f.nome);
  if (hit) return hit;
  const b64 = `data:image/jpeg;base64,${readFileSync(path.join(DIR_FOTOS, f.nome)).toString("base64")}`;
  cacheB64.set(f.nome, b64);
  return b64;
}
function fotos(inicio: number, quantas: number): string[] {
  return Array.from({ length: quantas }, (_, k) => foto(inicio + k));
}
function bytesDasFotos(inicio: number, quantas: number): number {
  let s = 0;
  for (let k = 0; k < quantas; k++) s += catalogo[(inicio + k) % catalogo.length].bytes;
  return s;
}

const base = {
  template: "decoracao" as const,
  ref: "PO Decoração Casamento Maria & Zé 12.09.2026",
  clientNames: "Maria & Zé",
  eventType: "Casamento",
  eventDate: "12 de setembro de 2026",
  location: "Monte da Oliveirinha, Évora",
  guests: "80 pax",
  ceremony: "Civil, simbólica",
  time: "16h00",
  servico: "Decor e decoração Floral",
  totalLabel: "Valor Total Decoração",
};

const grupo = (letra: string, titulo: string, n: number) => ({
  letter: letra,
  title: titulo,
  items: Array.from({ length: n }, (_, i) => ({
    label: ["Cerimónia", "Copo d'água", "Jantar", "Espaço", "Mesa dos noivos"][i % 5],
    desc: "Arco floral com flor natural da época, passadeira com pétalas, e composições baixas nas mesas de apoio ao serviço.",
  })),
});

const casos: Record<string, ProposalDoc> = {};

// 1 — CURTA: um grupo, três linhas, um mood board, capa com duas fotos.
casos.curta = withProposalDefaults({
  ...base,
  coverImages: [foto(0), foto(1)],
  serviceGroups: [grupo("a)", "Decoração Floral de Casamento", 3)],
  moodBoards: [{ title: "Decoração Cerimónia", images: fotos(2, 4) }],
  budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
  budgetAmounts: [1800, 1400, 1600],
  totalText: "4800,00 € + IVA",
  totalAmount: 4800,
  totalVatMode: "acrescer",
});

// 2 — LONGA: 3 grupos, 15 linhas de orçamento, 2 mood boards.
casos.longa = withProposalDefaults({
  ...base,
  coverImages: [foto(0), foto(1)],
  serviceGroups: [
    grupo("a)", "Decoração Floral de Casamento", 5),
    grupo("b)", "Decoração de Espaço e Mobiliário", 5),
    grupo("c)", "Complementos dos Noivos", 5),
  ],
  moodBoards: [
    { title: "Decoração Cerimónia", images: fotos(2, 6) },
    { title: "Copo d'água e Jantar", images: fotos(8, 6) },
  ],
  budgetItems: Array.from({ length: 15 }, (_, i) => `Rubrica de orçamento número ${i + 1}`),
  budgetAmounts: Array.from({ length: 15 }, (_, i) => 300 + i * 55),
  budgetExtras: [
    { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
    { label: "Wedding Coordinator", valueText: "895,00 € + IVA" },
  ],
  budgetExtrasSomam: true,
  totalText: "9375,00 € + IVA",
  totalAmount: 9375,
  totalVatMode: "acrescer",
});

// 3 — BILINGUE: o mesmo documento longo, desenhado em inglês.
casos.bilingue = casos.longa;

// 4 — NOMES COMPRIDOS + acentos e caracteres raros.
casos.nomes = withProposalDefaults({
  ...base,
  ref: "PO Decoração Casamento Maria da Conceição Gonçalves Ançã & Jean-François Ålström-Nørgaard 12.09.2026",
  clientNames: "Maria da Conceição Gonçalves Ançã & Jean-François Ålström-Nørgaard",
  location:
    "Herdade da Fonte Santa de Vale de Água, Estrada Nacional 380, Reguengos de Monsaraz, Alentejo Central, Portugal",
  eventType: "Casamento civil com cerimónia simbólica ao pôr do sol no lago",
  guests: "180 pax (140 adultos, 25 crianças, 15 fornecedores)",
  servico: "Decor, decoração Floral, iluminação técnica, mobiliário e têxteis — chave na mão",
  coverImages: [foto(0), foto(1)],
  serviceGroups: [
    {
      letter: "a)",
      title: "Decoração Floral de Casamento — Cerimónia, Copo d'Água, Jantar e Festa",
      items: [
        {
          label: "Cerimónia ao pôr do sol junto ao lago com passadeira de pétalas",
          desc: "Arco floral assimétrico em estrutura metálica com flor natural da época — ranúnculos, eucalipto cinerea, astilbe e rosa de jardim —, passadeira com pétalas naturais e composições laterais nos primeiros bancos de cada fila.",
        },
      ],
    },
  ],
  moodBoards: [
    {
      title: "Decoração da Cerimónia ao Pôr do Sol junto ao Lago da Herdade",
      subtitulo: "Ramo de Noiva (a definir com a Noiva) — inclui alfazema e olival",
      images: fotos(2, 5),
      annotation:
        "A paleta segue os tons de creme, verde-oliva e terracota que a Maria escolheu na primeira reunião; as flores em destaque podem variar consoante a época e a disponibilidade do mercado no dia da montagem.",
    },
  ],
  budgetItems: [
    "Decoração Floral da Cerimónia ao pôr do sol junto ao lago, com passadeira e composições laterais",
    "Decor Copo d'água",
  ],
  budgetAmounts: [7400, 2100],
  totalText: "9500,00 € + IVA",
  totalAmount: 9500,
  totalVatMode: "acrescer",
});

// 5 — CINCO DÍGITOS (dezenas de milhar) com adicionais grandes.
casos.cinco_digitos = withProposalDefaults({
  ...base,
  coverImages: [foto(0), foto(1)],
  serviceGroups: [grupo("a)", "Decoração Floral de Casamento", 3)],
  moodBoards: [{ title: "Decoração Cerimónia", images: fotos(2, 4) }],
  budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
  budgetAmounts: [42500, 31200, 24800],
  budgetExtras: [
    { label: "Deslocação da equipa Líquen (ida e volta, 3 carrinhas)", valueText: "12.550,00 €" },
    { label: "Wedding Coordinator", valueText: "18.900,00 € + IVA" },
  ],
  budgetExtrasSomam: true,
  totalText: "98500,00 € + IVA",
  totalAmount: 98500,
  totalVatMode: "acrescer",
});

// 6 — SEM FOTOGRAFIAS NENHUMAS.
casos.sem_fotos = withProposalDefaults({
  ...base,
  coverImages: ["", ""],
  serviceGroups: [grupo("a)", "Decoração Floral de Casamento", 3)],
  moodBoards: [],
  budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
  budgetAmounts: [1800, 1400, 1600],
  totalText: "4800,00 € + IVA",
  totalAmount: 4800,
  totalVatMode: "acrescer",
});

// 7 — QUARENTA FOTOGRAFIAS: 2 na capa + 8 boards de 6 (48 lugares, 40 fotos).
casos.quarenta_fotos = withProposalDefaults({
  ...base,
  coverImages: [foto(0), foto(1)],
  serviceGroups: [grupo("a)", "Decoração Floral de Casamento", 3)],
  moodBoards: Array.from({ length: 8 }, (_, b) => ({
    title: `Inspiração ${b + 1}`,
    images: fotos(2 + b * 5, 5),
  })),
  budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
  budgetAmounts: [1800, 1400, 1600],
  totalText: "4800,00 € + IVA",
  totalAmount: 4800,
  totalVatMode: "acrescer",
});

// 8 — OITENTA FOTOGRAFIAS: o tecto de MAX_IMAGES_PER_DOC (13 boards de 6 + capa).
casos.oitenta_fotos = withProposalDefaults({
  ...base,
  coverImages: [foto(0), foto(1)],
  serviceGroups: [grupo("a)", "Decoração Floral de Casamento", 3)],
  moodBoards: Array.from({ length: 13 }, (_, b) => ({
    title: `Inspiração ${b + 1}`,
    images: fotos(2 + b * 6, 6),
  })),
  budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
  budgetAmounts: [1800, 1400, 1600],
  totalText: "4800,00 € + IVA",
  totalAmount: 4800,
  totalVatMode: "acrescer",
});

const pedidos = (process.env.CASOS ?? Object.keys(casos).join(",")).split(",");

describe("medição do PDF de proposta", () => {
  const linhas: Record<string, unknown>[] = [];
  for (const nome of pedidos) {
    it(`gera ${nome}`, async () => {
      const doc = casos[nome];
      const idioma = nome === "bilingue" ? "en" : "pt";
      if (global.gc) global.gc();
      const memAntes = process.memoryUsage();
      const t0 = process.hrtime.bigint();
      const r = await renderProposalDocPdfWithReport(doc, idioma as "pt" | "en");
      const t1 = process.hrtime.bigint();
      const memDepois = process.memoryUsage();
      const ms = Number(t1 - t0) / 1e6;
      const destino = path.join(SAIDA, `${nome}.pdf`);
      writeFileSync(destino, r.bytes);
      const nFotos =
        doc.coverImages.filter(Boolean).length +
        doc.moodBoards.reduce((s, b) => s + (b.images?.length ?? 0), 0);
      const linha = {
        caso: nome,
        idioma,
        ms: Math.round(ms),
        bytes: r.bytes.length,
        kb: Math.round(r.bytes.length / 1024),
        fotos: nFotos,
        rssAntesMB: Math.round(memAntes.rss / 1048576),
        rssDepoisMB: Math.round(memDepois.rss / 1048576),
        heapDepoisMB: Math.round(memDepois.heapUsed / 1048576),
        truncations: r.truncations,
        undrawnImages: r.undrawnImages,
        semRedimensionar: r.semRedimensionar,
        reordenacoes: r.reordenacoes,
      };
      linhas.push(linha);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(linha));
      writeFileSync(path.join(SAIDA, "medicao.json"), JSON.stringify(linhas, null, 2));
    });
  }
});
