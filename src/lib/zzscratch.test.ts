import { describe, it } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";
import { renderProposalDocPdf } from "@/lib/proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

const OUT =
  "/tmp/claude-0/-home-user-liquen-events/74d09af5-5a21-52ee-9b68-e35984f7054b/scratchpad";

function taraEMarty(mode: "acrescer" | "incluido"): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Casamento Decoração Tara e Marty · 29.05.2027",
    clientNames: "Tara & Marty",
    eventType: "Casamento",
    eventDate: "29 de maio de 2027",
    location: "Quinta do Hespanhol",
    guests: "60 pax",
    ceremony: "Civil, simbólica",
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral e Decoração",
        items: [
          { label: "Decoração Cerimónia" },
          { label: "Decoração Copo d'Água" },
          { label: "Decoração Sala de Jantar" },
          { label: "Ramo de Noiva" },
        ],
      },
    ],
    moodBoards: [],
    budgetItems: [
      "Decoração Cerimónia",
      "Decoração Copo d'Água",
      "Decoração Sala de Jantar",
      "Ramo de Noiva",
    ],
    totalLabel: "Valor Total",
    totalText: mode === "acrescer" ? "2.460,00 € + IVA" : "3.025,80 €",
    totalAmount: mode === "acrescer" ? 2460 : 3025.8,
    totalVatMode: mode,
    budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "75,00 €" }],
    coverImages: ["", ""],
  });
}

/** A folha da casa: sem valores adicionais, para conferir que não mudou. */
function semAdicionais(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento Amélia e Duarte · 5.06.2027",
    clientNames: "Amélia & Duarte",
    eventType: "Casamento",
    eventDate: "5 de junho de 2027",
    location: "Herdade da Cortesia",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    coverImages: ["", ""],
    budgetItems: ["Design Floral e Decor Jantar", "Decor Mesa Buffet", "Bouquet da Noiva"],
    totalLabel: "Valor Total Decoração",
    totalText: "7.890,00 €",
    totalAmount: 7890,
    totalVatMode: "acrescer",
  });
}

describe("scratch", () => {
  it("gera os PDF", async () => {
    mkdirSync(OUT, { recursive: true });
    for (const modo of ["incluido", "acrescer"] as const) {
      writeFileSync(`${OUT}/tara-${modo}.pdf`, await renderProposalDocPdf(taraEMarty(modo)));
    }
    writeFileSync(`${OUT}/casa-sem-adicionais.pdf`, await renderProposalDocPdf(semAdicionais()));
  }, 200_000);
});

function instrumentar() {
  const paginas: PDFPage[] = [];
  const escritas: { pagina: number; x: number; y: number; texto: string }[] = [];
  const addPageOriginal = PDFDocument.prototype.addPage;
  const drawTextOriginal = PDFPage.prototype.drawText;
  PDFDocument.prototype.addPage = function (...args: Parameters<typeof addPageOriginal>) {
    const p = addPageOriginal.apply(this, args) as PDFPage;
    paginas.push(p);
    return p;
  };
  PDFPage.prototype.drawText = function (t: string, o?: Parameters<typeof drawTextOriginal>[1]) {
    escritas.push({ pagina: paginas.indexOf(this), x: o?.x ?? 0, y: o?.y ?? 0, texto: String(t) });
    return drawTextOriginal.call(this, t, o);
  };
  return { escritas, restaurar() { PDFDocument.prototype.addPage = addPageOriginal; PDFPage.prototype.drawText = drawTextOriginal; } };
}

describe("probe", () => {
  it("mede", async () => {
    for (const [nome, d] of [["tara", taraEMarty("acrescer")], ["casa", semAdicionais()]] as const) {
      const s = instrumentar();
      await renderProposalDocPdf(d);
      s.restaurar();
      const orc = s.escritas.find((e) => /Orçamento Proposto/.test(e.texto))!;
      const notas = s.escritas.find((e) => e.texto === "Notas importantes")!;
      const naFolha = s.escritas.filter((e) => e.pagina === orc.pagina && e.y >= 68);
      const total = s.escritas.find((e) => e.texto === "Total a pagar" || /Valor Total/.test(e.texto));
       
      console.log(nome, "orc pág", orc.pagina, "| notas pág", notas.pagina, "y", notas.y.toFixed(1),
        "| último y da folha do orç", Math.min(...naFolha.map((e) => e.y)).toFixed(1),
        "| total y", total?.y.toFixed(1));
    }
  }, 200_000);
});
