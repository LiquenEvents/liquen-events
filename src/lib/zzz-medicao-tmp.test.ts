// @vitest-environment node
import { test } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createProposalToken } from "@/lib/proposal-token";
import { withProposalDefaults } from "@/lib/proposal-doc";

const DATA = path.join(process.cwd(), "data");

function boardsDe(refs: string[]) {
  const boards: { title: string; subtitle?: string; images: string[] }[] = [];
  for (let b = 0; b * 7 < refs.length; b++) {
    boards.push({
      title: `Ambiente ${b + 1}`,
      subtitle: "Paleta e materiais",
      images: refs.slice(b * 7, b * 7 + 7),
    });
  }
  return boards;
}

function docDe(refs: string[], capa: string[]) {
  return withProposalDefaults({
    ref: "PO Decoração Casamento Medição · 12.09.2026",
    clientNames: "Sofia & Miguel",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Herdade dos Templários",
    guests: "150 pax",
    coverImages: capa,
    moodBoards: boardsDe(refs),
    budgetItems: ["Decor Cerimónia", "Decor Copo de Água", "Decor Jantar", "Flores", "Mobiliário"],
    totalLabel: "Total",
    totalText: "24.600,00 €",
  } as never);
}

function proposta(id: string, doc: unknown | undefined) {
  return {
    id,
    quoteId: "",
    clientName: "Sofia Martins",
    clientEmail: "sofia@example.com",
    currency: "EUR",
    lineItems: [{ description: "Decoração completa", quantity: 1, unitPrice: 20000 }],
    vatRate: 0.23,
    subtotal: 20000,
    vat: 4600,
    total: 24600,
    validUntil: "2027-12-31",
    status: "enviada",
    createdAt: new Date("2026-08-01T10:00:00Z").toISOString(),
    sentAt: new Date("2026-08-01T10:00:00Z").toISOString(),
    idioma: "pt",
    ...(doc !== undefined ? { doc } : {}),
  };
}

test("gera fixtures de proposta para medicao", () => {
  const N = 46;
  const caminhos = Array.from(
    { length: N },
    (_, i) => `propostas/medicao/foto-${String(i).padStart(3, "0")}.jpg`,
  );
  const urls = Array.from(
    { length: N },
    (_, i) =>
      `https://exemplo.supabase.co/storage/v1/object/sign/fotos/medicao/foto-${String(i).padStart(3, "0")}.jpg?token=abc${i}`,
  );

  const fixtures = [
    // C1 — proposta SEM documento (quadro de preço apenas)
    proposta("medicao-c1-sem-doc", undefined),
    // C2 — documento SEM fotografias
    proposta("medicao-c2-doc-0-fotos", docDe([], ["", ""])),
    // C3 — documento com 46 fotografias por ASSINAR (caminhos do bucket)
    proposta("medicao-c3-46-caminhos", docDe(caminhos.slice(0, 44), [caminhos[44], caminhos[45]])),
    // C4 — documento com 46 fotografias de endereço DIRECTO (desenham-se)
    proposta("medicao-c4-46-directas", docDe(urls.slice(0, 44), [urls[44], urls[45]])),
    // C5 — 120 fotografias directas
    proposta(
      "medicao-c5-120-directas",
      docDe(
        Array.from(
          { length: 118 },
          (_, i) =>
            `https://exemplo.supabase.co/storage/v1/object/sign/fotos/medicao/g-${i}.jpg?token=x${i}`,
        ),
        [urls[0], urls[1]],
      ),
    ),
  ];

  writeFileSync(path.join(DATA, "proposals.json"), JSON.stringify(fixtures, null, 2));

  const linhas = fixtures.map((p) => `${p.id}\t${createProposalToken(p.id)}`);
  linhas.push(`invalido\tnao-e-um-token`);
  writeFileSync(path.join(process.cwd(), "zzz-token-tmp.txt"), linhas.join("\n") + "\n");
  for (const p of fixtures) {
    console.log(
      "FIXTURE",
      p.id,
      "docBytes",
      JSON.stringify((p as { doc?: unknown }).doc ?? null).length,
    );
  }
});
