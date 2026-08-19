import { describe, it } from "vitest";
import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { renderProposalDocPdfWithReport } from "@/lib/proposal-doc-pdf";
import { withProposalDefaults } from "@/lib/proposal-doc";

/** O modelo ORGANIZAÇÃO: cronograma + coluna de preços preenchida. */
const SAIDA = path.join(process.cwd(), "medicao", "saida", "limites");
mkdirSync(SAIDA, { recursive: true });

const doc = withProposalDefaults({
  template: "organizacao",
  ref: "PO Organização Casamento Maria & Zé 12.09.2026",
  headerTitle: "Proposta de orçamento para Organização de Casamento",
  clientNames: "Maria & Zé",
  eventType: "Casamento",
  eventDate: "12 de setembro de 2026",
  location: "Monte da Oliveirinha, Évora",
  guests: "80 pax",
  servico: "Organização integral",
  coverImages: ["", ""],
  serviceGroups: [
    {
      letter: "a)",
      title: "Organização e Coordenação",
      items: [
        { label: "Planeamento", desc: "Acompanhamento desde a reserva até ao dia do evento, com reuniões mensais." },
        { label: "Fornecedores", desc: "Selecção, negociação e gestão de contratos com todos os fornecedores." },
      ],
    },
  ],
  cronograma: [
    { title: "12 a 6 meses antes do casamento", items: ["Definição de conceito e orçamento;", "Reserva do espaço e dos fornecedores principais;", "Escolha de catering e prova."] },
    { title: "6 a 3 meses antes", items: ["Convites e RSVP;", "Prova de vestido e fato;", "Plano de mesas preliminar."] },
    { title: "Último mês", items: ["Confirmação de convidados;", "Cronograma do dia hora a hora;", "Reunião final com todos os fornecedores."] },
    { title: "Dia do evento", items: ["Coordenação de montagem;", "Gestão do programa;", "Desmontagem e fecho de contas."] },
  ],
  budgetItems: [],
  budgetRows: [
    { item: "Coordenação e planeamento integral", price: "6.500,00 €" },
    { item: "Coordenação no dia do evento (equipa de 3 pessoas, 14 horas)", price: "1.850,00 € + IVA (a confirmar)" },
    { item: "Gestão de fornecedores e contratos", price: "[Valor]" },
    { item: "Assessoria de imagem e papelaria", price: "" },
  ],
  totalEstimatedText: "12.500,00 €",
  totalLabel: "Valor Total",
  totalText: "",
  totalAmount: 12500,
  totalVatMode: "acrescer",
  budgetNote: "Os valores são estimativas e podem ser ajustados em função das escolhas finais do casal.",
});

describe("modelo Organização", () => {
  it("gera", async () => {
    const t0 = Date.now();
    const r = await renderProposalDocPdfWithReport(doc, "pt");
    writeFileSync(path.join(SAIDA, "organizacao.pdf"), r.bytes);
    appendFileSync(
      path.join(SAIDA, "limites.jsonl"),
      JSON.stringify({ caso: "organizacao", ms: Date.now() - t0, kb: Math.round(r.bytes.length / 1024), truncations: r.truncations, undrawnImages: r.undrawnImages }) + "\n",
    );
  });
});
