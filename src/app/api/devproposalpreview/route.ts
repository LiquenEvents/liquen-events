import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderProposalDocPdf } from "@/lib/proposal-doc-pdf";
import { withProposalDefaults } from "@/lib/proposal-doc";

export const runtime = "nodejs";

// TEMPORARY dev-only preview of the multi-page proposal generator with sample
// data. Delete after visual verification. ?t=org renders the Organização template.
function img(name: string): string {
  return readFileSync(path.join(process.cwd(), "public", "imagens", name)).toString("base64");
}

export async function GET(request: NextRequest) {
  // Dev-only: never expose the sample generator in production.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  const org = request.nextUrl.searchParams.get("t") === "org";
  const pool = [
    "20_10_2025_0044.jpg",
    "20_10_2025_0220.jpg",
    "20_10_2025_0407.jpg",
    "stephanie-mizio-555.jpg",
    "stephanie-mizio-760.jpg",
    "DaniGui_Adois_61.jpg",
    "DaniGui_JantarFesta_26.jpg",
    "hd-edited.jpg",
    "teresinhaeze-909.jpg",
    "matilde-e-tomas0654-1.jpg",
    "J&P-IMGL4769.jpg",
    "EW1_1330.jpg",
  ].map(img);

  const base = {
    clientNames: "Sofia & Miguel",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Herdade dos Templários, Évora",
    guests: "150 pax",
    coverImages: [pool[0], pool[4]],
  };

  const doc = org
    ? withProposalDefaults({
        ...base,
        template: "organizacao" as const,
        ref: "PO Organização Casamento Sofia & Miguel · 12.09.2026",
        headerTitle: "Proposta de orçamento para Organização de Casamento",
        serviceGroups: [
          {
            letter: "a)",
            title: "Planeamento e Coordenação",
            items: [
              {
                label: "Reunião inicial",
                desc: "Compreensão da visão do casal, estilo e temas desejados.",
              },
              {
                label: "Definição do cronograma",
                desc: "Plano detalhado para todas as fases do evento.",
              },
              {
                label: "Gestão de fornecedores",
                desc: "Pesquisa, recomendação e coordenação de fornecedores.",
              },
              {
                label: "Orçamento",
                desc: "Criação e gestão de custos dentro dos valores acordados.",
              },
            ],
          },
          {
            letter: "b)",
            title: "Design e Estilo do Casamento",
            items: [
              {
                label: "Tema e decoração",
                desc: "Conceito visual e estético único que reflita o casal.",
              },
              { label: "Decoração floral", desc: "Flores para cerimónia, receção e ambientes." },
            ],
          },
        ],
        moodBoards: [],
        cronograma: [
          {
            title: "6-12 meses antes do casamento",
            items: [
              "Reuniões iniciais e definição do orçamento.",
              "Escolha do local e fornecedores principais.",
            ],
          },
          {
            title: "1-3 meses antes do casamento",
            items: [
              "Envio de convites e confirmação de convidados.",
              "Revisão final com todos os fornecedores.",
            ],
          },
          {
            title: "Dia do casamento",
            items: [
              "Coordenação de todos os aspetos do evento.",
              "Supervisão de montagem e decoração.",
            ],
          },
        ],
        budgetItems: [],
        totalLabel: "",
        totalText: "",
        budgetRows: [
          { item: "Planeamento e Coordenação", price: "2.500,00 €" },
          { item: "Decoração e Flores", price: "4.000,00 €" },
          { item: "Catering", price: "6.000,00 €" },
          { item: "Fotografia e Vídeo", price: "2.200,00 €" },
        ],
        totalEstimatedText: "14.700,00 €",
        budgetNote:
          "Os valores são estimativas e podem ser ajustados conforme as escolhas finais dos noivos.",
      })
    : withProposalDefaults({
        ...base,
        template: "decoracao" as const,
        ref: "PO Decoração Casamento Sofia & Miguel · 12.09.2026",
        ceremony: "Civil, simbólica",
        time: "A definir",
        serviceGroups: [
          {
            letter: "a)",
            title: "Decoração Floral de Casamento",
            items: [
              { label: "Decoração Cerimónia" },
              { label: "Decor Floral Bar" },
              { label: "Decoração Jantar" },
              { label: "Apontamento Floral Mesa Buffet" },
              { label: "Complementos Dos Noivos" },
            ],
          },
        ],
        moodBoards: [
          {
            title: "Decoração Cerimónia",
            images: pool.slice(0, 5),
            annotation: "Entrada no corredor nupcial",
          },
          { title: "Decor Floral Bar", images: pool.slice(3, 7) },
          { title: "Decoração Jantar", images: pool.slice(5, 11) },
        ],
        budgetItems: [
          "Decor Cerimónia",
          "Arranjo Floral Bar",
          "Design Floral e Decor Jantar",
          "Bouquet da Noiva",
        ],
        totalLabel: "Valor Total Decoração",
        totalText: "3.000,00 € + IVA",
      });

  const bytes = await renderProposalDocPdf(doc);
  return new NextResponse(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf" },
  });
}
