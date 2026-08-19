import { describe, it } from "vitest";
import { writeFileSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { renderProposalDocPdfWithReport } from "@/lib/proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/** Casos-limite: o que falharia. Escreve em medicao/saida/limites/. */
const RAIZ = process.cwd();
const SAIDA = path.join(RAIZ, "medicao", "saida", "limites");
mkdirSync(SAIDA, { recursive: true });
const DIR = path.join(RAIZ, "public", "imagens");
const cat = readdirSync(DIR)
  .filter((f) => /\.jpe?g$/i.test(f))
  .sort();
const foto = (i: number) =>
  `data:image/jpeg;base64,${readFileSync(path.join(DIR, cat[i % cat.length])).toString("base64")}`;

const base = {
  template: "decoracao" as const,
  ref: "PO Decoração Casamento Maria & Zé 12.09.2026",
  clientNames: "Maria & Zé",
  eventType: "Casamento",
  eventDate: "12 de setembro de 2026",
  location: "Monte da Oliveirinha, Évora",
  guests: "80 pax",
  totalLabel: "Valor Total Decoração",
};

const LONGO =
  "Decoração Floral Integral da Cerimónia, do Copo d'Água, do Jantar e da Festa com Flor Natural da Época Colhida no Próprio Dia";

const casos: Record<string, { doc: ProposalDoc; idioma?: "pt" | "en" }> = {};

// A — cabeçalho corrido com uma referência enorme
casos.ref_enorme = {
  doc: withProposalDefaults({
    ...base,
    ref: "PO Decoração Casamento Maria da Conceição Gonçalves Ançã Ribeiro da Silva & Jean-François Ålström-Nørgaard van der Berg 12.09.2026 — versão 3 revista",
    coverImages: [foto(0), foto(1)],
    serviceGroups: [
      { letter: "a)", title: "Decoração", items: [{ label: "Cerimónia", desc: "Arco floral." }] },
    ],
    moodBoards: [],
    budgetItems: ["Decor Cerimónia"],
    totalText: "4800,00 € + IVA",
    totalAmount: 4800,
    totalVatMode: "acrescer",
  }),
};

// B — título e subtítulo de mood board enormes, com legenda de 10 linhas
casos.moodboard_textos = {
  doc: withProposalDefaults({
    ...base,
    coverImages: ["", ""],
    serviceGroups: [
      { letter: "a)", title: "Decoração", items: [{ label: "Cerimónia", desc: "Arco floral." }] },
    ],
    moodBoards: [
      {
        title: LONGO,
        subtitulo:
          "Ramo de Noiva (a definir com a Noiva), com alfazema, olival, eucalipto cinerea e rosa de jardim colhida na manhã do evento",
        images: [foto(2), foto(3), foto(4)],
        annotation: Array.from(
          { length: 10 },
          (_, i) =>
            `Linha número ${i + 1} da descrição desta página de inspiração, escrita com o comprimento que ela costuma escrever quando quer explicar a paleta ao casal.`,
        ).join(" "),
      },
    ],
    budgetItems: ["Decor Cerimónia"],
    totalText: "4800,00 € + IVA",
    totalAmount: 4800,
    totalVatMode: "acrescer",
  }),
};

// C — rótulos de dinheiro enormes e valores em texto livre
casos.dinheiro_texto = {
  doc: withProposalDefaults({
    ...base,
    coverImages: ["", ""],
    totalLabel:
      "Investimento Total em Decoração Floral, Iluminação Técnica, Mobiliário e Têxteis (chave na mão)",
    serviceGroups: [
      { letter: "a)", title: "Decoração", items: [{ label: "Cerimónia", desc: "Arco floral." }] },
    ],
    moodBoards: [],
    budgetItems: [
      "Decoração Floral Integral da Cerimónia, do Copo d'Água, do Jantar e da Festa com flor natural da época",
      "Rubrica sem preço nenhum",
    ],
    budgetAmounts: [12500, null],
    budgetExtras: [
      {
        label:
          "Deslocação da equipa Líquen ao Alentejo Central, ida e volta, com pernoita para seis pessoas",
        valueText: "12.500,00 € + IVA (a confirmar consoante a distância final)",
      },
      { label: "Sem valor nenhum", valueText: "" },
      { label: "Valor que não é um número", valueText: "a definir com o cliente" },
    ],
    budgetExtrasSomam: true,
    totalText: "1234567,89 € + IVA",
    totalAmount: 1234567.89,
    totalVatMode: "acrescer",
  }),
};

// D — caracteres raros
casos.caracteres = {
  doc: withProposalDefaults({
    ...base,
    clientNames: "文文 & Ωμέγα 🌿",
    eventType: "Casamento 💍 & Festa",
    location: "الحديقة الكبيرة, Évora​ —\ttabulação",
    guests: "80 pax\nsegunda linha",
    coverImages: [foto(0), ""],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração 🌸",
        items: [{ label: "Cerimónia ✿", desc: "Arco floral — “aspas curvas”, ½, ±, №, ﬁ." }],
      },
    ],
    moodBoards: [{ title: "Inspiração 🌿 Ωμέγα", images: [foto(2), foto(3)] }],
    budgetItems: ["Decor 🌷 Cerimónia"],
    totalText: "4800,00 € + IVA",
    totalAmount: 4800,
    totalVatMode: "acrescer",
  }),
};

// E — uma foto que já não existe / bytes corrompidos
const corrompida = `data:image/jpeg;base64,${Buffer.from("isto não é um jpeg").toString("base64")}`;
casos.foto_morta = {
  doc: withProposalDefaults({
    ...base,
    coverImages: [corrompida, foto(1)],
    serviceGroups: [
      { letter: "a)", title: "Decoração", items: [{ label: "Cerimónia", desc: "Arco floral." }] },
    ],
    moodBoards: [{ title: "Inspiração", images: [foto(2), corrompida, foto(3), corrompida] }],
    budgetItems: ["Decor Cerimónia"],
    totalText: "4800,00 € + IVA",
    totalAmount: 4800,
    totalVatMode: "acrescer",
  }),
};

// F — documento praticamente vazio
casos.vazio = {
  doc: withProposalDefaults({
    template: "decoracao",
    ref: "",
    clientNames: "",
    eventType: "",
    eventDate: "",
    location: "",
    guests: "",
    totalLabel: "",
    coverImages: ["", ""],
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    totalText: "",
  }),
};

// G — campo curto com texto imenso (convidados, hora, cerimónia)
casos.campos_compridos = {
  doc: withProposalDefaults({
    ...base,
    guests:
      "180 pax, dos quais 140 adultos, 25 crianças entre os 3 e os 12 anos, 15 fornecedores com refeição incluída e ainda 6 elementos da equipa de vídeo que chegam ao final da tarde",
    ceremony:
      "Cerimónia civil simbólica celebrada por uma amiga do casal, ao pôr do sol, junto ao lago, com música ao vivo de quarteto de cordas e leitura de votos escritos pelos noivos",
    time: "Chegada dos convidados às 15h30, cerimónia às 16h00, copo d'água às 17h30 e jantar às 20h00",
    coverImages: ["", ""],
    serviceGroups: [
      { letter: "a)", title: "Decoração", items: [{ label: "Cerimónia", desc: "Arco floral." }] },
    ],
    moodBoards: [],
    budgetItems: ["Decor Cerimónia"],
    totalText: "4800,00 € + IVA",
    totalAmount: 4800,
    totalVatMode: "acrescer",
  }),
};

describe("casos-limite do PDF", () => {
  for (const [nome, c] of Object.entries(casos)) {
    it(nome, async () => {
      const t0 = Date.now();
      const r = await renderProposalDocPdfWithReport(c.doc, c.idioma ?? "pt");
      writeFileSync(path.join(SAIDA, `${nome}.pdf`), r.bytes);
      const { appendFileSync } = await import("node:fs");
      appendFileSync(
        path.join(SAIDA, "limites.jsonl"),
        JSON.stringify({
          caso: nome,
          ms: Date.now() - t0,
          kb: Math.round(r.bytes.length / 1024),
          truncations: r.truncations,
          undrawnImages: r.undrawnImages,
          semRedimensionar: r.semRedimensionar,
        }) + "\n",
      );
    });
  }
});
